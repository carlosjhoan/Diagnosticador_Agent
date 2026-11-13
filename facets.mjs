import { precotizadorSpec } from "./precotizador.mjs";
// Facetas: vistas armadas desde el grafo con parámetros. Sin modelo, sin inventar.
// Cada parámetro sólo filtra, agrupa o cambia un estado que ya existe.

const SEV_ORDER = { critical: 0, high: 1, medium: 2 };
const SEV_LABEL = { critical: "crítico", high: "alto", medium: "medio" };

const PROJECT_LABEL = { landing: "Landing", comercial: "Comercial", gerencial: "Gerencial Brain" };

function findings(g, project) {
  const all = g.projects.flatMap((p) => (p.findings || []).map((f) => ({ ...f, project: p.id, projectName: p.name })));
  return project && project !== "todos" ? all.filter((f) => f.project === project) : all;
}

function filterSev(list, sev) {
  if (sev === "critical") return list.filter((f) => f.sev === "critical");
  if (sev === "high") return list.filter((f) => f.sev === "critical" || f.sev === "high");
  return list;
}

/* ---------- detección ---------- */

export function detectFacet(question, graph) {
  const q = String(question).toLowerCase();
  const hit = (...w) => w.some((x) => q.includes(x));

  // Arranca en el valor que la pregunta ya insinúa, no en el default.
  const project = hit("landing", "sitio", "página web")
    ? "landing"
    : hit("comercial", "cotiz", "precio", "pricing")
    ? "comercial"
    : hit("gerencial", "brain", "gerencia", "inventario")
    ? "gerencial"
    : "todos";

  const sev = hit("crítico", "critico", "crítica", "critica", "peor", "grave")
    ? "critical"
    : hit("alto", "alta", "prioritario")
    ? "high"
    : "all";

  // El pre-cotizador es su propia historia: cuestionario → cotizador → rango.
  if (graph?.precotizador && hit("precotizador", "pre-cotizador", "pre cotizador", "37 preguntas",
      "cuestionario", "onboarding", "cotizador", "rango estimado", "cotizacion agentica")) {
    const mode = hit("hallazgo", "problema", "falla", "deuda")
      ? "findings"
      : hit("etapa", "fase", "bloque")
      ? "stages"
      : "flow";
    return { facet: "precotizador", params: { mode } };
  }
  // Las facetas del grafo viejo (panorama, costuras, proceso) ya no se enrutan:
  // toda la exploración sale del diagnóstico vigente.
  if (hit("riesgo", "peligro", "se rompe", "falla")) {
    return { facet: "risks", params: { project, sev } };
  }
  return null;
}

/* ---------- controles ---------- */

const opt = (value, label) => ({ value, label });

export function controlsFor(facet, g) {
  switch (facet) {
    case "precotizador":
      return [
        {
          id: "mode",
          label: "Vista",
          options: [
            opt("flow", "recorrido"),
            opt("stages", "por etapa"),
            opt("findings", "hallazgos"),
          ],
        },
        {
          id: "stage",
          label: "Etapa",
          options: [
            opt("all", "todas"),
            ...(g.precotizador?.stages || []).map((s) => opt(s.id, s.title)),
          ],
        },
      ];
    case "risks":
      return [
        {
          id: "project",
          label: "Proyecto",
          options: [opt("todos", "los tres"), ...g.projects.map((p) => opt(p.id, p.name))],
        },
        {
          id: "sev",
          label: "Gravedad",
          options: [opt("all", "todo"), opt("high", "alto y crítico"), opt("critical", "sólo críticos")],
        },
      ];
    case "seams":
      return [
        {
          id: "status",
          label: "Estado",
          options: [
            opt("all", "todas"),
            opt("broken", "rotas"),
            opt("broken,partial", "rotas y parciales"),
            opt("missing", "faltantes"),
          ],
        },
      ];
    case "panorama":
      return [
        {
          id: "group",
          label: "Agrupar por",
          options: [opt("project", "proyecto"), opt("severity", "severidad"), opt("type", "tipo")],
        },
      ];
    case "process":
      return [
        {
          id: "mode",
          label: "Formato",
          options: [opt("steps", "paso a paso"), opt("diagram", "diagrama")],
        },
      ];
    default:
      return [];
  }
}

/* ---------- construcción ---------- */

function buildRisks(g, params) {
  const project = params.project || "todos";
  const sev = params.sev || "all";
  const base = findings(g, project).filter((f) => f.type === "risk");
  const list = filterSev(base, sev).sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);

  const counts = { critical: 0, high: 0, medium: 0 };
  base.forEach((f) => counts[f.sev]++);

  return {
    meta: { total: base.length, visible: list.length, critical: counts.critical, high: counts.high, medium: counts.medium },
    title: `Riesgos · ${project === "todos" ? "los tres proyectos" : PROJECT_LABEL[project]}`,
    story:
      `Hay ${base.length} riesgos identificados${project === "todos" ? "" : " en " + PROJECT_LABEL[project]}: ` +
      `${counts.critical} críticos, ${counts.high} altos y ${counts.medium} medios. ` +
      `Mostrando ${list.length} con el filtro actual.`,
    layout: [
      {
        type: "kpi-row",
        props: {
          items: [
            { label: "críticos", value: String(counts.critical) },
            { label: "altos", value: String(counts.high) },
            { label: "medios", value: String(counts.medium) },
            { label: "visibles", value: String(list.length) },
          ],
        },
      },
      {
        type: "list",
        props: {
          items: list.map((f) => ({
            title: f.claim,
            tag: `${f.id} · ${SEV_LABEL[f.sev]}`,
            tone: f.sev,
            evidence: f.evidence,
          })),
        },
      },
    ],
  };
}

