/**
 * Fuente de datos del pre-cotizador (Landing → Comercial).
 *
 * El JSON viene de Comercial/Docs/Diagnosticos y se sincroniza con
 * scripts/sync-data.mjs. Acá se normaliza y se arman vistas con los bloques
 * que el registro ya sabe pintar, así no hace falta una vista nueva.
 */

const TONE = { ok: "ok", partial: "medium", fail: "critical" };
const QUALITY = {
  solid: "bien resuelto",
  works_not_best: "funciona, no es la mejor forma",
  needs_work: "hay que reforzar",
};

export function normalizePrecotizador(raw) {
  if (!raw || !Array.isArray(raw.nodes)) return null;

  const nodes = raw.nodes.map((n) => ({
    ...n,
    stageTitle: raw.stages?.find((s) => s.id === n.stage)?.title || n.stage,
    tone: TONE[n.tone] || "info",
    qualityLabel: QUALITY[n.quality] || n.quality,
  }));

  const stages = (raw.stages || []).map((s) => {
    const own = nodes.filter((n) => n.stage === s.id);
    return {
      ...s,
      nodes: own,
      ok: own.filter((n) => n.tone === "ok").length,
      partial: own.filter((n) => n.tone === "medium").length,
      fail: own.filter((n) => n.tone === "critical").length,
    };
  });

  return {
    meta: raw.meta || {},
    metrics: raw.metrics || {},
    stages,
    flow: raw.flow || [],
    nodes,
    edges: raw.edges || [],
    breaks: raw.breaks || [],
    findings: raw.findings || [],
    hypotheses: raw.hypotheses || [],
    highlights: raw.highlights || {},
    axes: raw.axes || [],
  };
}

const sevTone = (s) => (s === "P0" ? "critical" : s === "P1" ? "high" : "medium");

/**
 * Vista del flujo completo: etapas → pasos → lo que se rompe.
 * mode: "flow" (recorrido) | "stages" (por etapa) | "findings" (hallazgos)
 */
export function precotizadorSpec(pc, params = {}) {
  if (!pc) return null;

  const mode = params.mode || "flow";
  const stage = params.stage || "all";

  if (mode === "findings") return findingsSpec(pc);
  if (mode === "stages") return stagesSpec(pc, stage);
  return flowSpec(pc, stage);
}

function flowSpec(pc, stage) {
  const m = pc.metrics;
  const nodes = stage === "all" ? pc.flow : pc.flow.filter((f) => pc.nodes.find((n) => n.id === f.node_id)?.stage === stage);
  const steps = nodes.map((f) => ({ label: f.label, text: f.node_id }));

  const breaks = pc.breaks.map((b) => ({
    title: `Corte entre ${b.from} y ${b.to}`,
    text: b.reason,
    tone: "critical",
    tag: "corte",
  }));

  return {
    v: 2,
    view: "map",
    title: "Pre-cotizador: del cuestionario al rango",
    story:
      `El cliente responde el cuestionario, adjunta planos y el sistema pre-cotiza. ` +
      `${m.nodes_total} nodos en ${pc.stages.length} etapas: ${m.implemented_true} implementados, ` +
      `${m.implemented_partial} parciales y ${m.implemented_false} ausentes.`,
    projectId: "comercial",
    focus: [],
    layout: [
      {
        type: "kpi-row",
        props: {
          items: [
            { value: String(m.nodes_total), label: "nodos" },
            { value: String(m.implemented_true), label: "implementados" },
            { value: String(m.implemented_partial), label: "parciales" },
            { value: String(m.findings_p0 || 0), label: "hallazgos P0" },
          ],
        },
      },
      { type: "heading", props: { eyebrow: "recorrido", text: "El camino del cliente" } },
      { type: "flow", props: { steps } },
      ...(breaks.length
        ? [
            { type: "heading", props: { eyebrow: "cortes", text: "Dónde se rompe" } },
            {
              type: "list",
              props: {
                items: pc.breaks.map((b) => ({
                  title: `${b.from} → ${b.to}`,
                  text: b.reason,
                  tone: "critical",
                  tag: "corte",
                })),
              },
            },
          ]
        : []),
      { type: "heading", props: { eyebrow: "etapas", text: "Salud por etapa" } },
      {
        type: "table",
        props: {
          columns: ["Etapa", "Resumen", "Nodos", "Bien", "Parcial", "Ausente"],
          rows: pc.stages.map((s) => [
            s.title,
            s.subtitle || s.summary || "",
            String(s.nodes.length),
            String(s.ok),
            String(s.partial),
            String(s.fail),
          ]),
        },
      },
    ],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  };
}

function stagesSpec(pc, stage) {
  const list = stage === "all" ? pc.stages : pc.stages.filter((s) => s.id === stage);

  return {
    v: 2,
    view: "map",
    title: stage === "all" ? "Etapas del pre-cotizador" : `Etapa: ${list[0]?.title || stage}`,
    story: list.map((s) => s.summary || s.subtitle).filter(Boolean).join(" "),
    projectId: "comercial",
    focus: [],
    layout: [
      ...list.map((s) => ({
        type: "list",
        props: {
          items: [
            {
              title: `${s.order}. ${s.title}`,
              text: s.subtitle || s.summary || "",
              tag: `${s.nodes.length} nodos`,
            },
            ...s.nodes.map((n) => ({
              title: n.title,
              text: n.summary,
              tone: n.tone,
              tag: n.tone === "ok" ? "ok" : n.tone === "medium" ? "parcial" : "ausente",
            })),
          ],
          ordered: true,
        },
      })),
    ],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  };
}

function findingsSpec(pc) {
  const bySeverity = { P0: [], P1: [], P2: [] };
  for (const f of pc.findings) (bySeverity[f.severity] || bySeverity.P2).push(f);

  return {
    v: 2,
    view: "map",
    title: "Hallazgos del pre-cotizador",
    story: `${pc.findings.length} hallazgos en total: ${bySeverity.P0.length} P0, ${bySeverity.P1.length} P1 y ${bySeverity.P2.length} P2.`,
    projectId: "comercial",
    focus: [],
    layout: [
      {
        type: "kpi-row",
        props: {
          items: [
            { value: String(bySeverity.P0.length), label: "P0 bloquean" },
            { value: String(bySeverity.P1.length), label: "P1 frenan" },
            { value: String(bySeverity.P2.length), label: "P2 deuda" },
          ],
        },
      },
      {
        type: "list",
        props: {
          items: pc.findings.map((f) => ({
            title: f.title,
            text: f.description,
            tone: sevTone(f.severity),
            tag: `${f.severity} · ${f.effort || ""}`.trim(),
          })),
        },
      },
    ],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  };
}
