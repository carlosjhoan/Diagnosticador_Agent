/**
 * Adaptador de diagnósticos.
 *
 * Convierte el JSON que genera el diagnóstico al modelo interno que consume
 * el dashboard. Regla: si un dato no existe, NO se inventa — se marca como
 * derivado o como no verificado, y se reporta la brecha.
 *
 * Los tres proyectos comparten esquema; Landing agrega campos propios
 * (can_do, limits, keywords) que se conservan sin interpretar.
 */

export const PROJECTS = [
  {
    id: "landing",
    nombre: "Landing",
    archivo: "diagnostico_landing.json",
    linea: "La puerta de entrada: presenta el negocio y captura el lead.",
  },
  {
    id: "cotizador",
    nombre: "Cotizador",
    archivo: "diagnostico_avanzado.json",
    linea: "Pre-cotiza con IA y ajusta el rango con el comercial en el onboarding.",
  },
  {
    id: "gerencial",
    nombre: "Gerencial Brain",
    archivo: "diagnostico_gerencial.json",
    linea: "Sigue el proyecto desde el sí del cliente hasta la producción.",
  },
];

/* ---------- escalas ---------- */

// implemented TRUE/FALSE/PARTIAL → I3/I2/I0. I1 (sólo en rama) no viene en el JSON.
const INTEGRACION = { TRUE: "I3", PARTIAL: "I2", FALSE: "I0" };

// reliability no mide lo mismo que F, así que el mapeo es conservador:
// 2 → F2 (no F3) para no inflar la cobertura.
const FUNCIONAMIENTO = { 2: "F2", 1: "F1", 0: "F0" };

const CALIDAD = { solid: "Q3", works_not_best: "Q2", needs_work: "Q1" };

const VEREDICTO = {
  CONFIRMED: "CONFIRMADA",
  REFUTED: "REFUTADA",
  PARTIALLY_CONFIRMED: "PARCIALMENTE_CONFIRMADA",
  NO_CONCLUYENTE: "NO_CONCLUYENTE",
  INCONCLUSIVE: "NO_CONCLUYENTE",
  NOT_CONCLUSIVE: "NO_CONCLUYENTE",
  CONFIRMED_WITH_CONDITION: "PARCIALMENTE_CONFIRMADA",
};


const ETIQUETA_CORTA = { solido: "sólido", aceptable: "aceptable", atencion: "atención", critico: "crítico" };

const ROBUSTEZ_LABEL = {
  Q3: "sólido",
  Q2: "aceptable",
  Q1: "atención",
  Q0: "crítico",
  NV: "sin verificar",
};

/* ---------- adaptación ---------- */

/**
 * Nodos que el diagnóstico incluye pero que NO son parte de la rúbrica:
 * son capacidades propuestas. No entran en el porcentaje de negocio ni de
 * producción, porque no se le pidieron al proyecto.
 */
const FUERA_DE_RUBRICA = {
  landing: ["L12", "L13"], // gestión de contenido y media · medición y aprendizaje
};

const esPropuesta = (projectId, nodeId) => (FUERA_DE_RUBRICA[projectId] || []).includes(nodeId);

const arr = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []);

