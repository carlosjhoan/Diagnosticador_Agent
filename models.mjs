// Clientes de modelo. Llaman a DeepSeek y a Jev. Sin estado global.
// Los umbrales y URLs se leen en cada llamada: el .env carga después del import.

export const VIEWS = ["map", "flow", "scope", "gaps", "risks", "compare", "evidence"];

const env = (k, d) => process.env[k] || d;


const RETRIABLE = /5dd|429|timeout|network|fetch failed|ECONN|ETIMEDOUT/i;

/** Reintenta una vez ante 5xx, 429 o error de red. Avisa por onRetry. */
async function withRetry(fn, { attempts = 2, onRetry } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts || !RETRIABLE.test(String(e && e.message))) throw e;
      try { onRetry && onRetry(i); } catch {}
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
  throw lastErr;
}

/* ---------- fallback determinista (modo sin API key) ---------- */

export function nameOf(g, id) {
  return (g.projects.find((p) => p.id === id) || {}).name || id;
}

export function localSpec(question, g) {
  const q = String(question).toLowerCase();
  const hit = (...words) => words.some((w) => q.includes(w));

  const proj = (() => {
    if (hit("landing", "web", "sitio", "experiencia digital")) return "landing";
    if (hit("comercial", "cotiz", "precio", "pre-cotizacion", "pricing")) return "comercial";
    if (hit("gerencial", "gerencia", "brain", "inventario", "rol", "rbac")) return "gerencial";
    return null;
  })();

  // El proceso vive en el grafo: stepper o diagrama, sin depender del modelo.
  if (g.process && hit("diagrama", "mapa", "grafico", "esquema")) {
    const steps = g.process.steps;
    const nodes = steps.map((s, i) => ({
      id: `p${i}`,
      label: s.label.replace(/^\d+\.\s*/, ""),
      kind: s.status === "fail" ? "risk" : s.status === "blocked" ? "data" : "system",
    }));
    const edges = steps.slice(1).map((s, i) => ({
      from: `p${i}`,
      to: `p${i + 1}`,
      label: "",
      status: s.status === "fail" || s.status === "blocked" ? "broken" : "ok",
    }));
    return {
      view: "map",
      title: `Diagrama — ${g.process.name}`,
      story: g.process.summary,
      layout: [{ type: "flowanim", props: { nodes, edges } }],
    };
  }

  if (g.process && hit("proceso", "pasos", "paso a paso", "que pasa cuando", "como funciona el", "como funciona la")) {
    return {
      view: "map",
      title: `Proceso — ${g.process.name}`,
      story: g.process.summary,
      layout: [
        {
          type: "stepper",
          props: { steps: g.process.steps.map((s) => ({ label: s.label, status: s.status, detail: s.detail })) },
        },
        { type: "callout", props: { tone: "danger", title: "Dónde se rompe", text: g.process.breakPoint } },
      ],
    };
  }

  if (hit("recorrido", "flujo", "cadena", "punta a punta", "extremo", "conecta", "costura", "promete", "entrega", "no llega", "entre ellos", "conexion"))
    return {
      view: "flow",
      title: "El recorrido, punta a punta",
      story:
        "El lead entra por la Landing, se pre-cotiza en el Comercial y nunca llega a Gerencial Brain. Cuatro de las seis costuras están rotas, faltantes o fragmentadas.",
    };

  if (hit("riesgo", "peligro", "se rompe", "falla"))
    return {
      view: "risks",
      title: proj ? `Riesgos — ${nameOf(g, proj)}` : "Mapa de riesgos",
      story:
        "Los riesgos críticos son de ejecución, no de inteligencia: un refresh mata la reunión, y no existe RBAC ni inventario.",
      projectId: proj,
    };

  if (hit("falta", "brecha", "gap", "complement", "robustecer"))
    return {
      view: "gaps",
      title: proj ? `Qué falta — ${nameOf(g, proj)}` : "Qué falta, proyecto por proyecto",
      story:
        "Lo que falta no es más IA: es infraestructura de ejecución y una única fuente de verdad para el precio.",
      projectId: proj,
    };

  if (hit("espera", "deberia", "debía", "recibir", "scope", "alcance", "real"))
    return {
      view: proj && hit("vs", "contra") ? "scope" : "compare",
      title: proj ? `Esperado vs real — ${nameOf(g, proj)}` : "Esperado vs real, los tres",
      story: proj
        ? "Lo construido es sólido; la brecha está en la configuración real y en cerrar los contratos entre sistemas."
        : "Los tres tienen base real. Ninguno tiene su última milla cerrada.",
      projectId: proj,
    };

  if (hit("evidencia", "archivo", "prueba", "fuente", "linea", "dónde está"))
    return {
      view: "evidence",
      title: "Evidencia por hallazgo",
      story: "Cada afirmación tiene archivo y línea. Si no tiene evidencia, no entró al grafo.",
      projectId: proj,
    };

  return {
    view: proj ? "gaps" : "map",
    title: proj ? `Panorama — ${nameOf(g, proj)}` : g.meta.title,
    story: proj ? (g.projects.find((p) => p.id === proj) || {}).status || "" : g.meta.narrative,
    projectId: proj,
  };
}

