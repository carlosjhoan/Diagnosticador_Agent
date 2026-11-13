/**
 * Registro de herramientas del agente.
 *
 * El modelo no ejecuta nada: propone una llamada. Este módulo la valida y el
 * cliente pide confirmación humana antes de cualquier efecto secundario.
 * Agregar una herramienta = agregar una entrada acá.
 */

export const TOOLS = [
  {
    name: "email",
    label: "Enviar por correo",
    when:
      "Usala cuando pidan enviar, mandar, compartir o reenviar esto por correo, " +
      "o cuando pidan preparar el reporte para alguien.",
    sideEffect: true,
    params: [
      {
        name: "to",
        kind: "emails",
        desc: "Direcciones mencionadas en la pregunta. Si no mencionan ninguna, devuelve [].",
      },
      {
        name: "nota",
        kind: "text",
        max: 120,
        desc: "Mensaje breve para el destinatario, solo si lo pidieron.",
      },
    ],
  },
];

/** Acciones que conducen la interfaz. No son destructivas: se ejecutan directo. */
export const UI_TOOLS = [
  {
    name: "abrir_proyecto",
    when: "Usala cuando pidan explorar, abrir o ver un proyecto (landing, cotizador o gerencial).",
    sideEffect: false,
    params: [
      {
        name: "proyecto",
        kind: "enum",
        values: ["landing", "cotizador", "gerencial"],
        desc: "landing | cotizador | gerencial",
      },
    ],
  },
  {
    name: "abrir_detalle",
    when: "Usala cuando pidan el detalle de un nodo concreto, por su nombre o su id.",
    sideEffect: false,
    params: [{ name: "nodo", kind: "nodo", desc: "id del nodo (N02) o su nombre tal como lo dice la persona" }],
  },
  {
    name: "enfocar_nodo",
    when: "Usala cuando quieran ubicar o señalar un nodo dentro del pipeline.",
    sideEffect: false,
    params: [{ name: "nodo", kind: "nodo", desc: "id del nodo" }],
  },
];

const MAX_RECIPIENTS = 10;

function exampleLines() {
  return [...TOOLS, ...UI_TOOLS].map((t) => {
    const args = t.params
      .map((p) => {
        const val =
          p.kind === "emails"
            ? '["juan@empresa.com"]'
            : p.kind === "enum"
            ? `"${p.values[0]}"`
            : p.kind === "text"
            ? '""'
            : t.name === "abrir_detalle" || t.name === "enfocar_nodo"
            ? '"comparación con cotizaciones"'
            : '"N02"';
        return `"${p.name}": ${val}`;
      })
      .join(", ");
    return `  ${t.name} → { "tool": "${t.name}", "argumentos": { ${args} } }`;
  });
}

/** Bloque de instrucciones que se inyecta en el prompt del intérprete. */
export function toolPrompt() {
  const lines = [...TOOLS, ...UI_TOOLS].map((t) => {
    const params = t.params
      .map((p) => `      "${p.name}": <${p.kind === "emails" ? "array de strings" : "string"}> — ${p.desc}`)
      .join("\n");
    return `  "${t.name}": ${t.when}\n    argumentos:\n${params}`;
  });

  return [
    "Herramientas disponibles. Puedes proponer UNA como máximo.",
    "",
    ...lines,
    "",
    'Si la pregunta no necesita ninguna herramienta, devuelve "accion": null.',
    '',
    'La acción puede convivir con una pregunta: si piden investigar algo Y enviarlo,',
    'devuelve las "intenciones" de lo que hay que investigar y además la "accion".',
    'Propón la herramienta aunque el pedido de envío venga al final o entre signos.',
    "",
    'Forma exacta de "accion": { "tool": "<nombre>", "argumentos": { ... } }',
    "Las claves son tool y argumentos. Adentro van sólo los parámetros de esa herramienta.",
    "",
    "Ejemplos:",
    ...exampleLines(),
    "",
    "NUNCA inventes direcciones de correo: solo las que aparezcan en la pregunta.",
  ].join("\n");
}

function cleanEmails(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const e = String(raw || "").trim().slice(0, 200);
    if (!e || !e.includes("@")) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

const SEND_VERB = /\b(envi(a|á|ar|en)|mand(a|á|ar|en)|compart(i|í|ir)|reenvi(a|á|ar))\b/i;
const MAIL_NOUN = /(correo|e-?mail|\bmail\b)/i;
const ADDRESS = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Disparo determinístico: no depende de que el modelo se acuerde.
 * Proponemos correo si hay una dirección escrita o si hay un verbo de envío
 * junto a la palabra correo. "Los correos que se envían" NO dispara: es
 * tercera persona, no una orden.
 */
export function detectToolCall(question) {
  const q = String(question || "");
  const found = [...new Set((q.match(ADDRESS) || []).map((e) => e.toLowerCase()))].slice(0, MAX_RECIPIENTS);
  if (found.length) return { tool: "email", args: { to: found, nota: "" } };

  // Una pregunta sobre correos no es una orden de enviar. Si hay signos de
  // interrogación y nadie escribió una dirección, no proponemos nada.
  if (/[?¿]/.test(q)) return null;
  if (SEND_VERB.test(q) && MAIL_NOUN.test(q)) return { tool: "email", args: { to: [], nota: "" } };
  return null;
}

/**
 * Valida una propuesta del modelo.
 * Devuelve { ok, tool, args, error }.
 */
export function validateToolCall(raw) {
  if (raw == null) return { ok: true, tool: null, args: {} };
  if (typeof raw !== "object") return { ok: false, error: "accion_no_objeto" };

  const args = raw.argumentos && typeof raw.argumentos === "object" ? raw.argumentos : {};
  const merged = { ...raw, ...args };
  const tool = [...TOOLS, ...UI_TOOLS].find((t) => t.name === String(merged.tool || merged.name || merged.herramienta || ""));
  if (!tool) return { ok: false, error: "herramienta_desconocida" };

  if (tool.name === "abrir_proyecto") {
    const proyecto = String(merged.proyecto || merged.project || merged.name || "").toLowerCase();
    const valido = ["landing", "cotizador", "gerencial"].includes(proyecto);
    return valido ? { ok: true, tool: tool.name, args: { proyecto } } : { ok: false, error: "proyecto_invalido" };
  }

  if (tool.name === "abrir_detalle" || tool.name === "enfocar_nodo") {
    const raw = String(merged.nodo || merged.node || merged.nombre || merged.paso || "").trim();

    // Puede venir el id (N08) o el nombre tal como lo dice la persona.
    if (/^[A-Z]\d{1,2}[A-Z]?$/i.test(raw)) {
      return { ok: true, tool: tool.name, args: { nodo: raw.toUpperCase() } };
    }
    if (raw.length >= 3) {
      return { ok: true, tool: tool.name, args: { nombre: raw.slice(0, 90) } };
    }
    return { ok: false, error: "nodo_invalido" };
  }

  if (tool.name === "email") {
    const to = cleanEmails(merged.to ?? merged.para ?? merged.destinatarios ?? []);
    const rawNota = merged.nota ?? merged.note ?? merged.mensaje;
    const nota = typeof rawNota === "string" ? rawNota.slice(0, 120) : "";
    return { ok: true, tool: tool.name, args: { to, nota } };
  }

  return { ok: false, error: "sin_validador" };
}
