import test from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../pipeline.mjs";
import { looksLikeGarbage, lexicalScope } from "../scope.mjs";

const GRAPH = {
  meta: { title: "Diagnóstico", narrative: "narrativa base" },
  projects: [
    { id: "landing", name: "Landing", role: "entrada" },
    { id: "comercial", name: "Comercial", role: "cotización" },
    { id: "gerencial", name: "Gerencial Brain", role: "registro" },
  ],
  seams: [],
};

const OK_VERIFY = { status: "ok", scores: { respaldada: 0.9, responde: 0.85, severidad: 0.9 } };

function harness({ interpret, scopeMany, compose, verify } = {}) {
  const events = [];
  const calls = { interpret: 0, scope: 0, compose: [], verify: 0 };
  const deps = {
    looksLikeGarbage,
    lexicalScope,
    interpret: async (...a) => {
      calls.interpret++;
      return interpret ? interpret(...a) : { lectura: "leído", intenciones: [] };
    },
    scopeMany: async (...a) => {
      calls.scope++;
      return scopeMany ? scopeMany(...a) : null;
    },
    compose: async (input) => {
      calls.compose.push(input);
      return compose ? compose(input) : { view: "risks", title: "Riesgos", story: "story" };
    },
    fallback: () => ({ view: "map", title: "fallback", story: "fb" }),
    verify: async () => {
      calls.verify++;
      return verify ? verify() : OK_VERIFY;
    },
  };
  const run = (question, g = GRAPH) =>
    runPipeline({ question, graph: g, emit: (e) => events.push(e), deps });
  return { run, events, calls };
}

const types = (events) => events.map((e) => e.type);

test("ruido: corta antes de llamar a cualquier modelo", async () => {
  const h = harness();
  const spec = await h.run("cvncncggch");
  assert.equal(spec.view, "out_of_scope");
  assert.equal(spec.reason, "garbage");
  assert.equal(h.calls.interpret, 0);
  assert.equal(h.calls.scope, 0);
  assert.equal(h.calls.compose.length, 0);
  assert.deepEqual(types(h.events), ["run.started", "guard.noise", "render.ready", "run.finished"]);
});

test("Jev dice que no es consulta: cae como ruido", async () => {
  const h = harness({
    interpret: () => ({ lectura: "", intenciones: [{ texto: "blabla", proyecto: "ninguno", tipo: "otro" }] }),
    scopeMany: () => ({
      original: 0.1,
      esConsulta: 0.02,
      intents: [{ texto: "blabla", score: 0.1 }],
      model: "jev",
      usage: {},
    }),
  });
  const spec = await h.run("blablabla blabla");
  assert.equal(spec.reason, "garbage");
  assert.equal(h.calls.compose.length, 0);
  assert.ok(types(h.events).includes("scope.resolved"));
});

test("una intención en alcance: compone y audita", async () => {
  const h = harness({
    interpret: () => ({ lectura: "riesgos del comercial", intenciones: [{ texto: "¿Qué riesgos hay en el comercial?", proyecto: "comercial", tipo: "riesgo" }] }),
    scopeMany: () => ({
      original: 0.9,
      esConsulta: 0.95,
      intents: [{ texto: "¿Qué riesgos hay en el comercial?", proyecto: "comercial", tipo: "riesgo", score: 0.96 }],
      model: "jev",
      usage: {},
    }),
  });
  const spec = await h.run("que falta en el brain");
  assert.equal(spec.view, "risks");
  assert.equal(spec.verification.status, "ok");
  assert.equal(h.calls.compose.length, 1);
  assert.equal(spec.intents.length, 1);
  assert.equal(spec.intents[0].inScope, true);
  assert.equal(spec.lectura, "riesgos del comercial");
  assert.equal(types(h.events).at(0), "run.started");
  assert.equal(types(h.events).at(-1), "run.finished");
});

test("multi-intención: sólo las que entran llegan al compositor", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "dos cosas",
      intenciones: [
        { texto: "¿Qué falta en el brain?", proyecto: "gerencial", tipo: "brecha" },
        { texto: "¿Cuánto cuesta una ventana?", proyecto: "comercial", tipo: "otro" },
      ],
    }),
    scopeMany: () => ({
      original: 0.5,
      esConsulta: 0.9,
      intents: [
        { texto: "¿Qué falta en el brain?", proyecto: "gerencial", tipo: "brecha", score: 0.98 },
        { texto: "¿Cuánto cuesta una ventana?", proyecto: "comercial", tipo: "otro", score: 0.04 },
      ],
      model: "jev",
      usage: {},
    }),
    compose: () => ({ view: "gaps", title: "Brechas", story: "s" }),
  });
  const spec = await h.run("que falta y cuanto sale");
  assert.equal(spec.view, "gaps");
  assert.equal(spec.intents.length, 2);
  assert.equal(spec.intents.filter((i) => i.inScope).length, 1);
  assert.ok(!h.calls.compose[0].includes("Cuánto cuesta"), "la intención fuera no debe entrar al compositor");
  assert.ok(h.calls.compose[0].includes("brain"));
});

