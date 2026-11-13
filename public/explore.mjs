/**
 * Exploración del diagnóstico: una pregunta, una pantalla.
 *
 * La fuente es el diagnóstico profundo completo. Lo que se recorta es la
 * salida: nada de volcar 22 nodos o 16 hallazgos de una vez.
 */

import { buildProposal } from "./proposal.mjs";
import { estadoNodo, veredictoGlobal } from "./diagnostic.mjs";

const SEV_TONE = { P0: "critical", P1: "high", P2: "medium" };

const ROB_PALABRA = {
  Q3: "sólido",
  Q2: "aceptable",
  Q1: "a medias",
  Q0: "crítico",
  NV: "sin verificar",
};

const IMPL_PALABRA = {
  si: "construido",
  parcial: "a medias",
  no: "falta",
  externo: "fuera del sistema",
};

const CAP = { findings: 5, axes: 3, hypotheses: 4, nodes: 6 };

/* ---------- resolución de proyecto ---------- */

export function resolveProject(question, projects, currentId) {
  const q = String(question || "").toLowerCase();
  if (/landing|sitio|página web|pagina web/.test(q)) return projects.find((p) => p.id === "landing") || null;
  if (/cotizador|comercial|pre-?cotiz|pricing/.test(q)) return projects.find((p) => p.id === "cotizador") || null;
  if (/gerencial|brain|producción|produccion/.test(q)) return projects.find((p) => p.id === "gerencial") || null;

  const porEtapa = projects.filter((p) => (p.etapas || []).some((e) => q.includes(e.titulo.toLowerCase())));
  if (porEtapa.length === 1) return porEtapa[0];

  const id = (question.match(/\b([A-Z]\d{1,2}[A-Z]?)\b/) || [])[1];
  if (id) {
    const duenios = projects.filter((p) => p.nodos.some((n) => n.id === id));
    if (duenios.length === 1) return duenios[0];
  }

  if (currentId) return projects.find((p) => p.id === currentId) || null;
  return null;
}

const base = (project, title, story, layout, extra = {}) => ({
  v: 2,
  view: "map",
  title,
  story,
  projectId: project.id,
  focus: [],
  layout,
  verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  ...extra,
});

/* ---------- estado general: "¿qué tenemos hoy?" ---------- */

const porEtapa = (project, etapa) => {
  const ids = new Set(etapa.nodos || []);
  return project.nodos.filter((n) => ids.has(n.id));
};

const estadoEtapa = (nodos) => {
  if (!nodos.length) return { tono: "nv", texto: "sin datos" };
  const malos = nodos.filter((n) => n.calidad === "Q1" || n.calidad === "Q0").length;
  const faltan = nodos.filter((n) => n.integracion === "I0").length;
  if (faltan) return { tono: "no", texto: `${faltan} sin construir` };
  if (malos) return { tono: "warn", texto: "necesita refuerzo" };
  return { tono: "ok", texto: "funciona" };
};

export function exploreToday(project) {
  const v = veredictoGlobal(project);
  const p0 = project.hallazgos.filter((h) => h.severidad === "P0").slice(0, 3);
  const etapas = project.etapas.map((e) => ({ ...e, estado: estadoEtapa(porEtapa(project, e)) }));

  return base(
    project,
    `${project.nombre}: qué hay hoy`,
    `${v.cobertura.pct}% completo · ${v.verificados} de ${v.total} pasos verificados.`,
    [
      {
        type: "table",
        props: {
          columns: ["Etapa", "Cómo está", "Pasos"],
          rows: etapas.map((e) => [e.titulo, e.estado.texto, String((e.nodos || []).length)]),
        },
      },
      ...(p0.length
        ? [
            { type: "heading", props: { eyebrow: "lo que más pesa", text: "Los tres problemas que frenan" } },
            { type: "list", props: { items: p0.map((h) => ({ title: h.titulo, text: h.descripcion, tone: "critical" })) } },
          ]
        : []),
    ]
  );
}

/* ---------- hallazgos: los que importan, no todos ---------- */

