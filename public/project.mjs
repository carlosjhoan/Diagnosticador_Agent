/**
 * Vista de proyecto: pipeline por etapas con las dos señales por nodo.
 * Puro para los filtros; el dibujo de conectores mide el DOM.
 */

import { esc } from "./esc.mjs";
import { estadoNodo, veredictoGlobal } from "./diagnostic.mjs";

const SIGNAL = {
  si: { icon: "✓", tono: "ok" },
  parcial: { icon: "◐", tono: "mid" },
  no: { icon: "✕", tono: "no" },
  externo: { icon: "↗", tono: "ext" },
};

const ROB = {
  Q3: { etiqueta: "sólido", tono: "ok" },
  Q2: { etiqueta: "aceptable", tono: "mid" },
  Q1: { etiqueta: "atención", tono: "warn" },
  Q0: { etiqueta: "crítico", tono: "no" },
  NV: { etiqueta: "sin verificar", tono: "nv" },
};

/** Orden de encendido: el del diagnóstico y, si falta, por etapa y orden. */
export function flowOrder(project) {
  const byId = new Map(project.nodos.map((n) => [n.id, n]));
  const etapa = new Map((project.etapas || []).map((e) => [e.id, e.orden]));
  const porEtapa = [...project.nodos].sort(
    (a, b) => (etapa.get(a.etapa) ?? 99) - (etapa.get(b.etapa) ?? 99) || a.orden - b.orden
  );

  // El flujo del diagnóstico cubre el recorrido del cliente, no todos los
  // nodos (plataforma, salidas). Primero el recorrido, después el resto.
  const declarado = (project.flow || []).filter((id) => byId.has(id));
  const vistos = new Set(declarado);
  const resto = porEtapa.map((n) => n.id).filter((id) => !vistos.has(id));

  return [...declarado, ...resto];
}

/** Filtros puros: se pueden probar sin DOM. */
export function visibleNodes(project, filters = {}) {
  return project.nodos.filter((n) => {
    if (!filters.showFuture && n.alcance === "Futuro") return false;
    if (filters.onlyProblems && !["Q1", "Q0"].includes(n.calidad)) return false;
    if (filters.robustez && filters.robustez !== "all" && n.calidad !== filters.robustez) return false;
    return true;
  });
}

export function etapasConNodos(project, filters = {}) {
  const visibles = new Set(visibleNodes(project, filters).map((n) => n.id));
  return (project.etapas || []).map((e) => ({
    ...e,
    nodos: (e.nodos || []).filter((id) => visibles.has(id)),
  }));
}

function nodeHtml(n) {
  const e = estadoNodo(n);
  const s = SIGNAL[e.implementado] || SIGNAL.no;

  // Un paso propuesto (fuera de la rúbrica) no es un fallo: se marca distinto.
  const propuesta = n.fueraDeRubrica;

  return `<button type="button" class="pnode${propuesta ? " is-proposal" : ""}" data-node="${esc(n.id)}" data-alcance="${esc(n.alcance)}"
      aria-label="${esc(n.nombre + ". " + (propuesta ? "propuesta, no es parte del alcance pedido" : e.implementadoTexto + ", " + e.robustezTexto))}"
      data-implementado="${propuesta ? "propuesta" : e.implementado}" data-robustez="${esc(e.robustez)}">
    <span class="pn-name">${esc(n.nombre)}${propuesta ? '<span class="pn-tag">propuesta</span>' : ""}</span>
    <span class="pn-impl" data-s="${propuesta ? "ext" : s.tono}" aria-hidden="true">${propuesta ? "◇" : s.icon}</span>
  </button>`;
}

