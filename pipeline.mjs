// Orquestación del pipeline. Sin HTTP, sin red obligatoria: todo se inyecta.
// Fase 1 reemplaza `emit` por un escritor de SSE; el resto no cambia.

import { looksLikeGarbage, lexicalScope } from "./scope.mjs";
import { VIEWS, localSpec, interpret, jevScopeMany, deepseek, jevVerify } from "./models.mjs";
import { validateToolCall, detectToolCall } from "./server/tools.mjs";
import { exploreQuestion, exploreNode, matchNodeByText } from "./public/explore.mjs";
import { sanitizeLayout } from "./public/components/registry.mjs";
import { detectFacet, facetSpec, buildFacet } from "./facets.mjs";
import { deepseekCost, deepseekTokens, jevCost, jevTokens } from "./pricing.mjs";

const env = (k, d) => process.env[k] || d;
const SCOPE_T = () => Number(env("JEV_SCOPE_THRESHOLD", 0.35));
const CONSULTA_T = () => Number(env("JEV_CONSULTA_THRESHOLD", 0.5));
const STAGE_MS = () => Number(env("STAGE_TIMEOUT_MS", 20000));
const BUDGET_MS = () => Number(env("TOTAL_BUDGET_MS", 30000));

// Corta una etapa colgada sin dejar promesas rechazadas sueltas.
function timed(fn, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    Promise.resolve()
      .then(fn)
      .then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
  });
}

export function sanitize(spec, g) {
  const s = spec && typeof spec === "object" ? spec : {};
  const view = VIEWS.includes(s.view) ? s.view : "map";
  const projectId = ["landing", "comercial", "gerencial"].includes(s.projectId) ? s.projectId : null;
  const focus = Array.isArray(s.focus) ? s.focus.filter((x) => typeof x === "string").slice(0, 12) : [];
  const layout = sanitizeLayout(s.layout);
  const out = {
    v: 2,
    view,
    title: typeof s.title === "string" ? s.title.slice(0, 120) : g.meta.title,
    story: typeof s.story === "string" ? s.story.slice(0, 900) : "",
    projectId,
    focus,
  };
  if (layout.length) out.layout = layout;
  return out;
}

const COPY = {
  garbage: {
    title: "No es una consulta",
    story: "No pude interpretar eso como una pregunta. Prueba escribiendo qué quieres saber del diagnóstico.",
  },
  unanswered: {
    title: "No pude responder eso",
    story: "Entendí la consulta, pero no pude armar una respuesta respaldada por los diagnósticos.",
  },
  out_of_scope: {
    title: "Fuera del alcance",
    story: "Eso no se responde con los diagnósticos de estos tres proyectos.",
  },
};

export function outOfScopeSpec(question, interpretacion, intents, g, reason = "out_of_scope") {
  const copy = COPY[reason] || COPY.out_of_scope;
  return {
    view: "out_of_scope",
    reason,
    title: copy.title,
    story: copy.story,
    question,
    entendido: reason === "garbage" ? "" : interpretacion?.lectura || "",
    intenciones: intents,
    scope: {
      projects: g.projects.map((p) => ({ id: p.id, name: p.name, role: p.role })),
      examples: [
        "¿Qué riesgos corro en el Comercial?",
        "¿Qué falta para robustecer el Gerencial Brain?",
        "¿Cómo se conectan la Landing y el Comercial?",
        "¿Qué hay hoy en la Landing?",
      ],
    },
  };
}

/**
 * @param {object} p
 * @param {string} p.question
 * @param {object} p.graph
 * @param {(event:object)=>void} [p.emit]
 * @param {object} [p.deps]  override para tests / SSE
 */