function buildSeams(g, params) {
  const want = String(params.status || "all").split(",");
  const all = g.seams;
  const list = want.includes("all") ? all : all.filter((s) => want.includes(s.status));
  const broken = all.filter((s) => s.status === "broken").length;

  return {
    meta: { total: all.length, visible: list.length, broken },
    title: "Costuras entre proyectos",
    story:
      `${all.length} conexiones entre los tres sistemas, ${broken} rotas. ` +
      `Mostrando ${list.length} con el filtro actual.`,
    layout: [
      {
        type: "list",
        props: {
          items: list.map((s) => ({
            title: `${s.label}: ${PROJECT_LABEL[s.from] || s.from} → ${PROJECT_LABEL[s.to] || s.to}`,
            text: s.impact,
            tag: s.status,
            tone: s.status === "broken" ? "critical" : s.status === "partial" || s.status === "fragmented" ? "high" : "info",
          })),
        },
      },
    ],
  };
}

function buildPanorama(g, params) {
  const group = params.group || "project";
  const all = findings(g, "todos");

  if (group === "severity") {
    const rows = ["critical", "high", "medium"].map((sev) => ({
      label: SEV_LABEL[sev],
      cells: g.projects.map((p) => String((p.findings || []).filter((f) => f.sev === sev).length)),
    }));
    return {
      meta: { total: all.length, group: "severity" },
      title: "Panorama por severidad",
      story: `${all.length} hallazgos repartidos en tres proyectos. La columna más cargada marca dónde duele.`,
      layout: [
        {
          type: "matrix",
          props: { columns: g.projects.map((p) => p.name), rows },
        },
      ],
    };
  }

  if (group === "type") {
    const types = ["gap", "risk", "debt"];
    const label = { gap: "brecha", risk: "riesgo", debt: "deuda" };
    return {
      meta: { total: all.length, group: "type" },
      title: "Panorama por tipo",
      story: `${all.length} hallazgos: qué proporción es brecha, qué proporción es riesgo y qué proporción es deuda.`,
      layout: [
        {
          type: "matrix",
          props: {
            columns: g.projects.map((p) => p.name),
            rows: types.map((t) => ({
              label: label[t],
              cells: g.projects.map((p) => String((p.findings || []).filter((f) => f.type === t).length)),
            })),
          },
        },
      ],
    };
  }

  return {
    meta: { total: all.length, group: "project" },
    title: "Panorama por proyecto",
    story: `${all.length} hallazgos en ${g.projects.length} proyectos. Los críticos se concentran donde el sistema se usa en vivo.`,
    layout: [
      {
        type: "matrix",
        props: {
          columns: ["críticos", "altos", "medios", "total"],
          rows: g.projects.map((p) => ({
            label: p.name,
            cells: [
              String((p.findings || []).filter((f) => f.sev === "critical").length),
              String((p.findings || []).filter((f) => f.sev === "high").length),
              String((p.findings || []).filter((f) => f.sev === "medium").length),
              String((p.findings || []).length),
            ],
          })),
        },
      },
    ],
  };
}

function buildProcess(g, params) {
  const steps = g.process.steps;
  const mode = params.mode === "diagram" ? "diagram" : "steps";

  if (mode === "diagram") {
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
      meta: { steps: steps.length, mode: "diagram" },
      title: `Proceso — ${g.process.name}`,
      story: g.process.summary,
      layout: [{ type: "flowanim", props: { nodes, edges } }],
    };
  }

  return {
    meta: { steps: steps.length, mode: "steps" },
    title: `Proceso — ${g.process.name}`,
    story: g.process.summary,
    layout: [
      { type: "stepper", props: { steps: steps.map((s) => ({ label: s.label, status: s.status, detail: s.detail })) } },
      { type: "callout", props: { tone: "danger", title: "Dónde se rompe", text: g.process.breakPoint } },
    ],
  };
}

export function buildFacet(facet, params, g) {
  // Normaliza contra las opciones declaradas: un valor raro cae al default.
  const controls = controlsFor(facet, g);
  const safe = {};
  for (const c of controls) {
    const v = params?.[c.id];
    safe[c.id] = c.options.some((o) => o.value === v) ? v : c.options[0].value;
  }

  switch (facet) {
    case "precotizador":
      return precotizadorSpec(g.precotizador, safe);
    case "risks":
      return buildRisks(g, safe);
    case "seams":
      return buildSeams(g, safe);
    case "panorama":
      return buildPanorama(g, safe);
    case "process":
      return g.process ? buildProcess(g, safe) : null;
    default:
      return null;
  }
}

/** Layout final: los controles van primero, siempre. */
export function facetSpec(facet, params, g) {
  const controls = controlsFor(facet, g);
  const safe = {};
  for (const c of controls) {
    const v = params?.[c.id];
    safe[c.id] = c.options.some((o) => o.value === v) ? v : c.options[0].value;
  }

  const built = buildFacet(facet, safe, g);
  if (!built) return null;
  return {
    v: 2,
    view: "map",
    title: built.title,
    story: built.story,
    projectId: null,
    focus: [],
    layout: [{ type: "controls", props: { facet, params: safe, controls } }, ...built.layout],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del grafo" },
  };
}