/* ---------- deepseek: compone la salida visual ---------- */

function systemPrompt(g) {
  return `Sos el agente de diagnóstico de Steel and Glass. Respondés SIEMPRE con un objeto JSON válido y nada más.

Contrato de salida:
{
  "title": "título corto en español",
  "story": "2 o 3 frases. Directo, sin relleno, sin markdown.",
  "projectId": "landing|comercial|gerencial" | null,
  "focus": ["IDS de hallazgos"] | [],
  "layout": [ { "type": "...", "props": { ... } } ]
}

Bloques disponibles (usa SOLO estos tipos):
- heading    { eyebrow?, text }
- story      { text }
- kpi-row    { items: [{ label, value, hint? }] }
- table      { columns: [..], rows: [[..]], caption? }
- matrix     { columns: [..], rows: [{ label, cells: [..] }] }
- list       { items: [{ title, text?, tag?, tone?, evidence? }], ordered? }   tone: critical|high|medium|info|ok
- pills      { items: [{ text, tone? }] }                                     tone: in|out|info|ok|warn
- stepper    { steps: [{ label, status, detail? }] }                          status: ok|run|fail|blocked|skip
- flow       { nodes: [{ id, label, kind }], edges: [{ from, to, label?, status? }] }   kind: human|system|ai|data|risk
- flowanim   igual que flow, pero animado: el punto viaja en orden y se detiene en la arista rota
- two-col    { left: { title, items: [..] }, right: { title, items: [..] } }
- timeline   { events: [{ when, title, text? }] }
- callout    { tone, title?, text }                                           tone: info|warn|danger|ok
- evidence   { rows: [{ id, ref, note? }] }

Reglas:
- Usa SOLO los hallazgos y costuras del grafo. No inventes datos, cifras ni archivos.
- Devuelve SIEMPRE "layout". Es la vía principal. "view" es el último recurso.
- Entre 1 y 5 bloques. No repitas la narrativa como bloque: ya viaja en "story".
- Para procesos secuenciales usa stepper; para flujos con destino de datos usa flow.
- Si piden "diagrama", "mapa" o "esquema" de un proceso, usa flowanim (no stepper). Si piden "los pasos", usa stepper.
- En flow/flowanim, marca "status": "broken" en la arista que entra al nodo donde el proceso se corta.
- Si el grafo trae "process" y la pregunta es sobre ese proceso, usa stepper copiando sus pasos, status y detail tal cual.
- Si la pregunta pide comparar proyectos, usa matrix o table.
- Si no hay datos en el grafo para armar la composición, devuelve "view": "map" con layout vacío.
- El "story" describe lo que dicen los hallazgos, sin editorializar.
- Español neutro de Colombia. Sin voseo. No uses emojis.

GRAFO:
${JSON.stringify(g)}`;
}

