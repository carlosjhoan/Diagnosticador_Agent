import {
  esc,
  stageFor,
  fmtMs,
  fmtTokens,
} from "./trace-labels.mjs";
import { parseFrame } from "./sse.mjs";
import { openEmail, mountEmail } from "./emailui.mjs";
import { renderDashboard, playWindowOpen, finish as finishHome } from "./dashboard.mjs";
import { renderProject } from "./project.mjs";
import { openNodeModal, renderNodeInline } from "./nodemodal.mjs";
import { runUiAction } from "./uiactions.mjs";
import { renderProposal } from "./proposalview.mjs";
import { skeletonFor } from "./skeleton.mjs";
import { renderLayout } from "./components/registry.mjs";
import { enhanceFlowanim } from "./flowanim.mjs";
import { createVoice, appendText } from "./voice.mjs";
import { startMeter } from "./meter.mjs";
import { buildSteps, applyEvent, replay, summary } from "./steps.mjs";
import { usageShares, PROVIDERS } from "./usage.mjs";
import { fmtCop, fmtUsd, copFromUsd } from "./money.mjs";
import {
  loadStore,
  saveStore,
  currentSession,
  addSession,
  newSessionRecord,
  makeTurn,
  trimEvents,
  sessionTotals,
  titleFrom,
} from "./session.mjs";

const state = {
  graph: null,
  diagnosticos: null,
  currentProjectId: null,
  last: null,
  events: [],
  baseHint: "",
  session: null,
  store: null,
  tab: "active",
  readonly: false,
  fx: null,
  currency: (() => {
    try { return localStorage.getItem("sng.pref.currency") === "USD" ? "USD" : "COP"; } catch { return "COP"; }
  })(),
  currentTurn: null,
  lastRun: null,
  tabSession: { runs: 0, cost: 0, ms: 0 },
  greeting: null,
};

const INSTANT = new URLSearchParams(location.search).has("instant");
const prefersReduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const motion = () => !INSTANT && !prefersReduced();

if (INSTANT) document.body.classList.add("instant");

const el = (id) => document.getElementById(id);

const SEV_ORDER = { critical: 0, high: 1, medium: 2 };
const TYPE_LABEL = { gap: "falta", risk: "riesgo", debt: "deuda" };

async function boot() {
  mountRail();
  mountEmail();

  const [res, fx] = await Promise.all([
    fetch("./data/graph.json"),
    fetch("./api/fx").then((r) => r.json()).catch(() => null),
  ]);
  state.graph = await res.json();
  state.fx = fx;
  state.store = loadStore();
  state.session = currentSession(state.store);
  renderSessions();
  setEmptySession();
  if (state.session.turns.length) {
    // El dashboard es la portada de la sesión, no un estado que el historial borra.
    await renderWelcome({ animate: false });
    renderTranscript({ append: true });
    renderSession();
    state.question = state.session.turns.at(-1).pregunta;
  } else {
    renderWelcome();
  }
  checkHealth();
}

const STATUS = {
  cargando: "Iniciando",
  activo: "Activo · sistema en línea",
  trabajando: "Trabajando · consulta en curso",
  parcial: "Activo · sin verificación de respuestas",
  local: "Modo local · sin modelo generativo",
  degradado: "Degradado · la última vista usó un respaldo",
  error: "Error · el último intento falló",
  offline: "Sin conexión con el servidor",
  limite: "Límite alcanzado · el proveedor frenó las consultas",
  sintasa: "Sin tasa de cambio · usando valor de respaldo",
  avion: "Modo avión · respondiendo desde el cache",
};

function setStatus(name) {
  const box = el("status");
  if (!box) return;
  const label = STATUS[name] || name;
  box.dataset.state = name;
  box.dataset.tip = label;
  box.removeAttribute("title");
  box.setAttribute("aria-label", "Estado: " + label);
}

async function checkHealth() {
  try {
    const r = await fetch("./api/health");
    const j = await r.json();
    const s = el("status");
    state.baseStatus = j.model ? (j.jev ? "activo" : "parcial") : "local";
    if (state.fx && state.fx.source === "configurado") state.baseStatus = "sintasa";
    setStatus(state.baseStatus);
    el("hint").textContent = !j.model
      ? "Modo local: las respuestas salen del grafo sin modelo generativo."
      : !j.jev
      ? "Verificación desactivada: falta la clave de auditoría."
      : "";
    state.baseHint = el("hint").textContent;
  } catch {
    state.baseStatus = "offline";
    setStatus("offline");
  }
}

const EXAMPLES = [
  "¿Qué riesgos corro en el Comercial?",
  "¿Qué falta para robustecer el Gerencial Brain?",
  "¿Cómo se conectan la Landing y el Comercial?",
  "Muéstrame el proceso de cotización paso a paso",
];

/* Sesión sin interacciones: el compositor se agranda y sube. */
let composerTimer = null;

function setEmptySession() {
  const empty = !state.session || state.session.turns.length === 0;
  document.body.classList.toggle("is-empty", empty);

  // Siempre se resetea: el compositor sólo puede aparecer cuando la secuencia
  // del home lo indique, no porque quedó la clase de la sesión anterior.
  document.body.classList.remove("composer-ready");
  clearTimeout(composerTimer);

  if (empty) {
    // red de seguridad: si la animación no corriera, el compositor no puede quedar oculto
    composerTimer = setTimeout(() => document.body.classList.add("composer-ready"), 5000);
  }
  const input = el("input");
  if (input) input.setAttribute("rows", empty ? "3" : "1");

  // El alto en línea queda pegado del estado anterior: hay que soltarlo
  // y volver a medir cuando el CSS ya cambió.
  requestAnimationFrame(() => {
    if (inputEl) inputEl.style.height = "";
    growInput();
  });
}

/* Plegar el riel: la conversación gana todo el ancho. */
function setRail(hidden) {
  document.body.classList.toggle("rail-hidden", hidden);
  const btn = el("rail-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", String(hidden));
    btn.title = hidden ? "Mostrar conversaciones" : "Ocultar conversaciones";
  }
  try {
    localStorage.setItem("sng.rail", hidden ? "0" : "1");
  } catch {
    /* sin storage */
  }
}

function mountRail() {
  const btn = el("rail-toggle");
  if (!btn) return;
  let visible = true;
  try {
    visible = localStorage.getItem("sng.rail") !== "0";
  } catch {
    /* sin storage */
  }
  setRail(!visible);
  btn.addEventListener("click", () => setRail(!document.body.classList.contains("rail-hidden")));
}

function uiContext() {
  return {
    projects: state.diagnosticos || [],
    currentProject: () => (state.diagnosticos || []).find((p) => p.id === state.currentProjectId) || null,
    openProject,
    openNode: (project, nodeId) => openNodeModal(project, nodeId),
    openNodeView: (proyectoId, nodoId) =>
      appendView({ tipo: "nodo", proyectoId, nodoId }, `${nodoId} en ${proyectoId}`),
    focusNode: (nodeId) => projectView?.focusNode?.(nodeId),
  };
}

function openProposal(id) {
  const project = (state.diagnosticos || []).find((p) => p.id === id);
  if (!project) return;
  appendView({ tipo: "propuesta", proyectoId: id }, `Versión robusta del ${project.nombre}`);
}

/** Una vista del dashboard como entrada del hilo, no como página. */
/** Pinta la vista en la tarjeta que ya está en el canvas. */
function llenarTurno(turn) {
  let card = el("canvas").querySelector('[data-id="' + turn.id + '"]');
  if (!card) card = appendTurnCard(turn);
  pintarVista(turn);
  scrollTurnIntoView(card);
  saveStore(state.store);
}

function entradaEscalonada(card) {
  if (!motion()) return;
  const view = card.querySelector(".view");
  if (!view) return;
  [...view.children].forEach((child, i) => child.style.setProperty("--i", Math.min(i, 12)));
}

