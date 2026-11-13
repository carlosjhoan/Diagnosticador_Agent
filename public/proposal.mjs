/**
 * Propuesta de versión robusta.
 *
 * Esto NO es diagnóstico: es una propuesta. Cada recomendación cita el
 * hallazgo que la origina, y si ese hallazgo no existe en el diagnóstico
 * real, se descarta. Nada de consejos genéricos.
 */

const PROPOSALS = {
  cotizador: {
    objetivo: "Pre-cotizaciones reproducibles: mismo archivo y misma fecha dan el mismo rango, y el resultado se puede auditar.",
    infra: [
      {
        id: "vigencia",
        nombre: "Fecha de cotización y ventana de vigencia",
        resuelve: ["F01", "F05", "H8"],
        esfuerzo: "M",
        detalle: "Cada cotización guarda su fecha y su moneda. El corpus filtra por ventana declarada y ajusta por inflación cuando corresponde.",
      },
      {
        id: "cola",
        nombre: "Cola de trabajos con reintentos",
        resuelve: ["F03", "F11"],
        esfuerzo: "M",
        detalle: "El job deja de depender de un host secuencial: se encola, reintenta con espera y se puede recuperar si el proceso cae.",
      },
      {
        id: "cache",
        nombre: "Caché por hash de archivo y por comparación",
        resuelve: ["F10", "F04", "F09"],
        esfuerzo: "S",
        detalle: "El mismo archivo no se extrae dos veces. La comparación se cachea por combinación de ítem y candidatos.",
      },
      {
        id: "motor",
        nombre: "Un solo motor de precio",
        resuelve: ["F06", "F04"],
        esfuerzo: "M",
        detalle: "Una única ruta de cálculo con tests de referencia. Si la IA participa, entra como evidencia ponderada, no como precio.",
      },
      {
        id: "observabilidad",
        nombre: "Trazas por llamada al modelo",
        resuelve: ["F08", "F07"],
        esfuerzo: "S",
        detalle: "Duración, tokens, costo y resultado de cada llamada, correlacionados por proyecto. Sin esto no se puede afirmar que el sistema mejora.",
      },
      {
        id: "guardas",
        nombre: "Rate limit y escaneo de archivos",
        resuelve: ["F12", "F13"],
        esfuerzo: "S",
        detalle: "Límite por origen en el intake y análisis del archivo subido antes de procesarlo.",
      },
    ],
    escenarios: [
      {
        id: "1",
        etiqueta: "1 comercial",
        cambia: ["Todo el flujo corre en un solo host.", "El costo por pre-cotización es medible y estable."],
      },
      {
        id: "5",
        etiqueta: "5 comerciales",
        cambia: ["La cola separa trabajos por comercial.", "La caché por archivo evita repetir extracción.", "Aparece el costo por llamada como métrica de operación."],
      },
      {
        id: "10",
        etiqueta: "10 comerciales",
        cambia: ["El host secuencial deja de alcanzar: hace falta concurrencia real.", "Los límites del proveedor de IA pasan a ser el cuello de botella.", "La vigencia del histórico deja de ser opcional: sin ella el rango se degrada."],
      },
    ],
    fases: [
      { nombre: "Cerrar la base de datos", esfuerzo: "M", cierra: ["F01", "F05"], dependeDe: [] },
      { nombre: "Hacer el trabajo recuperable", esfuerzo: "M", cierra: ["F03", "F11"], dependeDe: ["Cerrar la base de datos"] },
      { nombre: "Unificar el precio", esfuerzo: "M", cierra: ["F06", "F04"], dependeDe: ["Cerrar la base de datos"] },
      { nombre: "Medir para poder decidir", esfuerzo: "S", cierra: ["F08", "F07", "F10"], dependeDe: ["Hacer el trabajo recuperable"] },
    ],
    riesgos: [
      { texto: "Unificar el motor de precio puede mover rangos ya entregados.", supuesto: "Hay cotizaciones históricas para comparar antes y después." },
      { texto: "La caché por archivo puede servir un resultado de un contexto viejo.", supuesto: "La fecha de cotización se implementa antes que la caché." },
    ],
  },

  landing: {
    objetivo:
      "Un sitio que se puede actualizar sin tocar código, medir y recorrer sin perder lo respondido. " +
      "La gestión de contenido y la medición no estaban en el alcance original: se proponen acá.",
    infra: [
      {
        id: "cms",
        nombre: "Contenido y media fuera del código",
        resuelve: ["F01", "F03", "F04"],
        esfuerzo: "M",
        detalle:
          "Capacidad nueva, no deuda: hoy no existe y nunca se pidió. Proyectos, soluciones, textos y video viven en datos, no en componentes. Editar no requiere deploy.",
      },
      {
        id: "analitica",
        nombre: "Medición y aprendizaje",
        resuelve: ["F02"],
        esfuerzo: "S",
        detalle:
          "Capacidad nueva, no deuda. Eventos de visita, inicio y fin del recorrido, y contacto; con eso se sabe qué convierte y qué se cae.",
      },
      {
        id: "persistencia",
        nombre: "Progreso del cuestionario persistido",
        resuelve: ["F05"],
        esfuerzo: "M",
        detalle: "Guardado parcial por paso, retomable. Hoy abandonar significa empezar de cero.",
      },
      {
        id: "contacto",
        nombre: "Contacto accionable",
        resuelve: ["F06"],
        esfuerzo: "S",
        detalle: "WhatsApp y agenda además del teléfono.",
      },
      {
        id: "seo",
        nombre: "SEO técnico y semántica",
        resuelve: ["F07", "F10"],
        esfuerzo: "S",
        detalle: "Metadatos, idioma consistente y datos estructurados por proyecto.",
      },
    ],
    escenarios: [
      { id: "1", etiqueta: "Sólo captura", cambia: ["El sitio presenta y captura.", "La medición es la única fuente de verdad sobre el embudo."] },
      { id: "2", etiqueta: "Captura + casos", cambia: ["Los casos de estudio entran como contenido navegable.", "Aparece la necesidad de versionar el contenido."] },
      { id: "3", etiqueta: "Multi-idioma", cambia: ["El contenido se duplica por idioma.", "La nomenclatura de assets deja de ser cosmética."] },
    ],
    fases: [
      { nombre: "Sacar el contenido del código", esfuerzo: "M", cierra: ["F01", "F03"], dependeDe: [] },
      { nombre: "Medir", esfuerzo: "S", cierra: ["F02"], dependeDe: ["Sacar el contenido del código"] },
      { nombre: "No perder lo respondido", esfuerzo: "M", cierra: ["F05"], dependeDe: ["Medir"] },
      { nombre: "Encontrar y contactar", esfuerzo: "S", cierra: ["F06", "F07"], dependeDe: ["Medir"] },
    ],
    riesgos: [
      { texto: "Mover contenido a datos puede romper el diseño actual.", supuesto: "Existe una revisión visual antes de publicar." },
      { texto: "La medición puede quedar sin dueño y nadie mira los números.", supuesto: "Hay una persona asignada a leerlos cada mes." },
    ],
  },

  gerencial: {
    objetivo: "Un estado del proyecto único, con roles reales y trazabilidad desde el sí del cliente hasta la producción.",
    infra: [
      {
        id: "estado",
        nombre: "Estado del proyecto como entidad",
        resuelve: ["F01", "F03"],
        esfuerzo: "M",
        detalle: "Un proyecto tiene estado, etapa y fechas. El dashboard mide proyectos, no tareas suel­tas.",
      },
      {
        id: "produccion",
        nombre: "Tramo de producción",
        resuelve: ["F02"],
        esfuerzo: "L",
        detalle: "Medidas, ingeniería y producción como etapas con responsables y fechas.",
      },
      {
        id: "roles",
        nombre: "Roles en base de datos y auditoría única",
        resuelve: ["F05", "F06"],
        esfuerzo: "M",
        detalle: "Permisos por etapa y un solo registro de auditoría, consultable.",
      },
      {
        id: "integracion",
        nombre: "Puente con el Pre-cotizador",
        resuelve: ["F10"],
        esfuerzo: "L",
        detalle: "El proyecto nace en el cotizador y sigue vivo en el gerencial, sin recargar datos.",
      },
      {
        id: "datos",
        nombre: "Frescura y calidad del dato",
        resuelve: ["F04", "F07"],
        esfuerzo: "S",
        detalle: "El intelligence no puede estar 15 días atrás. El motivo de pérdida deja de ser opcional.",
      },
    ],
    escenarios: [
      { id: "1", etiqueta: "Gerencia", cambia: ["Vista completa de todos los proyectos.", "Sin permisos por etapa todavía."] },
      { id: "2", etiqueta: "Jefes de área", cambia: ["Cada jefe ve sólo su etapa.", "La auditoría pasa a ser obligatoria para saber quién cambió qué."] },
      { id: "3", etiqueta: "Socios", cambia: ["Vista agregada sin detalle operativo.", "Los permisos se vuelven el eje del diseño, no un agregado."] },
    ],
    fases: [
      { nombre: "Proyecto con estado", esfuerzo: "M", cierra: ["F01", "F03"], dependeDe: [] },
      { nombre: "Roles y auditoría", esfuerzo: "M", cierra: ["F05", "F06"], dependeDe: ["Proyecto con estado"] },
      { nombre: "Producción", esfuerzo: "L", cierra: ["F02"], dependeDe: ["Proyecto con estado"] },
      { nombre: "Puente con el cotizador", esfuerzo: "L", cierra: ["F10", "F04"], dependeDe: ["Producción"] },
    ],
    riesgos: [
      { texto: "El tramo de producción es el más grande y el más expuesto a cambios de proceso.", supuesto: "El proceso real está documentado y es estable." },
      { texto: "Los roles sin auditoría dan una falsa sensación de control.", supuesto: "Se implementan juntos, no por separado." },
    ],
  },
};