export function exploreFindings(project, sev = "all") {
  const todos = project.hallazgos.filter((h) => (sev === "all" ? true : h.severidad === sev));
  const mostrados = [...todos].sort((a, b) => a.severidad.localeCompare(b.severidad)).slice(0, CAP.findings);
  const sobran = todos.length - mostrados.length;
  const cuenta = (s) => project.hallazgos.filter((h) => h.severidad === s).length;

  return base(
    project,
    `Qué frena al ${project.nombre}`,
    `${mostrados.length} de ${todos.length}${sobran ? ` · hay ${sobran} más` : ""}. ` +
      `En total: ${cuenta("P0")} bloqueantes, ${cuenta("P1")} serios y ${cuenta("P2")} deuda.`,
    [
      {
        type: "list",
        props: {
          items: mostrados.map((h) => ({
            title: h.titulo,
            text: h.descripcion,
            tone: SEV_TONE[h.severidad] || "medium",
            tag: h.severidad === "P0" ? "bloquea" : h.severidad === "P1" ? "serio" : "deuda",
          })),
        },
      },
      ...(sobran
        ? [{ type: "callout", props: { text: `Quedan ${sobran} hallazgos más en el diagnóstico. Pide "todos los hallazgos" para verlos.` } }]
        : []),
    ]
  );
}

/* ---------- nodos: por etapa, no en una tabla de 22 ---------- */

export function exploreNodes(project, etapa = "all") {
  // Una etapa pedida explícita: se muestran sus pasos flojos, máximo 5.
  if (etapa !== "all") {
    const e = project.etapas.find((x) => x.id === etapa);
    if (!e) return null;
    const nodos = porEtapa(project, e);
    const flojos = nodos.filter((n) => n.integracion !== "I3" || n.calidad === "Q1" || n.calidad === "Q0");
    const items = (flojos.length ? flojos : nodos).slice(0, CAP.nodes);

    return base(
      project,
      e.titulo,
      `${nodos.length} pasos · ${flojos.length ? `${flojos.length} necesitan atención` : "todos funcionan"}.`,
      [
        {
          type: "list",
          props: {
            items: items.map((n) => ({
              title: n.nombre,
              text: n.l1,
              tone: n.integracion === "I0" ? "critical" : n.calidad === "Q1" ? "high" : "ok",
              tag: `${IMPL_PALABRA[estadoNodo(n).implementado]} · ${ROB_PALABRA[n.calidad] || "—"}`,
            })),
          },
        },
      ]
    );
  }

  // Vista general: una fila por etapa, con el paso más flojo nombrado.
  const filas = project.etapas.map((e) => {
    const nodos = porEtapa(project, e);
    const flojos = nodos.filter((n) => n.integracion !== "I3" || n.calidad === "Q1" || n.calidad === "Q0");
    const peor = flojos[0];
    return {
      title: `${e.orden}. ${e.titulo}`,
      text: peor ? `Lo más flojo: ${peor.nombre}` : "Sin problemas abiertos",
      tone: flojos.some((n) => n.integracion === "I0") ? "critical" : flojos.length ? "high" : "ok",
      tag: `${nodos.length} pasos`,
    };
  });

  return base(project, `Cómo está armado el ${project.nombre}`, "Una fila por etapa. El detalle se pide por etapa.", [
    { type: "list", props: { items: filas } },
  ]);
}

/* ---------- ejes: los tres más flojos ---------- */

export function axisAverages(project) {
  const out = [];
  for (const eje of project.axes || []) {
    const vals = project.nodos.map((n) => n.ejes?.[eje.id]).filter((v) => typeof v === "number");
    if (!vals.length) continue;
    out.push({
      id: eje.id,
      nombre: eje.name,
      promedio: vals.reduce((a, b) => a + b, 0) / vals.length,
      medidos: vals.length,
      ceros: vals.filter((v) => v === 0).length,
    });
  }
  return out.sort((a, b) => a.promedio - b.promedio);
}

const EJES_GERENCIA = {
  mantenibilidad: { nombre: "Mantenibilidad", tecnicos: ["E8", "E9"] },
  escalabilidad: { nombre: "Escalabilidad", tecnicos: ["E2", "E3"] },
  confiabilidad: { nombre: "Confiabilidad", tecnicos: ["E1", "E5"] },
  seguridad: { nombre: "Seguridad", tecnicos: ["E7"] },
  costo: { nombre: "Costo-beneficio", tecnicos: ["E3", "E6"] },
};