export function adaptProject(raw, project) {
  if (!raw || !Array.isArray(raw.nodes)) {
    return {
      id: project.id,
      nombre: project.nombre,
      linea: project.linea,
      sinDiagnostico: true,
      nodos: [],
      aristas: [],
      hipotesis: [],
      hallazgos: [],
      metricas: { total: 0, implementados: 0, parciales: 0, ausentes: 0, futuros: 0, verificados: 0 },
      advertencias: ["no hay diagnóstico para este proyecto"],
      alcanceDeclarado: false,
    };
  }

  const axes = (raw.axes || []).map((a) => a.id);

  const nodos = (raw.nodes || []).map((n) => {
    const ejes = {};
    const row = raw.matrix?.[n.id] || [];
    axes.forEach((eje, i) => {
      const v = row[i];
      ejes[eje] = typeof v === "number" ? v : null;
    });

    const alcance = n.alcance || (n.futuro ? "Futuro" : "Actual");

    return {
      id: n.id,
      nombre: n.title || n.nombre || n.id,
      etapa: n.stage,
      orden: n.order ?? 0,
      alcance,
      l1: n.summary || "",
      integracion: INTEGRACION[n.implemented] || "I0",
      funcionamiento: FUNCIONAMIENTO[n.reliability] ?? "NV",
      verificadoPor: "lectura",
      calidad: CALIDAD[n.quality] || "NV",
      fueraDelSistema: n.fueraDelSistema || null,
      l2: { hace: arr(n.good), falta: arr(n.improve) },
      l3: { mejora: arr(n.improve) },
      ejes,
      riesgos: arr(n.riesgos),
      evidencia: arr(n.evidence).map((e) => (typeof e === "string" ? { ruta: e } : e)),
      hipotesisRelacionadas: [],
      dependeDe: [],
      alimenta: [],
      fueraDeRubrica: esPropuesta(project.id, n.id),
      // campos que sólo trae Landing; se conservan sin interpretar
      extra: n.can_do || n.limits || n.keywords ? { can_do: n.can_do, limits: n.limits, keywords: n.keywords } : null,
    };
  });

  const byId = new Map(nodos.map((n) => [n.id, n]));

  const EDGE = { alimenta: "alimenta", depende_de: "depende", falla_en_cascada: "cascada", acopla_datos: "acopla" };
  const aristas = (raw.edges || []).map((e) => ({
    de: e.from,
    a: e.to,
    tipo: EDGE[e.type] || "alimenta",
  }));
  for (const e of aristas) {
    const de = byId.get(e.de);
    const a = byId.get(e.a);
    if (de && !de.alimenta.includes(e.a)) de.alimenta.push(e.a);
    if (a && !a.dependeDe.includes(e.de)) a.dependeDe.push(e.de);
  }

  const hipotesis = (raw.hypotheses || []).map((h) => ({
    id: h.id,
    texto: h.statement || h.texto || "",
    veredicto:
      VEREDICTO[String(h.verdict || "").toUpperCase().replace(/\s+/g, "_")] ||
      String(h.verdict || "").toUpperCase(),
    evidencia: h.evidence || "",
    nodos: h.nodes || [],
  }));
  for (const h of hipotesis) {
    for (const id of h.nodos) byId.get(id)?.hipotesisRelacionadas.push(h.id);
  }

  const hallazgos = (raw.findings || []).map((f) => ({
    id: f.id,
    severidad: f.severity || "P2",
    esfuerzo: f.effort || "",
    nodos: f.nodes || [],
    titulo: f.title || "",
    descripcion: f.description || "",
  }));

  const futuros = nodos.filter((n) => n.alcance === "Futuro").length;
  const verificados = nodos.filter((n) => n.calidad !== "NV" && n.alcance !== "Futuro").length;

  const advertencias = [];
  if (!raw.nodes.some((n) => n.alcance || n.futuro)) {
    advertencias.push("el diagnóstico no declara alcance: todo se asume Actual");
  }
  if (!raw.nodes.some((n) => Array.isArray(n.riesgos) && n.riesgos.length)) {
    advertencias.push("sin riesgos por nodo (probabilidad, impacto y quién lo sufre)");
  }

  return {
    id: project.id,
    nombre: project.nombre,
    linea: project.linea,
    sinDiagnostico: false,
    commit: raw.meta?.baseline?.[0]?.commit || raw.meta?.commit || "",
    ramas: (raw.meta?.baseline || []).map((b) => `${b.repo}@${b.branch}`),
    fecha: raw.meta?.date || raw.meta?.fecha || "",
    nodos,
    aristas,
    axes: (raw.axes || []).map((a) => ({ id: a.id, name: a.name })),
    flow: (raw.flow || []).map((f) => f.node_id),
    hipotesis,
    hallazgos,
    etapas: (raw.stages || []).map((s) => ({
      id: s.id,
      orden: s.order,
      titulo: s.title,
      subtitulo: s.subtitle || "",
      nodos: s.node_ids || [],
    })),
    metricas: {
      total: nodos.length,
      implementados: nodos.filter((n) => n.integracion === "I3").length,
      parciales: nodos.filter((n) => n.integracion === "I2" || n.integracion === "I1").length,
      ausentes: nodos.filter((n) => n.integracion === "I0").length,
      futuros,
      verificados,
      propuestas: nodos.filter((n) => n.fueraDeRubrica).length,
    },
    alcanceDeclarado: !advertencias.some((a) => a.startsWith("el diagnóstico no declara alcance")),
    advertencias,
  };
}

/* ---------- señales ---------- */