export async function deepseek(question, g, opts = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const base = env("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions");

  return withRetry(async () => {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env("DEEPSEEK_MODEL", "deepseek-flash"),
        reasoning_effort: env("DEEPSEEK_EFFORT", "low"),
        max_tokens: 4000,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(g) },
          { role: "user", content: question },
        ],
      }),
    });

    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return {
      spec: JSON.parse(json.choices?.[0]?.message?.content || "{}"),
      usage: json.usage || null,
      model: env("DEEPSEEK_MODEL", "deepseek-flash"),
    };
  }, opts);
}

/* ---------- intérprete: normaliza la query cruda ---------- */

import { toolPrompt } from "./server/tools.mjs";

const INTENT_PROMPT = `Sos un intérprete de consultas. Recibes una pregunta escrita rápido, con errores, abreviaturas o dictada por voz, y la traduces a intenciones limpias y autocontenidas.

Devuelves SOLO este JSON:
{
  "lectura": "una frase corta: qué entendiste que pregunta",
  "intenciones": [
    { "texto": "la pregunta normalizada, autocontenida y en español neutro",
      "proyecto": "landing|comercial|gerencial|ninguno",
      "tipo": "estado|brecha|riesgo|conexion|evidencia|prioridad|otro",
      "paso": "nombre del paso del diagnóstico al que se refiere, o null" }
  ],
  "accion": null
}

Reglas:
- Corrige ortografía, tildes y abreviaturas. Interpreta sinónimos del dominio (plata/precio -> cotización; lo gerencial -> gerencial brain).
- Máximo 3 intenciones. Si la pregunta es una sola, devuelve una.
- NO agregues información que no estaba. NO la reformules hacia un tema más conveniente.
- NO respondas la pregunta. Solo la normalizas.
- Si algo es genuinamente ambiguo, elige la lectura más literal.

${toolPrompt()}`;