/** Los once ejes técnicos agrupados en los cinco que mira la gerencia. */
export function managementAxes(project) {
  const tecnicos = axisAverages(project);
  const porId = new Map(tecnicos.map((t) => [t.id, t]));

  return Object.entries(EJES_GERENCIA)
    .map(([id, def]) => {
      const usados = def.tecnicos.map((t) => porId.get(t)).filter(Boolean);
      if (!usados.length) return null;
      const promedio = usados.reduce((a, u) => a + u.promedio, 0) / usados.length;
      return { id, nombre: def.nombre, promedio, tecnicos: usados };
    })
    .filter(Boolean)
    .sort((a, b) => a.promedio - b.promedio);
}

export function exploreAxes(project, { management = false } = {}) {
  const lista = management ? managementAxes(project) : axisAverages(project);
  if (!lista.length) return null;

  const mostrados = lista.slice(0, CAP.axes);
  const peor = mostrados[0];
  const veredicto = (v) => (v < 1 ? "casi ausente" : v < 2 ? "flojo" : v < 2.5 ? "aceptable" : "bien");

  return base(
    project,
    management ? `Qué le falta al ${project.nombre}` : `Los puntos flojos del ${project.nombre}`,
    `Lo más débil: ${peor.nombre}, ${veredicto(peor.promedio)}. Abajo los ${mostrados.length} que más pesan.`,
    [
      {
        type: "list",
        props: {
          items: mostrados.map((e) => ({
            title: `${e.nombre}: ${veredicto(e.promedio)}`,
            text: management
              ? e.tecnicos.map((t) => t.nombre).join(" · ")
              : `${e.medidos} pasos medidos${e.ceros ? ` · ${e.ceros} sin nada` : ""}`,
            tone: e.promedio < 1.5 ? "critical" : e.promedio < 2.2 ? "high" : "ok",
          })),
        },
      },
    ]
  );
}

/* ---------- hipótesis: las que cambian decisiones ---------- */

export function exploreHypotheses(project) {
  const cuenta = (v) => project.hipotesis.filter((h) => h.veredicto === v).length;
  const refutadas = project.hipotesis.filter((h) => h.veredicto === "REFUTADA");
  const confirmadas = project.hipotesis.filter((h) => h.veredicto === "CONFIRMADA");
  const interesan = [...refutadas, ...confirmadas].slice(0, CAP.hypotheses);

  return base(
    project,
    `Lo que creíamos del ${project.nombre}`,
    `${cuenta("CONFIRMADA")} confirmadas y ${cuenta("REFUTADA")} refutadas. Las refutadas son las que cambian decisiones.`,
    [
      {
        type: "list",
        props: {
          items: interesan.map((h) => ({
            title: h.texto,
            text: h.nodos?.length ? `toca ${h.nodos.length} pasos` : "",
            tone: h.veredicto === "REFUTADA" ? "ok" : "high",
            tag: h.veredicto === "REFUTADA" ? "refutada" : "confirmada",
          })),
        },
      },
    ]
  );
}

/* ---------- detalle de un paso ---------- */

export function exploreNode(project, nodeId) {
  const node = project.nodos.find((n) => n.id === nodeId);
  if (!node) return null;

  const e = estadoNodo(node);
  const hip = project.hipotesis.filter((h) => (h.nodos || []).includes(node.id));
  const falta = (node.l2?.falta || []).slice(0, 4);

  return base(
    project,
    node.nombre,
    `${IMPL_PALABRA[e.implementado]} · ${ROB_PALABRA[e.robustez] || "sin verificar"}. ${node.l1}`,
    [
      ...(node.l2?.hace?.length
        ? [{ type: "heading", props: { eyebrow: "hoy", text: "Qué hace" } },
           { type: "list", props: { items: node.l2.hace.slice(0, 3).map((t) => ({ title: t })) } }]
        : []),
      ...(falta.length
        ? [{ type: "heading", props: { eyebrow: "falta", text: "Qué le falta" } },
           { type: "list", props: { items: falta.map((t) => ({ title: t, tone: "medium" })) } }]
        : []),
      ...(hip.length
        ? [{ type: "callout", props: { text: `${hip.map((h) => `${h.texto} (${h.veredicto.toLowerCase().replace(/_/g, " ")})`).join(" · ")}` } }]
        : []),
    ],
    { focus: [node.id] }
  );
}