export async function runPipeline({ question, graph, emit = () => {}, deps = {}, params = null }) {
  const t0 = Date.now();
  let seq = 0;
  let cost = 0;
  let tokens = 0;
  const by = {
    deepseek: { cost: 0, tokens: 0, calls: 0, model: null },
    jev: { cost: 0, tokens: 0, calls: 0, model: null },
  };
  const spend = (provider, usage, model) => {
    if (!usage) return null;
    const p = by[provider];
    const usd = provider === "deepseek" ? deepseekCost(usage) : jevCost(usage);
    const tk = provider === "deepseek" ? deepseekTokens(usage) : jevTokens(usage);
    cost += usd;
    tokens += tk;
    p.cost += usd;
    p.tokens += tk;
    p.calls += 1;
    if (model) p.model = model;
    return { cost: usd, tokens: tk };
  };
  const ev = (type, data = {}) => {
    try {
      emit({ v: 1, seq: ++seq, t: Date.now() - t0, type, data });
    } catch {
      /* un consumidor roto no debe romper el pipeline */
    }
  };
  const done = (spec) => {
    ev("run.finished", { ms: Date.now() - t0, cost, tokens, by });
    return spec;
  };

  // Los reintentos de modelo se reportan como etapa: el usuario ve que hubo
  // un tropiezo real, no un adorno.
  const d = {
    looksLikeGarbage,
    lexicalScope,
    interpret: (q) => interpret(q, { onRetry: (attempt) => ev("stage.retry", { stage: "interpret", attempt }) }),
    scopeMany: jevScopeMany,
    // El compositor sólo ve el diagnóstico vigente: sin el grafo viejo no puede
    // devolver el panorama de tres proyectos ni las costuras.
    compose: (input) =>
      deepseek(input, composeGraph, { onRetry: (attempt) => ev("stage.retry", { stage: "compose", attempt }) }),
    cache: null,
    fallback: (input) => localSpec(input, graph),
    verify: jevVerify,
    ...deps,
  };

  const composeGraph = { meta: graph.meta, diagnostics: graph.diagnostics || [] };

  ev("run.started", { question });

  try {
    // 0. Un control de faceta recalcula del grafo: es explorar, no preguntar.
    //    No vuelve a razonar porque la pregunta ya fue interpretada al construirse.
    if (params?.facet) {
      const spec = facetSpec(String(params.facet), params, graph);
      if (spec) {
        ev("facet.recalc", { facet: params.facet, params });
        ev("render.ready", { view: spec.view, facet: params.facet });
        return done(spec);
      }
    }

    // 1. Ruido: determinista, sin llamar a nadie.
    if (d.looksLikeGarbage(question)) {
      ev("guard.noise", { stage: "lexical" });
      const spec = outOfScopeSpec(question, null, [], graph, "garbage");
      ev("render.ready", { view: spec.view, reason: spec.reason });
      return done(spec);
    }

    // 2. Intérprete.
    let interpretacion = null;
    try {
      interpretacion = await timed(() => d.interpret(question), STAGE_MS(), "interpret");
    } catch (e) {
      ev("stage.failed", { stage: "interpret", reason: e.message });
    }
    const interpretSpend = spend("deepseek", interpretacion?.usage, interpretacion?.model);
    ev("interpret.done", {
      lectura: interpretacion?.lectura || "",
      intenciones: (interpretacion?.intenciones || []).map((i) => i.texto),
      ...(interpretSpend || {}),
    });

    // El modelo puede proponer una herramienta. Aca no se ejecuta nada:
    // se valida y el efecto secundario queda a la confirmacion humana.
    // Una acción sobre la interfaz ES la respuesta: no se compone una vista aparte.
    let toolUI = null;

    if (interpretacion?.accion) {
      const call = validateToolCall(interpretacion.accion);
      if (call.ok && call.tool) {
        ev("tool.requested", { tool: call.tool, args: call.args, source: "model" });
        if (call.tool !== "email") toolUI = { tool: call.tool, args: call.args };
      } else {
        ev("tool.rejected", { reason: call.error || "invalida" });
      }
    } else {
      // Respaldo: si el pedido de envío está escondido en la frase, el modelo
      // puede pasarlo por alto. El detector no.
      const detected = detectToolCall(question);
      if (detected) ev("tool.requested", { ...detected, source: "detector" });
    }

    if (toolUI) {
      const spec = {
        v: 2,
        view: "map",
        accion: toolUI,
        title: "",
        story: "",
        layout: [],
        verification: { status: "deterministic", scores: {}, note: "acción sobre la interfaz" },
      };
      ev("render.ready", { view: "map", facet: "accion" });
      return done(spec);
    }

    let intents = interpretacion?.intenciones?.length
      ? interpretacion.intenciones
      : [{ texto: question, proyecto: "ninguno", tipo: "otro" }];

    // 2. Gate de alcance.
    let scopeRes = null;
    try {
      scopeRes = await timed(() => d.scopeMany(question, intents, graph), STAGE_MS(), "scope");
    } catch (e) {
      ev("stage.failed", { stage: "scope", reason: e.message });
    }

    let fidelityWarning = false;

    if (!scopeRes) {
      intents = intents.map((it) => ({ ...it, ...d.lexicalScope(it.texto, graph) }));
    } else {
      if (scopeRes.esConsulta < CONSULTA_T()) {
        ev("scope.resolved", { esConsulta: scopeRes.esConsulta, intents: scopeRes.intents, source: "jev" });
        const spec = outOfScopeSpec(question, interpretacion, intents, graph, "garbage");
        ev("render.ready", { view: spec.view, reason: spec.reason });
        return done(spec);
      }
      intents = scopeRes.intents.map((it) => ({ ...it, inScope: it.score >= SCOPE_T() }));
      // Una sola intención que el original no respalda = reescritura que infló el alcance.
      if (intents.length === 1 && scopeRes.original < SCOPE_T()) {
        intents[0].inScope = false;
        fidelityWarning = true;
      }
    }

    const scopeSpend = scopeRes ? spend("jev", scopeRes.usage, scopeRes.model) : null;
    ev("scope.resolved", {
      source: scopeRes ? "jev" : "lexical",
      original: scopeRes?.original ?? null,
      intents,
      ...(scopeSpend || {}),
    });

    const inScope = intents.filter((i) => i.inScope);

    if (!inScope.length) {
      const spec = { ...outOfScopeSpec(question, interpretacion, intents, graph), fidelity_warning: fidelityWarning };
      ev("render.ready", { view: spec.view, reason: spec.reason });
      return done(spec);
    }

    // 3a0. El intérprete ya dijo de qué paso habla la pregunta.
    //      Jev ya validó que la consulta es del dominio, así que acá sólo
    //      queda abrir la ficha de ese paso.
    const pasoModelo = (interpretacion?.intenciones || []).map((i) => i.paso).find(Boolean);
    if (pasoModelo) {
      const hit = matchNodeByText(pasoModelo, graph.diagnostics || []);
      if (hit) {
        const spec = exploreNode(hit.project, hit.node.id);
        if (spec) {
          ev("decompose.done", { facet: "diagnostico", paso: hit.node.id, source: "interprete" });
          ev("render.ready", { view: spec.view, facet: "diagnostico" });
          return done(spec);
        }
      }
    }

    // 3a. Exploración determinística del diagnóstico: vistas calculadas del grafo.
    const explorado = exploreQuestion(question, graph.diagnostics || [], params?.projectId || null);
    if (explorado) {
      ev("decompose.done", { facet: "diagnostico", projectId: explorado.projectId, source: "grafo" });
      ev("render.ready", { view: explorado.view, facet: "diagnostico" });
      return done(explorado);
    }

    // 3b. Desglose: si la pregunta corresponde a una faceta, el agente ya buscó
    //    y verificó; ahora separa el dato y lo presenta. Sin pasar por el compositor,
    //    para que el filtro y lo que se muestra no puedan contradecirse.
    const detected = detectFacet(question, graph);
    if (detected) {
      const built = buildFacet(detected.facet, detected.params, graph);
      const spec = built ? facetSpec(detected.facet, detected.params, graph) : null;
      if (spec) {
        ev("decompose.done", { facet: detected.facet, params: detected.params, ...(built.meta || {}) });
        ev("render.ready", { view: spec.view, facet: detected.facet });
        return done(spec);
      }
    }

    // 4. Composición.
    const input =
      inScope.map((i) => i.texto).join(" | ") +
      (inScope.length !== intents.length ? ` (de una consulta original: "${question}")` : "");

    ev("compose.started", { intents: inScope.map((i) => i.texto), chars: input.length });

    let generated = null;
    let composeSpend = null;
    let fromCache = false;
    try {
      const out = await timed(() => d.compose(input), STAGE_MS(), "compose");
      generated = out?.spec ?? out;
      composeSpend = spend("deepseek", out?.usage, out?.model);
    } catch (e) {
      ev("stage.failed", { stage: "compose", reason: e.message });
      const hit = typeof d.cache === "function" ? d.cache(question) : null;
      if (hit) {
        generated = hit;
        fromCache = true;
        ev("cache.hit", { question });
      }
    }

    const spec = (() => {
      const hasLayout = generated && sanitizeLayout(generated.layout).length > 0;
      const hasView = generated && VIEWS.includes(generated.view);

      if (hasLayout || hasView) return sanitize(generated, graph);

      // El modelo no produjo ni layout válido ni vista conocida: se usa el
      // router determinista, conservando su título y su narrativa.
      const fb = sanitize(d.fallback(input), graph);
      fb.title = generated?.title || fb.title;
      fb.story = generated?.story || fb.story;
      fb.degraded = true;
      return fb;
    })();
    spec.intents = intents;
    spec.lectura = interpretacion?.lectura || "";

    if (fromCache) {
      spec.verification = { status: "cached", scores: {}, note: "respuesta cacheada: sin red" };
      ev("render.ready", { view: spec.view, cached: true });
      return done(spec);
    }

    // Presupuesto total: si ya nos pasamos, no se audita.
    if (Date.now() - t0 > BUDGET_MS()) {
      spec.verification = { status: "unverified", scores: {}, note: "se omitió la auditoría por presupuesto" };
      spec.budget = true;
      ev("budget.exceeded", { ms: Date.now() - t0 });
      ev("render.ready", { view: spec.view, budget: true });
      return done(spec);
    }


    ev("compose.done", {
      view: spec.view,
      title: spec.title,
      degraded: Boolean(spec.degraded),
      blocks: spec.layout?.length || 0,
      rawBlocks: Array.isArray(generated?.layout) ? generated.layout.length : 0,
      rawKeys: generated ? Object.keys(generated) : [],
      ...(composeSpend || {}),
    });

    // 4. Auditoría.
    const verification = await Promise.resolve()
      .then(() => timed(() => d.verify(question, spec, graph), STAGE_MS(), "verify"))
      .catch((e) => {
        ev("stage.failed", { stage: "verify", reason: e.message });
        return { status: "unverified", scores: {}, note: "Jev no respondió" };
      });

    const auditSpend = spend("jev", verification.usage, verification.model);
    ev("audit.done", { status: verification.status, scores: verification.scores || {}, ...(auditSpend || {}) });

    if (verification.status === "rejected") {
      const responde = verification.scores?.responde ?? 0;
      if (responde < 0.3) {
        const fail = { ...outOfScopeSpec(question, interpretacion, intents, graph, "unanswered"), verification };
        ev("render.ready", { view: fail.view, reason: fail.reason });
        return done(fail);
      }
      const stripped = { ...spec, story: "", verification };
      ev("render.ready", { view: stripped.view, storyDropped: true });
      return done(stripped);
    }

    ev("render.ready", { view: spec.view });
    return done({ ...spec, verification });
  } catch (e) {
    ev("run.failed", { message: String(e?.message || e).slice(0, 200) });
    throw e;
  }
}
