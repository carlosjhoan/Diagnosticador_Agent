// Etiquetas y render puro de la traza. Compartido entre la UI y los tests.

export { esc } from "./esc.mjs";
import { esc } from "./esc.mjs";

export const TRACE_LABEL = {
  "run.started": "consulta recibida",
  "guard.noise": "descartada como ruido",
  "facet.recalc": "recalculado desde el grafo",
  "decompose.done": "desglose del grafo",
  "cache.hit": "respondido desde cache",
  "budget.exceeded": "presupuesto agotado, sin auditoría",
  "stage.failed": "etapa caída, se usó el respaldo",
  "stage.retry": "reintentando la llamada al modelo",
  "interpret.done": "intención interpretada",
  "scope.resolved": "alcance verificado",
  "compose.started": "componiendo la vista",
  "compose.done": "vista compuesta",
  "audit.done": "auditoría de Jev",
  "render.ready": "lista para mostrar",
  "tool.requested": "herramienta propuesta",
  "tool.rejected": "herramienta descartada",
  "run.finished": "fin",
  "run.failed": "el pipeline falló",
};

export const TRACE_STATE = {
  "guard.noise": "warn",
  "stage.failed": "failed",
  "run.failed": "failed",
  "tool.rejected": "warn",
};

export const STAGE_LABEL = {
  "run.started": "entendiendo la consulta",
  "guard.noise": "descartando ruido",
  "facet.recalc": "recalculando del grafo",
  "decompose.done": "separando el dato",
  "cache.hit": "usando cache local",
  "budget.exceeded": "cortando por tiempo",
  "interpret.done": "interpretando la intención",
  "scope.resolved": "verificando alcance",
  "compose.started": "componiendo la vista",
  "compose.done": "vista compuesta",
  "audit.done": "auditando con Jev",
  "render.ready": "listo",
  "tool.requested": "preparando el envío",
  "tool.rejected": "descartando la herramienta",
  "stage.failed": "reintentando por una etapa caída",
  "stage.retry": "reintentando el modelo",
  "run.finished": "listo",
  "run.failed": "el pipeline falló",
};

export const labelFor = (type) => TRACE_LABEL[type] || type;
export const stateFor = (type) => TRACE_STATE[type] || "done";
export const stageFor = (type) => STAGE_LABEL[type] || "";

export function fmtMs(ms) {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms";
}

export function traceDetail(ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case "scope.resolved":
      return d.original != null
        ? `original ${Number(d.original).toFixed(2)} · ${(d.intents || []).length} intención(es)`
        : "alcance léxico";
    case "compose.done":
      return `${esc(d.view || "")}${d.title ? " · " + esc(d.title) : ""}${d.degraded ? " · respaldo" : ""}`;
    case "audit.done": {
      const s = d.scores || {};
      return Object.entries(s).map(([k, v]) => `${esc(k)} ${Number(v).toFixed(2)}`).join(" · ") || esc(d.status || "");
    }
    case "run.finished":
      return d.ms != null ? fmtMs(d.ms) : "";
    case "stage.failed":
      return esc(d.stage || "") + (d.reason ? ` · ${esc(String(d.reason).slice(0, 40))}` : "");
    default:
      return "";
  }
}

export function traceRowClass(ev) {
  return "trace-row " + stateFor(ev.type);
}

export function traceChipsHtml(ev) {
  const intents = ev.data?.intents;
  if (!Array.isArray(intents) || !intents.length) return "";
  const chips = intents
    .map(
      (i) =>
        `<span class="intent ${i.inScope ? "in" : "out"}" title="${i.inScope ? "en alcance" : "fuera de alcance"}">${esc(
          i.texto
        )}</span>`
    )
    .join("");
  return `<div class="trace-intents"><div class="intents">${chips}</div></div>`;
}

export function traceRowHtml(ev) {
  const detail = traceDetail(ev);
  const hasData = ev.data && Object.keys(ev.data).length > 0;
  return `<span class="trace-ico" aria-hidden="true"></span>
    <span class="trace-body">
      <span class="trace-label">${esc(labelFor(ev.type))}</span>
      ${detail ? `<span class="trace-detail">${detail}</span>` : ""}
      ${traceChipsHtml(ev)}
    </span>
    <span class="trace-ms">${fmtMs(ev.t || 0)}</span>
    ${hasData ? `<button class="trace-more" type="button" aria-label="ver payload">datos</button>` : ""}
    ${hasData ? `<pre class="trace-payload" hidden>${esc(JSON.stringify(ev.data, null, 1))}</pre>` : ""}`;
}

export function fmtCost(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  return "$" + v.toFixed(4);
}

export function fmtTokens(n) {
  const v = Number(n) || 0;
  return v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v);
}