function pintarVista(turn) {
  const card = el("canvas").querySelector('[data-id="' + turn.id + '"]');
  if (!card || !turn.vista) return;
  const body = card.querySelector(".turn-body");
  const foot = card.querySelector(".turn-foot");
  if (foot) foot.innerHTML = footHtml(turn);
  const project = (state.diagnosticos || []).find((p) => p.id === turn.vista.proyectoId);
  if (!project) {
    body.innerHTML = '<p class="nm-empty">Ese proyecto no está en los diagnósticos.</p>';
    return;
  }

  const hostId = "v-" + turn.id;
  body.innerHTML = '<div class="view" id="' + hostId + '"></div>';
  const host = el(hostId);
  if (!host) return;

  entradaEscalonada(card);

  if (turn.vista.tipo === "proyecto") {
    projectView?.destroy?.();
    state.currentProjectId = project.id;

    body.innerHTML = '<div class="view" id="' + hostId + '">' +
      '<p class="say">Este es el esquema de lo planteado para el proyecto <b>' + esc(project.nombre) + '</b>.</p>' +
      '<div id="' + hostId + '-inner"></div>' +
      '<div class="say-sug" id="' + hostId + '-sug"></div>' +
      '<button type="button" class="say-cta" id="' + hostId + '-cta">¿Deseas ver sugerencias para hacerlo más robusto?</button>' +
      '</div>';

    const inner = el(hostId + "-inner");
    if (inner) {
      projectView = renderProject(inner, project, {
        inline: true,
        onNode: (nodeId) => openNodeModal(project, nodeId),
        onProposal: () => appendView({ tipo: "propuesta", proyectoId: project.id }, `Versión robusta del ${project.nombre}`),
      });
    }
    sugerirPasos(el(hostId + "-sug"), project);

    el(hostId + "-cta")?.addEventListener("click", () =>
      appendView({ tipo: "propuesta", proyectoId: project.id }, `Versión robusta del ${project.nombre}`)
    );
    return;
  }

  if (turn.vista.tipo === "nodo") {
    body.innerHTML = '<div class="view" id="' + hostId + '">' +
      '<p class="say">Así está hoy este paso del <b>' + esc(project.nombre) + '</b>.</p>' +
      '<div id="' + hostId + '-inner"></div></div>';
    const inner = el(hostId + "-inner");
    if (inner) {
      renderNodeInline(inner, project, turn.vista.nodoId, {
        onExpand: () => openNodeModal(project, turn.vista.nodoId),
      });
    }
    return;
  }

  if (turn.vista.tipo === "propuesta") {
    body.innerHTML = '<div class="view" id="' + hostId + '">' +
      '<p class="say">Esta es la propuesta para robustecer <b>' + esc(project.nombre) + '</b>.</p>' +
      '<div id="' + hostId + '-inner"></div></div>';
    const inner = el(hostId + "-inner");
    if (inner) renderProposal(inner, project, { inline: true });
    return;
  }
}

/** Invita a explorar cualquier paso, con ejemplos del proyecto que se muestra. */
function sugerirPasos(host, project) {
  // Los ejemplos salen del propio proyecto: primero lo que está flojo.
  const rank = (n) => {
    if (n.integracion === "I0") return 0;
    if (n.calidad === "Q1" || n.calidad === "Q0") return 1;
    if (n.integracion === "I2") return 2;
    return 3;
  };
  const ejemplos = project.nodos
    .filter((n) => !n.fueraDeRubrica)
    .sort((x, y) => rank(x) - rank(y) || x.orden - y.orden)
    .slice(0, 3)
    .map((n) => '“' + n.nombre + '”');

  const hint = ejemplos.length
    ? '<p class="say-sug-hint">Por ejemplo: ' +
      ejemplos.slice(0, -1).join(", ") +
      (ejemplos.length > 1 ? " o " : "") +
      ejemplos[ejemplos.length - 1] +
      ".</p>"
    : "";

  host.innerHTML =
    '<p class="say-sug-label">Explora cualquier paso del ' +
    esc(project.nombre) +
    ': dime cuál y te muestro el detalle.</p>' +
    hint;
}

/** Agrega una exploración al hilo y la persiste como turno. */
function appendView(vista, etiqueta) {
  const turn = makeTurn(etiqueta);
  turn.vista = vista;

  if (!state.session.title) {
    state.session.title = titleFrom(etiqueta);
    state.session.updatedAt = new Date().toISOString();
    renderSessions();
  }

  state.session.turns.push(turn);
  state.currentTurn = turn;
  appendTurnCard(turn);
  setEmptySession();
  pintarVista(turn);
  scrollCanvasToEnd();
  saveStore(state.store);
}

let projectView = null;

function openProject(id) {
  const project = (state.diagnosticos || []).find((p) => p.id === id);
  if (!project) return;
  pauseGreeting();
  appendView({ tipo: "proyecto", proyectoId: id }, `Explorar ${project.nombre}`);
}

async function renderWelcome({ animate = true } = {}) {
  pauseGreeting();
  const canvas = el("canvas");

  // Esqueleto mientras llegan los diagnósticos: nunca un spinner genérico.
  canvas.innerHTML = `<div class="view welcome"><div class="home-skel">
    <span class="skel-line" style="width:34%"></span>
    <span class="skel-line" style="width:58%;height:26px"></span>
    <div class="home-cards">${[0, 1, 2].map(() => '<div class="pcard is-skel"></div>').join("")}</div>
  </div></div>`;

  try {
    if (!state.diagnosticos) {
      const res = await fetch("./api/diagnosticos");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.diagnosticos = (await res.json()).projects || [];
    }
  } catch (e) {
    canvas.innerHTML = `<div class="view welcome">
      <span class="b-eyebrow">diagnóstico</span>
      <h1 class="welcome-title">No pude leer los diagnósticos.</h1>
      <p class="welcome-text">${esc(String(e.message || e))}. Los datos viven en public/data y se sincronizan con scripts/sync-data.mjs.</p>
      <div class="welcome-examples">
        <button class="oos-chip" id="home-retry">Reintentar</button>
      </div>
    </div>`;
    el("home-retry")?.addEventListener("click", renderWelcome);
    return;
  }

  canvas.innerHTML = `<div class="view welcome" id="home-host"></div>`;
  const host = el("home-host");
  renderDashboard(host, state.diagnosticos, (id) => openProject(id), { animate: false });

  if (animate) playWindowOpen(host, { ms: 1700 });
  else finishHome(host);
}

function pauseGreeting() {
  if (state.greeting) {
    state.greeting.cancel();
    state.greeting = null;
  }
}

function findings(projectId) {
  const p = state.graph.projects.find((x) => x.id === projectId);
  return p ? p.findings : [];
}

function allFindings() {
  return state.graph.projects.flatMap((p) => p.findings.map((f) => ({ ...f, project: p.id })));
}