/** Dos señales independientes: implementación y robustez. */
export function estadoNodo(nodo) {
  const implementado = nodo.fueraDelSistema
    ? "externo"
    : nodo.integracion === "I3"
    ? "si"
    : nodo.integracion === "I0"
    ? "no"
    : "parcial";

  const calidad = nodo.calidad || "NV";
  return {
    implementado,
    implementadoTexto:
      implementado === "si" ? "Implementado" : implementado === "parcial" ? "Parcial" : implementado === "externo" ? "Fuera del sistema" : "No implementado",
    robustez: calidad,
    robustezTexto: ROBUSTEZ_LABEL[calidad] || "sin verificar",
  };
}

const cuenta = (p) => p.nodos.filter((n) => n.alcance !== "Futuro" && !n.fueraDeRubrica);

/** Nodos Actual con I3 y funcionamiento F2+ sobre el total de nodos Actual. */
export function cobertura(proyecto) {
  const base = cuenta(proyecto);
  const ok = base.filter((n) => n.integracion === "I3" && (n.funcionamiento === "F2" || n.funcionamiento === "F3"));
  return {
    valor: base.length ? ok.length / base.length : 0,
    pct: base.length ? Math.round((ok.length / base.length) * 100) : 0,
    incluidos: ok.length,
    total: base.length,
  };
}

/** Promedio Q0-Q3 sobre nodos Actual verificados. NV y Futuro no entran. */
export function robustez(proyecto) {
  const Q = { Q3: 3, Q2: 2, Q1: 1, Q0: 0 };
  const rubrica = cuenta(proyecto); // ya excluye futuro y propuestas
  const base = rubrica.filter((n) => n.calidad in Q);
  const suma = base.reduce((a, n) => a + Q[n.calidad], 0);
  return {
    valor: base.length ? suma / base.length : 0,
    escala: base.length ? suma / base.length / 3 : 0,
    incluidos: base.length,
    total: rubrica.length,
  };
}

/**
 * Cuánto del negocio está cubierto.
 * Un paso integrado cuenta entero; uno parcial, medio. Un paso ausente, cero.
 * Así el número refleja lo que el área puede usar hoy, no sólo lo que existe.
 */
export function negocio(proyecto) {
  const base = cuenta(proyecto);
  const puntos = base.reduce(
    (a, n) => a + (n.integracion === "I3" ? 1 : n.integracion === "I2" ? 0.5 : 0),
    0
  );
  return {
    valor: base.length ? puntos / base.length : 0,
    pct: base.length ? Math.round((puntos / base.length) * 100) : 0,
    completos: base.filter((n) => n.integracion === "I3").length,
    parciales: base.filter((n) => n.integracion === "I2").length,
    ausentes: base.filter((n) => n.integracion === "I0").length,
    total: base.length,
  };
}

/** Cuántos pasos existen, sin juzgar si aguantan fallos. */
export function construido(proyecto) {
  const base = cuenta(proyecto);
  const ok = base.filter((n) => n.integracion === "I3");
  return {
    valor: base.length ? ok.length / base.length : 0,
    pct: base.length ? Math.round((ok.length / base.length) * 100) : 0,
    incluidos: ok.length,
    total: base.length,
  };
}

export function veredictoGlobal(proyecto) {
  if (proyecto.sinDiagnostico) {
    return { estado: "sin-diagnostico", etiqueta: "Sin diagnosticar", cobertura: null, robustez: null, verificados: 0, total: 0 };
  }

  const c = cobertura(proyecto);
  const r = robustez(proyecto);
  const hecho = construido(proyecto);
  const negocioPct = negocio(proyecto);

  const estado = r.escala >= 0.8 ? "solido" : r.escala >= 0.55 ? "aceptable" : r.escala >= 0.34 ? "atencion" : "critico";

  return {
    estado,
    etiqueta: `Cobertura ${c.pct}% · ${ROBUSTEZ_LABEL[estado] || estado}`,
    estadoTexto: ETIQUETA_CORTA[estado] || estado,
    cobertura: c,
    construido: hecho,
    negocio: negocioPct,
    robustez: r,
    verificados: r.incluidos,
    total: r.total,
    formula: `${c.incluidos}/${c.total} nodos integrados y funcionando · ${r.incluidos} nodos verificados en calidad`,
  };
}

export function desactualizado(proyecto, commitActual) {
  if (!commitActual || !proyecto.commit) return null;
  const corto = (c) => String(c).slice(0, 7);
  if (corto(proyecto.commit) === corto(commitActual)) return null;
  return { diagnostico: proyecto.commit, actual: commitActual, fecha: proyecto.fecha };
}

export function adaptAll(entries) {
  return entries.map(({ raw, project }) => adaptProject(raw, project));
}