/**
 * Cruza la propuesta con el diagnóstico real.
 * Descarta cualquier recomendación que cite un hallazgo inexistente.
 */
export function buildProposal(project) {
  const prop = PROPOSALS[project.id];
  if (!prop || project.sinDiagnostico) return null;

  const hallazgos = new Map(project.hallazgos.map((h) => [h.id, h]));
  const vivos = (ids) => ids.filter((id) => hallazgos.has(id));

  const infra = prop.infra
    .map((i) => ({ ...i, resuelve: vivos(i.resuelve) }))
    .filter((i) => i.resuelve.length);

  const fases = prop.fases
    .map((f) => ({ ...f, cierra: vivos(f.cierra) }))
    .filter((f) => f.cierra.length);

  const cubiertos = new Set(infra.flatMap((i) => i.resuelve));
  const p0 = project.hallazgos.filter((h) => h.severidad === "P0");
  const p0Cubiertos = p0.filter((h) => cubiertos.has(h.id));

  const sinAncla = prop.infra.filter((i) => !vivos(i.resuelve).length).map((i) => i.id);

  return {
    objetivo: prop.objetivo,
    infra,
    escenarios: prop.escenarios,
    fases,
    riesgos: prop.riesgos,
    cobertura: {
      p0Total: p0.length,
      p0Cubiertos: p0Cubiertos.length,
      p0Sueltos: p0.filter((h) => !cubiertos.has(h.id)).map((h) => h.id),
    },
    descartadas: sinAncla,
  };
}

export function proposalFor(projectId) {
  return PROPOSALS[projectId] || null;
}