function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(status)}</span>`;
}

/* ---------- views ---------- */

function viewMap() {
  const cards = state.graph.projects
    .map((p) => {
      const c = { critical: 0, high: 0, medium: 0 };
      p.findings.forEach((f) => (c[f.sev] = (c[f.sev] || 0) + 1));
      return `<article class="proj">
        <h3>${esc(p.name)}</h3>
        <span class="sub">${esc(p.subtitle)}</span>
        <p class="role">${esc(p.role)}</p>
        <p class="stat">${esc(p.status)}</p>
        <div class="sev-count">
          <span><b>${c.critical || 0}</b> críticos</span>
          <span><b>${c.high || 0}</b> altos</span>
          <span><b>${c.medium || 0}</b> medios</span>
        </div>
      </article>`;
    })
    .join("");

  const seams = state.graph.seams
    .map(
      (s) => `<div class="seam">
        <span class="link">${esc(s.from)} → ${esc(s.to)}</span>
        <span class="impact">${esc(s.impact)}</span>
        ${badge(s.status)}
      </div>`
    )
    .join("");

  return `<div class="map-grid">${cards}</div>
    <div class="seams"><h4>Las costuras entre proyectos</h4>${seams}</div>`;
}

function viewFlow() {
  const p = (id) => state.graph.projects.find((x) => x.id === id);
  const link = (s) => `<div class="flow-link">
      <span class="lbl">${esc(s.label)}</span>
      <span class="arrow">—▶</span>
      ${badge(s.status)}
    </div>`;
  const node = (id) => {
    const x = p(id);
    return `<div class="flow-node"><h4>${esc(x.name)}</h4><p>${esc(x.status)}</p></div>`;
  };
  const s1 = state.graph.seams.find((s) => s.id === "S1");
  const s2 = state.graph.seams.find((s) => s.id === "S2");
  return `<div class="flow">
      ${node("landing")}${link(s1)}${node("comercial")}${link(s2)}${node("gerencial")}
    </div>
    <div class="seams"><h4>Lo que no está conectado</h4>
      ${state.graph.seams
        .filter((s) => ["S3", "S4", "S5", "S6"].includes(s.id))
        .map(
          (s) => `<div class="seam"><span class="link">${esc(s.label)}</span>
            <span class="impact">${esc(s.impact)}</span>${badge(s.status)}</div>`
        )
        .join("")}
    </div>`;
}

function viewScope(projectId) {
  const x = state.graph.projects.find((p) => p.id === projectId) || state.graph.projects[0];
  return `<div class="two-col">
    <div class="col-card"><h4>Qué debería haber recibido</h4><ul>${x.expected.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
    <div class="col-card"><h4>Qué hay hoy</h4><ul>${x.delivered.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
  </div>`;
}

function viewGaps(projectId, focus) {
  const list = (projectId ? findings(projectId) : allFindings())
    .filter((f) => f.type === "gap" || f.type === "debt")
    .filter((f) => !focus || !focus.length || focus.includes(f.id))
    .sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
  if (!list.length) return `<p class="empty">Sin hallazgos de este tipo.</p>`;
  return list
    .map(
      (f) => `<div class="finding ${esc(f.sev)}">
        <div class="head"><span class="id">${esc(f.id)}</span>
        <span class="sev">${esc(f.sev)} · ${TYPE_LABEL[f.type] || ""}</span></div>
        <div class="claim">${esc(f.claim)}</div>
        <div class="ev">${esc(f.evidence)}</div>
      </div>`
    )
    .join("");
}

function viewRisks(projectId, focus) {
  const list = (projectId ? findings(projectId) : allFindings())
    .filter((f) => f.type === "risk")
    .filter((f) => !focus || !focus.length || focus.includes(f.id))
    .sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
  if (!list.length) return `<p class="empty">Sin riesgos identificados en este recorte.</p>`;
  return list
    .map(
      (f) => `<div class="finding ${esc(f.sev)}">
        <div class="head"><span class="id">${esc(f.id)}${f.project ? " · " + esc(f.project) : ""}</span>
        <span class="sev">${esc(f.sev)}</span></div>
        <div class="claim">${esc(f.claim)}</div>
        <div class="ev">${esc(f.evidence)}</div>
      </div>`
    )
    .join("");
}

function viewCompare() {
  const rows = ["expected", "delivered"]
    .map((k) => {
      const label = k === "expected" ? "Qué debería recibir" : "Qué hay";
      return `<tr><td>${label}</td>${state.graph.projects
        .map((p) => `<td>${p[k].length} ítems — ${esc(p.status)}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  const gaps = `<tr><td>Qué falta</td>${state.graph.projects
    .map((p) => {
      const n = p.findings.filter((f) => f.type === "gap").length;
      return `<td>${n} brechas</td>`;
    })
    .join("")}</tr>`;
  const risks = `<tr><td>Riesgos</td>${state.graph.projects
    .map((p) => {
      const n = p.findings.filter((f) => f.type === "risk").length;
      return `<td>${n} riesgos</td>`;
    })
    .join("")}</tr>`;
  return `<table class="matrix">
    <thead><tr><th></th>${state.graph.projects.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead>
    <tbody>${rows}${gaps}${risks}</tbody>
  </table>`;
}

function viewEvidence(projectId, focus) {
  const list = (projectId ? findings(projectId) : allFindings()).filter(
    (f) => !focus || !focus.length || focus.includes(f.id)
  );
  return `<div class="evidence-list">${list
    .map(
      (f) => `<div class="ev-row"><code>${esc(f.id)}</code>
        <span>${esc(f.evidence)}${f.project ? ` <em>(${esc(f.project)})</em>` : ""}</span></div>`
    )
    .join("")}</div>`;
}

/* ---------- render ---------- */

function intentChips(intents) {
  if (!intents || !intents.length) return "";
  return `<div class="intents">${intents
    .map(
      (i) =>
        `<span class="intent ${i.inScope ? "in" : "out"}" title="${i.inScope ? "en alcance" : "fuera de alcance"}">${esc(i.texto)}</span>`
    )
    .join("")}</div>`;
}

function interpStrip(spec) {
  const hasIntents = spec.intents && spec.intents.length > 1;
  if (!spec.lectura && !hasIntents) return "";
  return `<div class="interp">
    <span class="interp-lbl">entendí</span>
    <span class="interp-text">${esc(spec.lectura || "")}</span>
    ${intentChips(spec.intents)}
  </div>`;
}

function viewOutOfScope(spec) {
  const s = spec.scope || { projects: [], examples: [] };
  const projs = s.projects
    .map((p) => `<div class="oos-proj"><strong>${esc(p.name)}</strong><span>${esc(p.role)}</span></div>`)
    .join("");
  const chips = s.examples
    .map((q) => `<button class="oos-chip" data-ask="${esc(q)}">${esc(q)}</button>`)
    .join("");
  const quote = spec.entendido || spec.question || "";
  const orig =
    spec.entendido && spec.entendido !== spec.question
      ? `<div class="oos-orig">escribiste: "${esc(spec.question)}"</div>`
      : "";
  const warn = spec.fidelity_warning
    ? `<div class="oos-warn">Lo que pediste no entra en el diagnóstico, ni siquiera reformulado.</div>`
    : "";
  return `<div class="oos">
    <div class="oos-q">${esc(quote)}</div>
    ${orig}
    ${warn}
    <div class="oos-line">${esc(spec.story || "No hay evidencia en el diagnóstico para responder eso.")}</div>
    ${intentChips(spec.intenciones)}
    <h4>Lo que sí está cubierto</h4>
    <div class="oos-projects">${projs}</div>
    <h4>Prueba con algo así</h4>
    <div class="oos-examples">${chips}</div>
  </div>`;
}

/* ---------- transcript: un turno por pregunta ---------- */

function hora(iso) {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

/** "Hoy" / "Ayer" / fecha corta, para no repetir el año en la mayoría de los casos. */
function fechaDe(iso) {
  try {
    const d = new Date(iso);
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Ayer";
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function badgeFor(spec) {
  const v = spec.verification;
  if (spec.degraded) {
    return `<span class="v-badge unverified" title="DeepSeek no respondió; la vista sale del grafo sin narrativa">vista determinista</span>`;
  }
  if (v && v.status === "cached") {
    return `<span class="v-badge unverified" title="${esc(v.note || "")}">cacheado · sin red</span>`;
  }
  if (v && v.status === "deterministic") {
    return `<span class="v-badge ok" title="${esc(v.note || "calculado con filtros sobre el grafo")}">calculado del grafo</span>`;
  }
  if (v && (v.status === "ok" || v.status === "rejected")) {
    const scores = v.scores || {};
    const min = Object.values(scores).length ? Math.min(...Object.values(scores)) : null;
    const label =
      v.status === "ok" ? `verificado por Jev · ${min.toFixed(2)}` : "no pasó la verificación · vista determinista";
    const detail = Object.entries(scores).map(([k, s]) => `${k} ${s.toFixed(2)}`).join(" · ");
    return `<span class="v-badge ${esc(v.status)}" title="${esc(detail || v.note || "")}">${esc(label)}</span>`;
  }
  return "";
}

function viewInner(spec) {
  const story = spec.story ? `<p class="view-story">${esc(spec.story)}</p>` : "";
  let body = "";

  if (Array.isArray(spec.layout) && spec.layout.length) {
    body = renderLayout(spec.layout);
  } else {
    switch (spec.view) {
      case "flow": body = viewFlow(); break;
      case "scope": body = viewScope(spec.projectId); break;
      case "gaps": body = viewGaps(spec.projectId, spec.focus); break;
      case "risks": body = viewRisks(spec.projectId, spec.focus); break;
      case "compare": body = viewCompare(); break;
      case "evidence": body = viewEvidence(spec.projectId, spec.focus); break;
      case "out_of_scope": body = viewOutOfScope(spec); break;
      default: body = viewMap();
    }
  }

  return `<h1 class="view-title">${esc(spec.title || "Vista")}${badgeFor(spec)}</h1>${interpStrip(spec)}${story}${body}`;
}

function canvasAtBottom() {
  const c = el("canvas");
  return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
}

/** Deja el comienzo del turno visible, no el final. */
function scrollTurnIntoView(card) {
  const c = el("canvas");
  if (!c || !card) return;
  const top = Math.max(0, (card.offsetTop || 0) - 16);
  if (typeof c.scrollTo === "function") c.scrollTo({ top, behavior: "smooth" });
  else c.scrollTop = top;
}

function scrollCanvasToEnd() {
  const c = el("canvas");
  c.scrollTop = c.scrollHeight;
}

const ICON = {
  calendar: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>`,
  stopwatch: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v4l2.5 1.6"/><path d="M9.5 2.8h5"/><path d="M12 2.8v2.4"/><path d="M18.6 7.4l1.3-1.3"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.2A2.8 2.8 0 0 0 12 8c-1.6 0-2.6.8-2.6 1.9 0 1.2 1 1.7 2.6 2 1.7.3 2.7.8 2.7 2 0 1.2-1.1 2-2.7 2a2.9 2.9 0 0 1-2.5-1.2M12 6v12"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"/></svg>`,
  source: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5 12 4l8.5 5.5M5 9.5v9M9.5 9.5v9M14.5 9.5v9M19 9.5v9M3 20.5h18"/></svg>`,
  caret: `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.8 7l7.3 5.4a1.5 1.5 0 0 0 1.8 0L20.2 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

function repaintFoots() {
  for (const t of state.session?.turns || []) {
    const card = el("canvas").querySelector('[data-id="' + t.id + '"]');
    if (!card) continue;
    const foot = card.querySelector(".turn-foot");
    if (foot) foot.innerHTML = footHtml(t);
  }
}

/** La tasa que regía cuando ocurrió el turno; si es viejo, la actual. */
async function refreshFx() {
  try {
    const j = await fetch("./api/fx").then((r) => r.json());
    if (j && j.usdToCop) state.fx = j;
  } catch {
    /* se queda la última conocida */
  }
}

function fxFor(turn) {
  return (turn && turn.fx) || state.fx || null;
}

function displayCost(usd, fx) {
  const rate = fx && fx.usdToCop;
  const cur = state.currency === "COP" && rate ? "COP" : "USD";
  if (cur === "USD") return fmtUsd(usd);
  return fmtCop(copFromUsd(usd, rate));
}

function fxDateLabel(fx) {
  if (!fx || !fx.date) return "sin fecha";
  const iso = fx.date.length === 10 ? fx.date + "T12:00:00" : fx.date;
  try {
    const rel = fechaDe(iso);
    const short = new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const when = rel === "Hoy" || rel === "Ayer" ? `${rel} · ${short}` : short;
    // cotización en vivo: se agrega la hora del tick
    return fx.date.length > 10 ? `${when} · ${hora(iso)}` : when;
  } catch {
    return fx.date;
  }
}

function footHtml(turn) {
  const fx = fxFor(turn);
  const price =
    turn.costo != null && turn.uso
      ? `<button type="button" class="u-item u-price" aria-haspopup="dialog" aria-expanded="false" title="Ver desglose de costo">
           ${ICON.coin}<span>${displayCost(turn.costo, fx)}</span>${ICON.caret}
         </button>`
      : turn.costo != null
      ? `<span class="u-item">${ICON.coin}${displayCost(turn.costo, fx)}</span>`
      : "";

  const mail = turn.spec
    ? `<button type="button" class="u-item u-mail" data-mail="${turn.id}" title="Empaquetar esta vista y enviarla por correo">
    ${ICON.mail}<span>Enviar por correo</span>
  </button>`
    : "";

  return [
    `<span class="u-item">${ICON.calendar}${fechaDe(turn.at)} · ${hora(turn.at)}</span>`,
    turn.ms ? `<span class="u-item">${ICON.stopwatch}${fmtMs(turn.ms)}</span>` : "",
    price,
    mail,
  ]
    .filter(Boolean)
    .join("");
}

function moneyLabel(value) {
  return state.currency === "COP" ? fmtCop(value) : fmtUsd(value);
}

function currencyToggle() {
  return `<span class="cp-cur">
    <button type="button" data-cur="COP" class="${state.currency === "COP" ? "on" : ""}">COP</button>
    <button type="button" data-cur="USD" class="${state.currency === "USD" ? "on" : ""}">USD</button>
  </span>`;
}

function costPopHtml(turn) {
  const fx = fxFor(turn);
  const rows = usageShares(turn.uso);
  const total = rows.reduce((a, r) => a + r.cost, 0);
  const rateLabel =
    fx && fx.usdToCop
      ? Number(fx.usdToCop).toLocaleString("es-CO", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      : "—";

  return `
    <button type="button" class="cp-close" aria-label="Cerrar">${ICON.close}</button>
    <div class="cp-head">
      <span>costo de la interacción</span>
      <strong>${displayCost(total, fx)}</strong>
    </div>
    <ul class="cp-rows">
      ${rows
        .map(
          (r) => `<li class="cp-row" style="--pc:${r.color}">
            <div class="cp-top">
              <img class="u-logo" src="${r.logo}" alt="" width="16" height="16" />
              <span class="cp-name">${esc(r.model)}</span>
              <span class="cp-cost">${displayCost(r.cost, fx)}</span>
            </div>
            <div class="cp-bar"><i data-pct="${r.pct.toFixed(1)}"></i></div>
            <div class="cp-meta">${r.pct.toFixed(0)}% · ${fmtTokens(r.tokens)} tok · ${r.calls} llam.</div>
          </li>`
        )
        .join("")}
    </ul>
    <div class="cp-foot">
      <div class="cp-fx-rows">
        <div class="cp-fx-row">${ICON.swap}<span>1 USD → <b>${rateLabel}</b> COP</span></div>
        <div class="cp-fx-row">${ICON.calendar}<span>${fxDateLabel(fx)}</span></div>
        <div class="cp-fx-row">${ICON.source}<span>${esc((fx && fx.source) || "sin fuente")}</span></div>
      </div>
      ${currencyToggle()}
    </div>`;
}

/** Histórico: suma los valores guardados, no reconvierte con la tasa de hoy. */
function sessionPopHtml(totals) {
  const cur = state.currency;
  const rows = PROVIDERS.filter((p) => totals.by[p.key] && totals.by[p.key].calls > 0).map((p) => {
    const b = totals.by[p.key];
    return {
      ...p,
      model: b.model || p.name,
      value: cur === "COP" ? b.costCop : b.cost,
      tokens: b.tokens,
      calls: b.calls,
    };
  });
  const total = cur === "COP" ? totals.cop : totals.usd;
  const first = (state.session.turns[0] || {}).at;
  const missing = totals.turns - totals.priced;

  return `
    <button type="button" class="cp-close" aria-label="Cerrar">${ICON.close}</button>
    <div class="cp-head">
      <span>costo de la sesión</span>
      <strong>${moneyLabel(total)}</strong>
    </div>
    <ul class="cp-rows">
      ${rows
        .map((r) => {
          const pct = total > 0 ? (r.value / total) * 100 : 0;
          return `<li class="cp-row" style="--pc:${r.color}">
            <div class="cp-top">
              <img class="u-logo" src="${r.logo}" alt="" width="16" height="16" />
              <span class="cp-name">${esc(r.model)}</span>
              <span class="cp-cost">${moneyLabel(r.value)}</span>
            </div>
            <div class="cp-bar"><i data-pct="${pct.toFixed(1)}"></i></div>
            <div class="cp-meta">${pct.toFixed(0)}% · ${fmtTokens(r.tokens)} tok · ${r.calls} llam.</div>
          </li>`;
        })
        .join("")}
    </ul>
    <div class="cp-foot">
      <div class="cp-fx-rows">
        <div class="cp-fx-row cp-note">${ICON.calendar}<span>${totals.turns} ${
    totals.turns === 1 ? "interacción" : "interacciones"
  }${first ? " · desde " + fechaDe(first) : ""}${missing > 0 ? " · " + missing + " sin costo" : ""}</span></div>
        <div class="cp-fx-row cp-note">${ICON.swap}<span>El valor total es una suma del histórico</span></div>
      </div>
      ${currencyToggle()}
    </div>`;
}

let costPop = null;
let costPopAnchor = null;
let popKind = "turn";
let popPayload = null;

function onDocClick(e) {
  if (costPop && !costPop.contains(e.target) && !e.target.closest(".u-price, .session")) closePop();
}

function onEsc(e) {
  if (e.key === "Escape") closePop();
}

function closePop() {
  if (!costPop) return;
  costPop.remove();
  costPop = null;
  if (costPopAnchor) costPopAnchor.setAttribute("aria-expanded", "false");
  costPopAnchor = null;
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onEsc, true);
  window.removeEventListener("scroll", closePop, true);
}

function paintPop() {
  if (!costPop) return;
  costPop.innerHTML = popKind === "session" ? sessionPopHtml(popPayload) : costPopHtml(popPayload);

  costPop.querySelector(".cp-close").addEventListener("click", closePop);

  costPop.querySelectorAll("[data-cur]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const cur = btn.dataset.cur;
      if (cur === state.currency) return;
      state.currency = cur;
      try {
        localStorage.setItem("sng.pref.currency", cur);
      } catch {
        /* noop */
      }
      repaintFoots();
      renderSession();
      paintPop();
    })
  );

  requestAnimationFrame(() => {
    costPop.querySelectorAll(".cp-bar i").forEach((bar) => {
      bar.style.width = bar.dataset.pct + "%";
    });
  });
}

function showPop(anchor, kind, payload) {
  if (costPop && costPopAnchor === anchor) {
    closePop();
    return;
  }
  closePop();

  popKind = kind;
  popPayload = payload;

  const pop = document.createElement("div");
  pop.className = "cost-pop";
  pop.setAttribute("role", "dialog");
  document.body.appendChild(pop);

  costPop = pop;
  costPopAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");

  paintPop();

  const rect = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let top = rect.top - pr.height - 10;
  if (top < 8) top = rect.bottom + 10;
  pop.style.top = Math.max(8, top) + "px";
  pop.style.right = Math.max(8, window.innerWidth - rect.right) + "px";

  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onEsc, true);
    window.addEventListener("scroll", closePop, true);
  }, 0);
}

function openCostPop(anchor, turn) {
  if (!usageShares(turn.uso).length) return;
  showPop(anchor, "turn", turn);
}

function openSessionPop(anchor) {
  const totals = sessionTotals(state.session.turns, (state.fx && state.fx.usdToCop) || 0);
  if (!totals.priced) return;
  showPop(anchor, "session", totals);
}

function appendTurnCard(turn, { pending = false } = {}) {
  const card = document.createElement("article");
  card.className = "turn" + (pending ? " is-pending" : "");
  card.dataset.id = turn.id;
  card.innerHTML = `
    <header class="turn-head">
      <p class="turn-q">${esc(turn.pregunta)}</p>
    </header>
    <button type="button" class="turn-status" data-state="pending" hidden>
      <span class="ts-ico" aria-hidden="true"></span>
      <span class="ts-text"></span>
      <span class="ts-go" aria-hidden="true">›</span>
      <span class="ts-meta"></span>
    </button>
    <div class="turn-body">${pending ? `<div class="view skeleton">${skeletonFor("map")}</div>` : ""}</div>
    <footer class="turn-foot"></footer>`;
  el("canvas").appendChild(card);
  scrollTurnIntoView(card);
  return card;
}

function fillTurn(turn, spec) {
  const card = el("canvas").querySelector('[data-id="' + turn.id + '"]');
  if (!card) return;

  card.classList.remove("is-pending");
  card.querySelector(".turn-body").innerHTML = `<div class="view">${viewInner(spec)}</div>`;

  card.querySelector(".turn-foot").innerHTML = footHtml(turn);

  if (motion()) {
    const view = card.querySelector(".view");
    if (view) [...view.children].forEach((child, i) => child.style.setProperty("--i", Math.min(i, 10)));
  }

  enhanceFlowanim(card);
  paintStatus(turn);
  if (canvasAtBottom()) scrollCanvasToEnd();
}

function failTurn(turn, message) {
  const card = el("canvas").querySelector('[data-id="' + turn.id + '"]');
  if (!card) return;
  card.classList.remove("is-pending");
  card.querySelector(".turn-body").innerHTML = `<div class="view"><div class="b-callout c-danger"><strong>No pude responder</strong><span>${esc(
    message
  )}</span></div></div>`;
  card.querySelector(".turn-foot").innerHTML = footHtml({ at: turn.at });
}

function renderTranscript({ append = false } = {}) {
  if (!append) el("canvas").innerHTML = "";
  for (const turn of state.session.turns) {
    if (turn.vista) {
      appendTurnCard(turn);
      pintarVista(turn);
    } else if (turn.spec) {
      appendTurnCard(turn);
      fillTurn(turn, turn.spec);
      paintStatus(turn);
    } else {
      appendTurnCard(turn);
      failTurn(turn, "Esta consulta quedó sin respuesta porque la sesión se interrumpió.");
    }
  }
  scrollCanvasToEnd();
}

/* ---------- loading ---------- */

function startLoading() {
  if (!motion()) return;
  el("progress").hidden = false;
}

function stopLoading() {
  el("progress").hidden = true;
}


/* ---------- revelado progresivo ---------- */

let currentTyping = null;
let currentCtrl = null;

function stopEverything() {
  if (currentCtrl) {
    currentCtrl.abort();
    currentCtrl = null;
  }
  if (currentTyping) {
    currentTyping.cancel();
    currentTyping = null;
  }
}

// ponytail: revelado local de la narrativa ya recibida (~28ms por palabra).
// Streaming real de tokens exige parsear JSON parcial de DeepSeek; se hace si
// la latencia inicial molesta en la reunión.
function typeInto(node, text, { msPerWord = 28 } = {}) {
  const p = document.createElement("p");
  p.className = "typing";
  node.appendChild(p);

  const words = String(text).split(/\s+/).filter(Boolean);

  if (!words.length || prefersReduced()) {
    p.textContent = text || "";
    p.classList.remove("typing");
    return { promise: Promise.resolve(), cancel: () => {} };
  }

  let cancelled = false;
  let shown = 0;
  const started = performance.now();

  const promise = new Promise((resolve) => {
    const frame = (now) => {
      if (cancelled) return resolve();
      const target = Math.min(words.length, Math.floor((now - started) / msPerWord) + 1);
      if (target > shown) {
        shown = target;
        p.textContent = words.slice(0, shown).join(" ");
      }
      if (shown >= words.length) {
        p.classList.remove("typing");
        return resolve();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      p.classList.remove("typing");
      if (shown < words.length) {
        const mark = document.createElement("span");
        mark.className = "interrupted-mark";
        mark.textContent = " · interrumpido";
        p.appendChild(mark);
      }
    },
  };
}

/* ---------- recorrido: rail, línea de estado y modal ---------- */

const GLYPH = { done: "✓", warn: "!", fail: "✕", skip: "–" };

function stepsFor(turn) {
  if (turn && state.currentTurn && turn.id === state.currentTurn.id && state.live) return state.live;
  return replay(turn?.etapas || []);
}

function renderSessions() {
  const box = el("sessions");
  if (!box || !state.store) return;

  const tab = state.tab || "active";
  const list = state.store.sessions.filter((s) => Boolean(s.archived) === (tab === "archived"));

  el("rail-tabs")?.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.tab === tab);
  });

  if (!list.length) {
    box.innerHTML = `<p class="si-empty">${tab === "archived" ? "Sin sesiones archivadas" : "Sin conversaciones"}</p>`;
    return;
  }

  box.innerHTML = list
    .map((s) => {
      const active = s.id === state.store.currentId;
      const n = s.turns.length;
      return `<div class="session-item${active ? " is-active" : ""}" data-session="${s.id}">
        <button type="button" class="si-open" data-session="${s.id}">
          <span class="si-title" title="${esc(s.title || "Nueva conversación")}">${esc(s.title || "Nueva conversación")}</span>
          <span class="si-meta">${n} ${n === 1 ? "interacción" : "interacciones"} · ${esc(fechaDe(s.updatedAt))}</span>
        </button>
        <button type="button" class="si-more" data-menu="${s.id}" aria-label="Acciones de la sesión" aria-haspopup="menu">⋮</button>
      </div>`;
    })
    .join("");
}

let sessionMenu = null;

function closeSessionMenu() {
  if (!sessionMenu) return;
  sessionMenu.remove();
  sessionMenu = null;
  document.removeEventListener("click", onMenuOutside, true);
  document.removeEventListener("keydown", onMenuEsc, true);
  window.removeEventListener("scroll", closeSessionMenu, true);
}

function onMenuEsc(e) {
  if (e.key === "Escape") closeSessionMenu();
}

function onMenuOutside(e) {
  if (!sessionMenu) return;
  if (sessionMenu.contains(e.target)) return;
  if (e.target.closest?.("[data-menu]")) return;
  closeSessionMenu();
}

function openSessionMenu(anchor, session) {
  closeSessionMenu();
  if (!session) return;

  const menu = document.createElement("div");
  menu.className = "session-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = session.archived
    ? `<button type="button" data-act="unarchive">Desarchivar</button>
       <button type="button" data-act="delete" class="danger">Eliminar</button>`
    : `<button type="button" data-act="archive">Archivar</button>
       <button type="button" data-act="delete" class="danger">Eliminar</button>`;

  document.body.appendChild(menu);
  sessionMenu = menu;

  const rect = anchor.getBoundingClientRect?.() || { bottom: 0, top: 0, left: 0 };
  const mr = menu.getBoundingClientRect?.() || { width: 0, height: 0 };
  let top = rect.bottom + 6;
  if (top + mr.height > window.innerHeight - 8) top = rect.top - mr.height - 6;
  menu.style.top = Math.max(8, top) + "px";
  menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - mr.width - 8)) + "px";

  menu.querySelectorAll("[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      closeSessionMenu();
      if (act === "archive") archiveSession(session.id, true);
      else if (act === "unarchive") archiveSession(session.id, false);
      else if (act === "delete") deleteSession(session.id);
    })
  );

  setTimeout(() => {
    document.addEventListener("click", onMenuOutside, true);
    document.addEventListener("keydown", onMenuEsc, true);
    window.addEventListener("scroll", closeSessionMenu, true);
  }, 0);
}

function archiveSession(id, archived) {
  const target = state.store.sessions.find((s) => s.id === id);
  if (!target) return;
  target.archived = archived;
  target.updatedAt = new Date().toISOString();
  saveStore(state.store);

  if (target.id === state.store.currentId && archived) {
    state.tab = "archived";
    renderSessions();
    selectFirstAvailable();
    return;
  }
  renderSessions();
}

let confirmResolve = null;

function askConfirm({ kicker, title, body, confirmLabel = "Confirmar" }) {
  const dlg = el("confirm");
  if (!dlg?.showModal) return Promise.resolve(window.confirm(body));

  el("cf-kicker").textContent = kicker || "";
  el("cf-title").textContent = title;
  el("cf-body").textContent = body;
  el("cf-danger").textContent = confirmLabel;

  dlg.returnValue = "";
  dlg.showModal();

  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function onConfirmClose() {
  const dlg = el("confirm");
  const ok = dlg?.returnValue === "ok";
  if (confirmResolve) confirmResolve(ok);
  confirmResolve = null;
}

async function deleteSession(id) {
  const target = state.store.sessions.find((s) => s.id === id);
  if (!target) return;

  const ok = await askConfirm({
    kicker: "eliminar sesión",
    title: target.title || "Nueva conversación",
    body:
      (target.turns.length
        ? `Se pierden ${target.turns.length} ${target.turns.length === 1 ? "interacción" : "interacciones"} y todo su historial.`
        : "La conversación todavía no tiene interacciones.") + " Esta acción no se puede deshacer.",
    confirmLabel: "Eliminar",
  });
  if (!ok) return;

  state.store.sessions = state.store.sessions.filter((s) => s.id !== id);

  if (!state.store.sessions.length) {
    const rec = newSessionRecord();
    addSession(state.store, rec);
    state.session = rec;
  } else if (state.store.currentId === id) {
    state.store.currentId = state.store.sessions[0].id;
  }

  saveStore(state.store);
  renderSessions();
  if (state.store.currentId) openSession(state.store.currentId, true);
}

/** Cuando archivan la sesión abierta, se pasa a otra o a una nueva. */
function selectFirstAvailable() {
  const next =
    state.store.sessions.find((s) => !s.archived) || state.store.sessions.find((s) => s.id === state.store.currentId);
  if (next) {
    state.store.currentId = next.id;
    state.tab = next.archived ? "archived" : "active";
    saveStore(state.store);
    openSession(next.id, true);
    return;
  }
  newChat();
}

function newChat() {
  state.tab = "active";
  stopEverything();
  voice?.stop();

  const rec = newSessionRecord();
  addSession(state.store, rec);
  saveStore(state.store);

  state.session = rec;
  state.currentTurn = null;
  state.question = "";
  state.live = buildSteps();
  state.runFinished = false;
  state.lastRun = null;
  state.events = [];

  setReadonly(false);
  setEmptySession();
  el("canvas").innerHTML = "";
  renderWelcome();
  renderSessions();
  renderSession();
  el("input").focus();
}

function openSession(id, force = false) {
  if (!state.store) return;
  if (id === state.store.currentId && !force) return;
  const target = state.store.sessions.find((s) => s.id === id);
  if (!target) return;

  stopEverything();
  voice?.stop();

  state.store.currentId = id;
  saveStore(state.store);

  state.session = target;
  state.currentTurn = target.turns.at(-1) || null;
  state.question = target.turns.at(-1)?.pregunta || "";
  state.live = buildSteps();
  state.runFinished = false;
  state.lastRun = null;

  const last = target.turns.at(-1);
  state.live = replay(last?.etapas || []);
  state.runFinished = Boolean(last?.spec);

  setReadonly(Boolean(target.archived));

  if (target.turns.length) {
    renderTranscript();
    renderSession();
  } else {
    el("canvas").innerHTML = "";
    renderWelcome();
    renderSession();
  }
  renderSessions();
}

function resetStages(question) {
  state.pendingTool = null;
  state.pendingView = null;
  state.pendingModal = null;
  state.live = buildSteps();
  state.runFinished = false;
  state.lastRun = null;
  state.question = question;
}

function advanceStages(ev) {
  if (!state.live) return;
  applyEvent(state.live, ev);
  if (ev.type === "run.finished") state.runFinished = true;
  paintStatus();
}

/** Línea única bajo la pregunta: cuenta la etapa en curso y se asienta al cerrar. */
function paintStatus(turn = state.currentTurn) {
  if (!turn) return;
  const card = el("canvas").querySelector('[data-id="' + turn.id + '"]');
  const btn = card && card.querySelector(".turn-status");
  if (!btn) return;

  const s = summary(stepsFor(turn), { finished: !!turn.spec, ms: turn.ms });
  btn.hidden = !s.text;
  btn.dataset.state = s.state;
  btn.querySelector(".ts-text").textContent = s.text;
  btn.querySelector(".ts-meta").textContent = s.ms ? fmtMs(s.ms) : "";
}

function openTimeline(turnId) {
  const turn = state.session.turns.find((t) => t.id === turnId) || state.currentTurn;
  if (!turn) return;

  const steps = stepsFor(turn);
  el("tl-q").textContent = turn.pregunta;
  el("tl-steps").innerHTML = steps
    .map(
      (s) => `<li class="tl-step" data-state="${s.state}">
        <span class="st-ico" data-state="${s.state}" aria-hidden="true">${GLYPH[s.state] || ""}</span>
        <span class="tl-body">
          <span class="tl-label">${esc(s.label)}</span>
          <span class="tl-detail">${esc(s.detail || (s.state === "running" ? s.run : ""))}</span>
        </span>
        <span class="tl-ms">${s.ms != null ? fmtMs(s.ms) : ""}</span>
      </li>`
    )
    .join("");

  const parts = [hora(turn.at)];
  if (turn.ms) parts.push(fmtMs(turn.ms));
  if (turn.costo != null) parts.push(fmtUsd(turn.costo));
  el("tl-foot").textContent = parts.join(" · ");

  el("timeline").showModal();
}

function notice(text, kind = "info") {
  const hint = el("hint");
  hint.textContent = text;
  hint.className = "hint" + (kind === "error" ? " is-error" : "");
}


/* ---------- stream ---------- */

function dispatch(event) {
  state.events.push(event);
  const label = stageFor(event.type);
  if (label) el("hint").textContent = label + "…";
  advanceStages(event);

  if (event.type === "tool.requested" && event.data?.tool === "email") {
    // Se guarda y se abre al cerrar el turno: nadie manda un esquema a medio armar.
    state.pendingTool = event.data.args || {};
  }

  if (event.type === "tool.requested" && event.data?.tool !== "email") {
    // Navegación: no requiere confirmación. La vista se adhiere al turno en curso,
    // no crea una tarjeta aparte, para no competir con la respuesta.
    const out = runUiAction(event.data.tool, event.data.args || {}, uiContext());
    state.lastUiAction = out;
    if (out?.vista) state.pendingView = out.vista;
    if (out?.modal) state.pendingModal = out.modal;
  }

  if (event.type === "tool.rejected") {
    state.toolRejected = event.data?.reason || "invalida";
  }

  if (event.type === "run.started") {
    state.runBad = false;
    state.runLimit = false;
    setStatus("trabajando");
  }
  if (event.type === "stage.failed") {
    state.runBad = true;
    if (/429|rate.?limit/i.test(String(event.data && event.data.reason))) state.runLimit = true;
  }
  if (event.type === "run.failed") {
    setStatus("error");
    setTimeout(() => setStatus(state.baseStatus || "activo"), 4000);
  }

  if (event.type === "run.finished" && event.data) {
    setStatus(state.runLimit ? "limite" : state.runBad ? "degradado" : state.baseStatus || "activo");
    state.lastRun = { ms: Number(event.data.ms) || 0, cost: Number(event.data.cost) || 0, by: event.data.by || null };
    state.tabSession.runs += 1;
    state.tabSession.cost += Number(event.data.cost) || 0;
    state.tabSession.ms += Number(event.data.ms) || 0;
    renderSession();
  }
}

function renderSession() {
  const btn = el("session");
  if (!btn || !state.session) return;

  const totals = sessionTotals(state.session.turns, (state.fx && state.fx.usdToCop) || 0);
  if (!totals.turns) {
    btn.hidden = true;
    return;
  }

  const total = state.currency === "COP" ? totals.cop : totals.usd;
  btn.hidden = false;
  btn.innerHTML =
    '<span class="s-count">' +
    totals.turns +
    (totals.turns === 1 ? " interacción" : " interacciones") +
    '</span><span class="s-sep" aria-hidden="true"></span><span class="s-total">' +
    moneyLabel(total) +
    "</span>";
}

// Parser de frames SSE vive en sse.mjs (testeado aparte).

let runSeq = 0;

async function ask(text, { params = null, silent = false } = {}) {
  const id = ++runSeq;
  stopEverything();
  muteVoice();
  voice?.stop();
  micEl.classList.remove("has-draft");

  if (!silent) {
    pauseGreeting();
    resetStages(text);
    state.question = text;
    await refreshFx();
    const turn = makeTurn(text);
    turn.fx = state.fx ? { ...state.fx } : null;
    if (!state.session.title) {
      state.session.title = titleFrom(text);
      state.session.updatedAt = new Date().toISOString();
      renderSessions();
    }
    state.currentTurn = turn;
    state.session.turns.push(turn);
    setEmptySession();
    appendTurnCard(turn, { pending: true });
    scrollCanvasToEnd();
  } else {
    // Explorar un filtro también es un run: el rail debe reflejarlo.
    resetStages(state.question || text);
    paintStatus();
  }

  busy = true;
  updateSend();
  el("hint").textContent = params ? "recalculando…" : "conectando…";
  state.events = [];
  if (!silent) startLoading();

  const ctrl = new AbortController();
  currentCtrl = ctrl;

  let spec = null;
  let failure = null;
  let aborted = false;

  try {
    const res = await fetch("./api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: text, params }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error("HTTP " + res.status);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      let cut;
      while ((cut = buf.indexOf("\n\n")) !== -1) {
        const frame = parseFrame(buf.slice(0, cut));
        buf = buf.slice(cut + 2);
        if (!frame.data) continue;

        let payload;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue;
        }

        if (frame.event === "result") spec = payload.spec;
        else if (frame.event === "error") failure = payload.message;
        else dispatch(payload);
      }
    }
  } catch (e) {
    if (e.name === "AbortError") aborted = true;
    else failure = e.message;
  } finally {
    if (currentCtrl === ctrl) currentCtrl = null;
    busy = false;
    updateSend();
    el("hint").textContent = state.baseHint || "";
  }

  if (id !== runSeq) return;
  if (!silent) stopLoading();

  const turn = state.currentTurn || state.session.turns.at(-1);

  if (!spec) {
    if (!aborted) {
      const offline = /fetch|network|failed to fetch|networkerror/i.test(failure || "");
      const msg = offline
        ? "Sistema sin conexión en este momento"
        : "No pude componer la vista: " + (failure || "el stream no devolvió resultado");
      if (offline) {
        state.baseStatus = "offline";
        setStatus("offline");
        setTimeout(checkHealth, 4000);
      }
      notice(msg, "error");
      if (turn) {
        failTurn(turn, msg);
        saveStore(state.store);
      }
    }
    return;
  }

  if (!turn) return;

  if (state.pendingModal) {
    const m = state.pendingModal;
    state.pendingModal = null;
    const proj = (state.diagnosticos || []).find((p) => p.id === m.proyectoId);
    if (proj) openNodeModal(proj, m.nodoId);
  }

  if (state.pendingView) {
    const vista = state.pendingView;
    state.pendingView = null;
    const runV = state.lastRun || {};
    turn.vista = vista;
    turn.ms = Number(runV.ms) || 0;
    turn.costo = Number(runV.cost) || 0;
    turn.uso = runV.by || null;
    turn.etapas = trimEvents(state.events);
    llenarTurno(turn);
    return;
  }

  const run = state.lastRun || {};
  turn.spec = spec;
  turn.ms = Number(run.ms) || 0;
  turn.costo = Number(run.cost) || 0;
  turn.uso = run.by || null;
  turn.etapas = trimEvents(state.events);
  fillTurn(turn, spec);
  renderSession();
  if (spec.verification && spec.verification.status === "cached") setStatus("avion");
  saveStore(state.store);

  if (state.pendingTool) {
    const prefill = state.pendingTool;
    state.pendingTool = null;
    if (prefill.to?.length || /correo|mail|envi/i.test(turn.pregunta || "")) {
      openEmail(turn, { to: prefill.to || [], nota: prefill.nota || "" });
    }
  }
}

const inputEl = el("input");
const sendEl = el("send");
const micEl = el("mic");
let busy = false;

// El botón comunica el estado: apagado sin texto, sólido cuando hay consulta.
function setReadonly(on) {
  state.readonly = Boolean(on);
  inputEl.disabled = state.readonly;
  if (micEl) micEl.disabled = state.readonly;
  el("composer").classList.toggle("is-readonly", state.readonly);
  inputEl.placeholder = state.readonly ? "Sesión archivada · solo lectura" : "¿Qué información del diagnóstico quieres que te muestre?";
  updateSend();
}

function updateSend() {
  sendEl.disabled = busy || state.readonly || inputEl.value.trim().length === 0;
  if (micEl) micEl.disabled = busy || state.readonly;
}

function growInput() {
  const max = 132;
  inputEl.style.height = "auto";
  const alto = inputEl.scrollHeight || 0;
  const h = Math.min(alto, max);
  inputEl.style.height = h + "px";
  // el scroll sólo aparece cuando el contenido supera el tope
  inputEl.style.overflowY = alto > max ? "auto" : "hidden";
}

inputEl.addEventListener("input", () => {
  growInput();
  updateSend();
  if (!inputEl.value.trim()) micEl.classList.remove("has-draft");
});

updateSend();

el("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = inputEl.value.trim();
  if (!t) return;
  inputEl.value = "";
  growInput();
  ask(t);
});

el("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    el("composer").requestSubmit();
  }
});

document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-ask]");
  if (chip) {
    el("input").value = chip.dataset.ask;
    el("composer").requestSubmit();
    return;
  }

  // Abrir el detalle del recorrido de un turno.
  const status = e.target.closest(".turn-status");
  if (status) {
    const card = status.closest("[data-id]");
    if (card) openTimeline(card.dataset.id);
    return;
  }

  // Desglose de costo por proveedor.
  if (e.target.closest("#new-chat")) {
    newChat();
    return;
  }

  const mailBtn = e.target.closest("[data-mail]");
  if (mailBtn) {
    const turn = state.session?.turns?.find((t) => t.id === mailBtn.dataset.mail);
    if (turn) openEmail(turn);
    return;
  }

  const tab = e.target.closest("[data-tab]");
  if (tab) {
    state.tab = tab.dataset.tab;
    renderSessions();
    return;
  }

  const menuBtn = e.target.closest("[data-menu]");
  if (menuBtn) {
    const s = state.store.sessions.find((x) => x.id === menuBtn.dataset.menu);
    openSessionMenu(menuBtn, s);
    return;
  }

  const item = e.target.closest("[data-session]");
  if (item) {
    openSession(item.dataset.session);
    return;
  }

  // Contador de sesión: abre el total acumulado.
  if (e.target.closest("#session")) {
    openSessionPop(e.target.closest("#session"));
    return;
  }

  // Precio: abre el desglose flotante por proveedor.
  const price = e.target.closest(".u-price");
  if (price) {
    const card = price.closest("[data-id]");
    const turn = state.session.turns.find((t) => t.id === card?.dataset.id);
    if (turn) openCostPop(price, turn);
    return;
  }

  // Control de faceta: recalcula del grafo, sin pasar por el modelo.
  const opt = e.target.closest(".fc-opt");
  const box = opt?.closest("[data-facet]");
  if (!opt || !box) return;

  let params = {};
  try {
    params = JSON.parse(box.dataset.params || "{}");
  } catch {
    params = {};
  }
  params[opt.dataset.control] = opt.dataset.value;
  ask(state.question || "filtro", { params: { facet: box.dataset.facet, ...params }, silent: true });
});

el("newstuff")?.addEventListener("click", () => {});

el("tl-close")?.addEventListener("click", () => el("timeline").close());
el("confirm")?.addEventListener("close", onConfirmClose);

/* ---------- voz: speech to text del navegador ---------- */

let meter = null;
let meterToken = 0;
let voiceBase = "";
// Al enviar se corta el dictado, pero el motor puede entregar un resultado
// tardío. Durante este lapso se ignoran para que no repueblen el campo.
let voiceMuted = false;
let voiceMuteTimer = null;

function muteVoice(ms = 1200) {
  voiceMuted = true;
  voiceBase = "";
  clearTimeout(voiceMuteTimer);
  voiceMuteTimer = setTimeout(() => (voiceMuted = false), ms);
}

async function startListeningUI() {
  const token = ++meterToken;
  el("composer").classList.add("is-listening");

  const m = await startMeter((level) => {
    el("composer").style.setProperty("--level", level.toFixed(2));
  });

  if (token !== meterToken) {
    m?.stop();
    return;
  }
  meter = m;
  el("wave").classList.toggle("is-fallback", !m);
}

function stopListeningUI() {
  meterToken++;
  el("composer").classList.remove("is-listening");
  el("composer").style.removeProperty("--level");
  el("wave").classList.remove("is-fallback");
  if (meter) {
    meter.stop();
    meter = null;
  }
}

const voice = createVoice({
  onState(s) {
    const on = s === "listening";
    micEl.classList.toggle("is-listening", on || s === "reconnecting");
    micEl.setAttribute("aria-pressed", String(!!voice?.active));
    micEl.setAttribute("aria-label", voice?.active ? "Detener dictado" : "Hablar");

    if (on) {
      startListeningUI();
    } else if (s === "reconnecting") {
      /* la sesión sigue: no se toca la UI */
    } else {
      stopListeningUI();
      // sólo se normaliza el texto si venía de un dictado; nunca se pisa lo escrito
      if (voiceMuted) {
        micEl.classList.remove("has-draft");
        micEl.classList.remove("is-listening");
        micEl.setAttribute("aria-pressed", "false");
      } else if (voiceBase) {
        inputEl.value = voiceBase.trimEnd();
        growInput();
        updateSend();
      }
    }
  },
  onPartial(text) {
    if (voiceMuted) return;
    inputEl.value = text ? voiceBase + text : voiceBase.trimEnd();
    growInput();
    updateSend();
  },
  onFinal(text) {
    if (voiceMuted) return;
    voiceBase = appendText(voiceBase, text) + " ";
    inputEl.value = voiceBase.trimEnd();
    growInput();
    updateSend();
    micEl.classList.add("has-draft");
  },
  onError(code) {
    stopListeningUI();
    notice(
      code === "not-allowed"
        ? "Sin permiso para el micrófono. Habilítalo desde el candado de la barra de direcciones."
        : "No pude escuchar: " + code,
      "error"
    );
  },
});

if (voice) {
  micEl.hidden = false;
  micEl.addEventListener("click", () => {
    if (!voice.active) {
      voiceBase = inputEl.value.trim() ? inputEl.value.trimEnd() + " " : "";
      micEl.classList.remove("has-draft");
    }
    voice.toggle();
    if (!voice.active) inputEl.focus();
  });
}

setInterval(checkHealth, 30000);
boot();