/* ---------- propuesta ---------- */

export function exploreProposal(project) {
  const prop = buildProposal(project);
  if (!prop) return null;

  return base(
    project,
    `Cómo hacer sólido el ${project.nombre}`,
    `${prop.objetivo} Es una propuesta, no un hallazgo.`,
    [
      {
        type: "callout",
        props: {
          text:
            `Cubre ${prop.cobertura.p0Cubiertos} de ${prop.cobertura.p0Total} problemas bloqueantes.` +
            (prop.cobertura.p0Sueltos.length
              ? ` Queda ${prop.cobertura.p0Sueltos.join(", ")}: no lo resuelve infraestructura, es una decisión.`
              : ""),
        },
      },
      {
        type: "list",
        props: {
          ordered: true,
          items: prop.fases.slice(0, 4).map((f) => ({
            title: f.nombre,
            text: `cierra ${f.cierra.join(", ")}`,
            tag: f.esfuerzo,
          })),
        },
      },
    ]
  );
}

/* ---------- pregunta sin proyecto ---------- */

export function exploreFindingsAll(projects, sev = "all") {
  const cuenta = (s) => projects.reduce((a, p) => a + p.hallazgos.filter((h) => h.severidad === s).length, 0);
  const items = [];
  for (const p of projects) {
    for (const h of p.hallazgos) {
      if (sev !== "all" && h.severidad !== sev) continue;
      items.push({ h, proyecto: p.nombre });
    }
  }
  const mostrados = items.sort((a, b) => a.h.severidad.localeCompare(b.h.severidad)).slice(0, CAP.findings);

  return {
    v: 2,
    view: "map",
    title: "Los problemas más graves de los tres",
    story: `${cuenta("P0")} bloqueantes, ${cuenta("P1")} serios y ${cuenta("P2")} de deuda entre los tres proyectos.`,
    projectId: null,
    focus: [],
    layout: [
      {
        type: "list",
        props: {
          items: mostrados.map(({ h, proyecto }) => ({
            title: h.titulo,
            text: h.descripcion,
            tone: SEV_TONE[h.severidad] || "medium",
            tag: `${proyecto} · ${h.severidad}`,
          })),
        },
      },
    ],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  };
}

export function exploreAxesAll(projects) {
  const filas = [];
  for (const p of projects) for (const e of managementAxes(p)) filas.push({ ...e, proyecto: p.nombre });
  if (!filas.length) return null;
  filas.sort((a, b) => a.promedio - b.promedio);
  const peor = filas[0];
  const veredicto = (v) => (v < 1 ? "casi ausente" : v < 2 ? "flojo" : v < 2.5 ? "aceptable" : "bien");

  return {
    v: 2,
    view: "map",
    title: "Qué le falta a los tres",
    story: `Lo más débil: ${peor.nombre} en ${peor.proyecto}, ${veredicto(peor.promedio)}.`,
    projectId: null,
    focus: [],
    layout: [
      {
        type: "list",
        props: {
          items: filas.slice(0, CAP.findings).map((f) => ({
            title: `${f.proyecto} · ${f.nombre}`,
            text: veredicto(f.promedio),
            tone: f.promedio < 1.5 ? "critical" : f.promedio < 2.2 ? "high" : "ok",
          })),
        },
      },
    ],
    verification: { status: "deterministic", scores: {}, note: "vista calculada del diagnóstico" },
  };
}

/* ---------- búsqueda por nombre de paso ---------- */

const VACIAS = new Set(["que", "qué", "como", "cómo", "del", "los", "las", "por", "para", "con", "una", "uno", "sobre", "acerca", "tenemos", "hay", "esta", "este", "esto", "ejemplo", "incluir", "dame", "decime", "dime"]);