export async function interpret(question, opts = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const base = env("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions");

  return withRetry(async () => {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env("DEEPSEEK_MODEL", "deepseek-flash"),
        reasoning_effort: "low",
        // el razonamiento cuenta contra max_tokens: con 700 la respuesta
        // llegaba vacía cuando la pregunta traía herramientas o era larga
        max_tokens: 1400,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INTENT_PROMPT },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek(intérprete) ${res.status}`);
    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || "{}";
    if (process.env.DEBUG_INTERPRET) console.error("[interpret raw]", rawContent);
    const out = JSON.parse(rawContent);
    const intenciones = Array.isArray(out.intenciones) ? out.intenciones.slice(0, 3) : [];
    return {
      lectura: typeof out.lectura === "string" ? out.lectura.slice(0, 200) : "",
      accion: out.accion ?? null,
      usage: json.usage || null,
      model: env("DEEPSEEK_MODEL", "deepseek-flash"),
      intenciones: intenciones
        .filter((i) => i && typeof i.texto === "string" && i.texto.trim())
        .map((i) => ({
          texto: i.texto.slice(0, 220),
          paso: typeof i.paso === "string" && i.paso.trim() ? i.paso.slice(0, 90) : null,
          proyecto: ["landing", "comercial", "gerencial"].includes(i.proyecto) ? i.proyecto : "ninguno",
          tipo: typeof i.tipo === "string" ? i.tipo.slice(0, 20) : "otro",
        })),
    };
  }, opts);
}
/* ---------- jev ---------- */

const JEV_THRESHOLD = () => Number(env("JEV_THRESHOLD", 0.6));

async function jevAsk(key, state, questions) {
  const res = await fetch(env("TYPESAFE_API_URL", "https://api.typesafe.ai/v1/systemone"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env("TYPESAFE_MODEL", "jev-latest"),
      state: JSON.stringify(state),
      questions,
    }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

export async function jevScopeMany(question, intents, g) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;

  const questions = {
    // Un input sin contenido no contradice nada: "¿está cubierto?" daría
    // 0.8 para ruido de teclado. Esta pregunta existe para eso.
    es_consulta: {
      type: "noul",
      instructions:
        "¿La 'pregunta_original' es una consulta o un pedido real de una persona, dirigido a este sistema?",
      criteria: {
        true: "Tiene un tema y un pedido, aunque esté mal escrita, abreviada o dictada",
        false: "Es una cadena de caracteres sin sentido, ruido de teclado, o texto sin intención comunicativa",
      },
    },
    // Ancla anti-drift: el original se evalúa siempre, así una reescritura
    // no puede meter en alcance algo que el usuario no preguntó.
    original: {
      type: "noul",
      instructions:
        "¿La 'pregunta_original' puede responderse con la información del campo 'alcance', aun estando mal escrita?",
      criteria: {
        true: "El tema y el pedido están cubiertos por el alcance",
        false: "Pide algo que el alcance no tiene: precios de mercado, hechos externos, opiniones sobre otras empresas",
      },
    },
  };

  intents.forEach((it, i) => {
    questions["alcance_" + i] = {
      type: "noul",
      instructions: `¿La intención "${it.texto}" se puede responder con la información del campo 'alcance' (hallazgos, proyectos y costuras del diagnóstico)?`,
      criteria: {
        true: "La respuesta está contenida en el alcance, aunque haya que componerla",
        false: "Requiere información que el alcance no tiene: precios de mercado, hechos externos, opiniones, otras empresas",
      },
    };
  });

  const res = await jevAsk(
    key,
    { pregunta_original: question, intenciones: intents.map((i) => i.texto), alcance: g },
    questions
  );

  const original = res.answers?.original?.noul;
  if (typeof original !== "number") throw new Error("Jev no devolvió original");

  return {
    original,
    esConsulta: res.answers?.es_consulta?.noul ?? 1,
    model: res.model,
    usage: res.usage,
    intents: intents.map((it, i) => ({
      ...it,
      score: res.answers?.["alcance_" + i]?.noul ?? 0,
    })),
  };
}

export async function jevVerify(question, spec, g) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return { status: "unverified", scores: {}, note: "sin TYPESAFE_API_KEY" };

  const body = {
    model: env("TYPESAFE_MODEL", "jev-latest"),
    state: JSON.stringify({ pregunta: question, grafo: g, salida_a_auditar: spec }),
    questions: {
      respaldada: {
        type: "noul",
        instructions:
          "¿Todo dato concreto del campo 'story' (cifras, nombres de archivo, severidades, estados) aparece en el campo 'grafo'? Las frases de conexión entre hallazgos están permitidas.",
        criteria: {
          true: "Cada dato concreto está en el grafo; solo se agregó redacción que los conecta",
          false: "Aparece una cifra, un archivo, una causa o una severidad que no está en el grafo",
        },
      },
      responde: {
        type: "noul",
        instructions:
          "¿La composición de 'salida_a_auditar' —sus bloques de 'layout' o, si no hay, su 'view'— responde efectivamente la 'pregunta'?",
        criteria: {
          true: "Un analista usaría esta composición para contestar esa pregunta",
          false: "La composición muestra otra cosa, está vacía o queda corta",
        },
      },
      severidad: {
        type: "noul",
        instructions:
          "¿Las severidades que declara 'salida_a_auditar' coinciden con las de los hallazgos del grafo que menciona?",
        criteria: {
          true: "No se exagera ni se minimiza ninguna severidad",
          false: "Presenta algo medio como crítico, o algo crítico como menor",
        },
      },
    },
  };

  const res = await fetch(env("TYPESAFE_API_URL", "https://api.typesafe.ai/v1/systemone"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  const scores = {};
  for (const [k, v] of Object.entries(json.answers || {})) {
    if (typeof v?.noul === "number") scores[k] = v.noul;
  }
  const values = Object.values(scores);
  const min = values.length ? Math.min(...values) : 0;
  const threshold = JEV_THRESHOLD();

  return {
    status: min >= threshold ? "ok" : "rejected",
    scores,
    threshold,
    model: json.model,
    usage: json.usage,
  };
}