test("todas fuera: no compone", async () => {
  const h = harness({
    interpret: () => ({ lectura: "precio", intenciones: [{ texto: "¿Cuánto cuesta una ventana?", proyecto: "comercial", tipo: "otro" }] }),
    scopeMany: () => ({
      original: 0.04,
      esConsulta: 0.95,
      intents: [{ texto: "¿Cuánto cuesta una ventana?", proyecto: "comercial", tipo: "otro", score: 0.04 }],
      model: "jev",
      usage: {},
    }),
  });
  const spec = await h.run("cuanto sale una ventana");
  assert.equal(spec.view, "out_of_scope");
  assert.equal(spec.reason, "out_of_scope");
  assert.equal(h.calls.compose.length, 0);
});

test("anti-drift: una intención en alcance pero original fuera => fuera", async () => {
  const h = harness({
    interpret: () => ({ lectura: "inflado", intenciones: [{ texto: "¿Cómo cotiza el sistema una ventana?", proyecto: "comercial", tipo: "estado" }] }),
    scopeMany: () => ({
      original: 0.05,
      esConsulta: 0.95,
      intents: [{ texto: "¿Cómo cotiza el sistema una ventana?", proyecto: "comercial", tipo: "estado", score: 0.8 }],
      model: "jev",
      usage: {},
    }),
  });
  const spec = await h.run("cuanto sale una ventana");
  assert.equal(spec.view, "out_of_scope");
  assert.equal(spec.fidelity_warning, true);
  assert.equal(h.calls.compose.length, 0);
});