const plano = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Busca un paso por cómo lo nombra la persona.
 * Exige que coincidan todas las palabras significativas del título
 * (o al menos dos), para no matchear por una sola palabra suelta.
 */
export function matchNodeByText(question, projects) {
  const q = plano(question);
  if (!q) return null;

  let mejor = null;
  let mejorPuntos = 0;

  for (const project of projects) {
    for (const node of project.nodos) {
      const titulo = plano(node.nombre);
      if (!titulo) continue;

      if (q.includes(titulo)) return { project, node, puntos: 99 };

      const palabras = titulo.split(" ").filter((w) => w.length > 2 && !VACIAS.has(w));
      if (!palabras.length) continue;

      const aciertos = palabras.filter((w) => q.includes(w)).length;
      const completo = aciertos === palabras.length;
      const suficiente = palabras.length === 1 ? aciertos === 1 && palabras[0].length >= 5 : aciertos >= 2;

      if ((completo || suficiente) && aciertos > mejorPuntos) {
        mejorPuntos = aciertos;
        mejor = { project, node, puntos: aciertos };
      }
    }
  }

  return mejor;
}

/* ---------- detección ---------- */

const NODE_ID = /\b([A-Z]\d{1,2}[A-Z]?)\b/;

export function exploreQuestion(question, projects, currentId = null) {
  const q = String(question || "");
  const low = q.toLowerCase();
  const project = resolveProject(q, projects, currentId);

  if (!project) {
    if (!projects.length) return null;
    if (/hallazgo|riesgo|problema|crítico|critico|grave|deuda|p0|p1|p2/.test(low)) {
      const sev = /p0|crítico|critico|bloque/.test(low) ? "P0" : /p1|alto/.test(low) ? "P1" : /p2/.test(low) ? "P2" : "all";
      return exploreFindingsAll(projects, sev);
    }
    if (/\beje\b|ejes|confiabilidad|observabilidad|seguridad|mantenibilidad/.test(low)) {
      return exploreAxesAll(projects);
    }
    const suelto = matchNodeByText(question, projects);
    if (suelto) return exploreNode(suelto.project, suelto.node.id);
    return null;
  }

  const nodo = (q.match(NODE_ID) || [])[1];
  if (nodo && /detalle|nodo|qué es|que es|explica|explícame|explicame/.test(low)) {
    const spec = exploreNode(project, nodo.toUpperCase());
    if (spec) return spec;
  }

  // "¿qué hay de la selección de cita?" → el detalle de ese paso.
  const porNombre = matchNodeByText(question, [project]);
  if (porNombre) return exploreNode(porNombre.project, porNombre.node.id);

  if (/propuesta|robust|escalab|versión robusta|version robusta/.test(low)) return exploreProposal(project);
  if (/hipótesis|hipotesis|confirmada|refutada|supuesto/.test(low)) return exploreHypotheses(project);
  // "¿qué le falta?" es la pregunta de gerencia; "ejes" es la técnica.
  if (/qu[eé] (le )?falta|s[oó]lido|robustecer/.test(low)) return exploreAxes(project, { management: true });
  if (/\beje\b|ejes|observabilidad|confiabilidad|seguridad|mantenibilidad|escalabilidad/.test(low)) {
    return exploreAxes(project);
  }

  if (/qu[eé] (tenemos|hay) hoy|estado|general|panorama|c[oó]mo est[aá]/.test(low)) return exploreToday(project);

  if (/hallazgo|riesgo|problema|crítico|critico|grave|deuda|p0|p1|p2|frena/.test(low)) {
    const sev = /p0|crítico|critico|bloque/.test(low) ? "P0" : /p1|alto/.test(low) ? "P1" : /p2/.test(low) ? "P2" : "all";
    return exploreFindings(project, sev);
  }
  if (/nodo|etapa|pipeline|componente|flujo|armado/.test(low)) {
    const etapa = project.etapas.find((e) => low.includes(e.titulo.toLowerCase()) || low.includes(e.id));
    return exploreNodes(project, etapa ? etapa.id : "all");
  }

  return null;
}