export function renderProject(host, project, { onBack, onNode, onProposal, inline = false } = {}) {
  const v = veredictoGlobal(project);
  // Ya no hay filtros en la vista: se muestra el pipeline completo.
  const filtros = { onlyProblems: false, showFuture: true, robustez: "all" };
  let pendienteIgnicion = true;

  const pintar = () => {
    const etapas = etapasConNodos(project, filtros);
    const byId = new Map(project.nodos.map((n) => [n.id, n]));

    host.innerHTML = `<div class="proj">
      <header class="proj-head">
        ${inline ? "" : '<button type="button" class="proj-back" id="proj-back">← Inicio</button>'}
        <h2 class="proj-name">${esc(project.nombre)}</h2>
        <span class="proj-badge" data-state="${esc(v.estado)}">${esc(v.estadoTexto || v.etiqueta)}</span>

        <div class="pmetrics">
          <span class="pm" data-pct="${v.negocio ? v.negocio.pct : 0}">
            <svg class="pm-ring" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
              <circle class="pm-bg" cx="16" cy="16" r="13" />
              <circle class="pm-fg" cx="16" cy="16" r="13" stroke-dasharray="0 81.7" />
            </svg>
            <b>${v.negocio ? v.negocio.pct : 0}%</b>
            <i>negocio</i>
          </span>

          <span class="pm-sep" aria-hidden="true"></span>

          <span class="pm" data-pct="${v.cobertura ? v.cobertura.pct : 0}" data-k="prod">
            <svg class="pm-ring" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
              <circle class="pm-bg" cx="16" cy="16" r="13" />
              <circle class="pm-fg" cx="16" cy="16" r="13" stroke-dasharray="0 81.7" />
            </svg>
            <b>${v.cobertura ? v.cobertura.pct : 0}%</b>
            <i>producción</i>
          </span>
        </div>
      </header>

      <div class="proj-scroll" id="proj-scroll">
        <div class="proj-track" id="proj-track">
          ${etapas
            .map(
              (e) => `<section class="pstage" data-stage="${esc(e.id)}">
                <header class="pstage-head">
                  <span class="pstage-order">${e.orden}</span>
                  <span class="pstage-name">${esc(e.titulo)}</span>
                  <span class="pstage-count">${e.nodos.length}</span>
                </header>
                <div class="pstage-body">
                  ${e.nodos.length ? e.nodos.map((id) => nodeHtml(byId.get(id))).join("") : '<p class="pstage-empty">sin nodos visibles</p>'}
                </div>
              </section>`
            )
            .join("")}
        </div>
      </div>

      <footer class="proj-foot">
        <span class="proj-formula">${esc(v.formula || "")}</span>
      </footer>
    </div>`;

    host.querySelector("#proj-back")?.addEventListener("click", () => onBack?.());
    host.querySelectorAll("[data-node]").forEach((el) => {
      el.addEventListener("click", () => onNode?.(el.dataset.node));
    });

    requestAnimationFrame(() => {
      animarMetricas(host);
      if (pendienteIgnicion) {
        pendienteIgnicion = false;
        playIgnition(host, project);
      }
    });
  };

  pintar();

  const redraw = () => {};
  window.addEventListener("resize", redraw);

  return {
    destroy() {
      window.removeEventListener("resize", redraw);
    },
    setFilter(criterio) {
      filtros.onlyProblems = criterio === "problemas";
      pintar();
    },
    replay() {
      playIgnition(host, project);
    },
    focusNode(id) {
      const el = host.querySelector(`[data-node="${id}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      highlight(host, id);
      el.classList.add("is-target");
      setTimeout(() => el.classList.remove("is-target"), 1600);
      return true;
    },
  };
}

/** Los aros del encabezado se llenan de a poco. */
function animarMetricas(host) {
  const C = 2 * Math.PI * 13;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  host.querySelectorAll(".pm").forEach((box, i) => {
    const ring = box.querySelector(".pm-fg");
    if (!ring) return;
    const pct = Math.max(0, Math.min(100, Number(box.dataset.pct || 0)));
    const dash = ((pct / 100) * C).toFixed(1);
    const delay = reduce ? 0 : 120 + i * 110;
    setTimeout(() => ring.setAttribute("stroke-dasharray", `${dash} ${C.toFixed(1)}`), delay);
  });
}

/** Enciende los nodos en orden de flujo. Se puede repetir. */
export function playIgnition(host, project) {
  const track = host.querySelector(".proj-track");
  if (!track) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const orden = flowOrder(project);
  const rank = new Map(orden.map((id, i) => [id, i]));

  track.classList.remove("is-igniting");
  track.querySelectorAll("[data-node]").forEach((el) => {
    el.style.setProperty("--i", String(rank.get(el.dataset.node) ?? 99));
  });

  void track.offsetWidth; // fuerza el reinicio de la animación
  track.classList.add("is-igniting");

  const total = Math.max(600, orden.length * 70 + 600);
  clearTimeout(track._ign);
  track._ign = setTimeout(() => track.classList.remove("is-igniting"), total);
}

/** Resalta las dependencias del nodo y a quién alimenta. */
export function highlight(host, nodeId) {
  const track = host.querySelector(".proj-track");
  if (!track) return;
  track.classList.toggle("is-focus", Boolean(nodeId));

  track.querySelectorAll("[data-node]").forEach((el) => {
    const related = el.dataset.related || "";
    el.classList.toggle("is-dim", Boolean(nodeId) && !related.includes(nodeId) && el.dataset.node !== nodeId);
    el.classList.toggle("is-lit", Boolean(nodeId) && related.includes(nodeId));
  });

  track.querySelectorAll("path[data-from]").forEach((p) => {
    const on = nodeId && (p.dataset.from === nodeId || p.dataset.to === nodeId);
    p.classList.toggle("is-on", Boolean(on));
  });
}

/** Curvas entre nodos, medidas sobre el DOM ya pintado. */
export function drawEdges(host, project) {
  const track = host.querySelector(".proj-track");
  const svg = host.querySelector(".proj-edges");
  if (!track || !svg) return;

  const base = track.getBoundingClientRect();
  svg.setAttribute("width", String(track.scrollWidth));
  svg.setAttribute("height", String(track.scrollHeight));
  svg.setAttribute("viewBox", `0 0 ${track.scrollWidth} ${track.scrollHeight}`);

  const pos = new Map();
  track.querySelectorAll("[data-node]").forEach((el) => {
    const r = el.getBoundingClientRect();
    pos.set(el.dataset.node, {
      x: r.left - base.left + track.scrollLeft,
      y: r.top - base.top + track.scrollTop,
      w: r.width,
      h: r.height,
    });
  });

  const paths = [];
  for (const a of project.aristas || []) {
    const from = pos.get(a.de);
    const to = pos.get(a.a);
    if (!from || !to) continue;

    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const dx = Math.max(26, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

    paths.push(
      `<path d="${d}" data-from="${esc(a.de)}" data-to="${esc(a.a)}" data-kind="${esc(a.tipo)}" style="--ei:${paths.length}" />`
    );
  }

  svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>${paths.join("")}`;

  // relación inversa para el resaltado
  track.querySelectorAll("[data-node]").forEach((el) => {
    const id = el.dataset.node;
    const rel = (project.aristas || []).filter((a) => a.de === id || a.a === id).map((a) => (a.de === id ? a.a : a.de));
    el.dataset.related = rel.join(" ");
  });
}