test("compositor falla: usa el fallback y marca degradado", async () => {
  const h = harness({
    interpret: () => ({ lectura: "riesgos", intenciones: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo" }] }),
    scopeMany: () => ({ original: 0.9, esConsulta: 0.9, intents: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo", score: 0.9 }], model: "jev", usage: {} }),
    compose: () => {
      throw new Error("boom");
    },
  });
  const spec = await h.run("que falta en el brain");
  assert.equal(spec.degraded, true);
  assert.equal(spec.view, "map");
  assert.ok(types(h.events).includes("stage.failed"));
});

test("auditoría rechaza sin respuesta: tarjeta de no pude responder", async () => {
  const h = harness({
    interpret: () => ({ lectura: "x", intenciones: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo" }] }),
    scopeMany: () => ({ original: 0.9, esConsulta: 0.9, intents: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo", score: 0.9 }], model: "jev", usage: {} }),
    verify: () => ({ status: "rejected", scores: { respaldada: 0.8, responde: 0.11, severidad: 0.9 } }),
  });
  const spec = await h.run("que falta en el brain");
  assert.equal(spec.view, "out_of_scope");
  assert.equal(spec.reason, "unanswered");
  assert.equal(spec.verification.status, "rejected");
});

test("auditoría rechaza sólo la narrativa: conserva la vista", async () => {
  const h = harness({
    interpret: () => ({ lectura: "x", intenciones: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo" }] }),
    scopeMany: () => ({ original: 0.9, esConsulta: 0.9, intents: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo", score: 0.9 }], model: "jev", usage: {} }),
    verify: () => ({ status: "rejected", scores: { respaldada: 0.4, responde: 0.8, severidad: 0.9 } }),
  });
  const spec = await h.run("que falta en el brain");
  assert.equal(spec.view, "risks");
  assert.equal(spec.story, "");
});

test("sin Jev: cae a alcance léxico", async () => {
  const h = harness({
    interpret: () => ({ lectura: "riesgos", intenciones: [{ texto: "riesgos del comercial", proyecto: "comercial", tipo: "riesgo" }] }),
    scopeMany: () => null,
  });
  const spec = await h.run("que falta en el brain");
  assert.equal(spec.view, "risks");
  const scopeEvent = h.events.find((e) => e.type === "scope.resolved");
  assert.equal(scopeEvent.data.source, "lexical");
});

test("los eventos son monotonónicos y versionados", async () => {
  const h = harness({ interpret: () => ({ lectura: "", intenciones: [] }) });
  await h.run("que falta en el brain");
  const seqs = h.events.map((e) => e.seq);
  assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b));
  assert.equal(new Set(seqs).size, seqs.length);
  for (const e of h.events) {
    assert.equal(e.v, 1);
    assert.equal(typeof e.t, "number");
    assert.equal(typeof e.type, "string");
  }
});

test("una faceta también pasa por intérprete y alcance, y emite el desglose", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "riesgos del comercial",
      intenciones: [{ texto: "¿Qué riesgos hay en el comercial?", proyecto: "comercial", tipo: "riesgo" }],
    }),
    scopeMany: () => ({
      original: 0.95,
      esConsulta: 0.95,
      intents: [{ texto: "¿Qué riesgos hay en el comercial?", proyecto: "comercial", tipo: "riesgo", score: 0.97 }],
      model: "jev",
      usage: { input_tokens: 120, output_tokens: 20 },
    }),
  });

  const spec = await h.run("que riesgos corro en el comercial");
  assert.equal(h.calls.interpret, 1, "debe interpretar la pregunta");
  assert.equal(h.calls.scope, 1, "debe verificar alcance");
  assert.equal(h.calls.compose.length, 0, "la faceta no llama al compositor");
  assert.ok(types(h.events).includes("decompose.done"), "falta el desglose");
  assert.ok(types(h.events).indexOf("scope.resolved") < types(h.events).indexOf("decompose.done"));
  assert.equal(spec.verification.status, "deterministic");
});

test("el modelo propone correo y el pipeline emite tool.requested sin ejecutar", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "enviar a juan",
      intenciones: [{ texto: "enviar el reporte a juan@empresa.com", proyecto: "comercial", tipo: "otro" }],
      accion: { tool: "email", to: ["juan@empresa.com"], nota: "revisar" },
    }),
    scopeMany: () => ({ esConsulta: 0.95, original: 0.95, intents: [{ texto: "x", score: 0.9 }] }),
  });
  await h.run("mandale esto a juan@empresa.com");
  const { events } = h;

  const ev = events.find((e) => e.type === "tool.requested");
  assert.ok(ev, "debe emitir tool.requested");
  assert.equal(ev.data.tool, "email");
  assert.deepEqual(ev.data.args.to, ["juan@empresa.com"]);
  assert.equal(ev.data.source, "model");
});

test("una herramienta inválida se rechaza sin romper el run", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "x",
      intenciones: [{ texto: "¿qué riesgos?", proyecto: "comercial", tipo: "riesgo" }],
      accion: { tool: "rm_rf" },
    }),
    scopeMany: () => ({ esConsulta: 0.95, original: 0.95, intents: [{ texto: "x", score: 0.9 }] }),
  });
  await h.run("borrá todo");
  const { events } = h;

  assert.ok(events.some((e) => e.type === "tool.rejected"));
  assert.ok(events.some((e) => e.type === "render.ready"));
});

test("una acción de interfaz corta la composición", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "abrir el cotizador",
      intenciones: [{ texto: "explorar el cotizador", proyecto: "comercial", tipo: "otro" }],
      accion: { tool: "abrir_proyecto", argumentos: { proyecto: "cotizador" } },
    }),
    scopeMany: () => ({ esConsulta: 0.95, original: 0.95, intents: [{ texto: "x", score: 0.9 }] }),
  });

  const spec = await h.run("exploremos el cotizador");

  assert.equal(h.calls.compose.length, 0, "no debe componer una vista aparte");
  assert.ok(h.events.some((e) => e.type === "tool.requested"));
  assert.deepEqual(spec.accion, { tool: "abrir_proyecto", args: { proyecto: "cotizador" } });
});

test("el correo no corta: ese sí necesita una vista y confirmación", async () => {
  const h = harness({
    interpret: () => ({
      lectura: "enviar",
      intenciones: [{ texto: "enviar el reporte", proyecto: "comercial", tipo: "otro" }],
      accion: { tool: "email", to: ["juan@empresa.com"] },
    }),
    scopeMany: () => ({ esConsulta: 0.95, original: 0.95, intents: [{ texto: "x", score: 0.9 }] }),
  });

  await h.run("mandale esto a juan@empresa.com");
  assert.ok(h.calls.compose.length > 0, "el correo sigue componiendo la vista a enviar");
});
