// Render del flujo con Mermaid (sólo layout) y reproducción controlada por JS.
// El avance lo maneja un secuenciador propio: play, pausa, prev, next, velocidad.

import { buildMermaid, planSequence } from "./flowmodel.mjs";

let mermaidPromise = null;

function loadMermaid() {
  if (globalThis.mermaid) return Promise.resolve(globalThis.mermaid);
  if (!mermaidPromise) {
    mermaidPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "./vendor/mermaid.min.js";
      s.async = true;
      s.onload = () => resolve(globalThis.mermaid || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    }).then((m) => {
      if (m) {
        m.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          flowchart: { htmlLabels: false, useMaxWidth: false },
          themeVariables: {
            primaryColor: "#ffffff",
            primaryBorderColor: "#c4c9bf",
            primaryTextColor: "#292b27",
            lineColor: "#787d6c",
            secondaryColor: "#f3f0e9",
            tertiaryColor: "#e8e5dd",
            fontFamily: "inherit",
            fontSize: "13px",
          },
        });
      }
      return m;
    });
  }
  return mermaidPromise;
}

const SPEEDS = [1, 0.5, 2];
const BASE_MS = 900;

const norm = (s) => String(s).replace(/\s+/g, " ").trim();

/** Mermaid no expone ids estables: se etiqueta el SVG por texto. */
function tagDiagram(canvas, nodes) {
  const nodeEls = [...canvas.querySelectorAll("g.node")];
  nodeEls.forEach((g) => {
    const text = norm(g.textContent);
    const i = nodes.findIndex((n) => n.label && text.startsWith(norm(n.label).slice(0, 24)));
    if (i >= 0) g.dataset.idx = String(i);
  });

  let edgeEls = [...canvas.querySelectorAll("path.flowchart-link")];
  if (!edgeEls.length) edgeEls = [...canvas.querySelectorAll('path[id^="L_"]')];

  return { nodeEls, edgeEls };
}

function createPlayer(canvas, spec, ui) {
  const { beats, broken } = planSequence(spec.nodes, spec.edges);
  const { nodeEls, edgeEls } = tagDiagram(canvas, spec.nodes);

  let i = 0;
  let timer = null;
  let speed = 1;

  const byIdx = (idx) => nodeEls.filter((el) => Number(el.dataset.idx) === idx);

  function paint() {
    const beat = beats[i];
    const doneNodes = new Set(beats.slice(0, i + 1).map((b) => b.node));
    const doneEdges = new Set(beats.slice(1, i + 1).map((b) => b.edge));

    nodeEls.forEach((el) => {
      const idx = Number(el.dataset.idx);
      const isActive = idx === beat?.node;
      el.classList.toggle("is-done", doneNodes.has(idx));
      el.classList.toggle("is-active", isActive);
    });

    edgeEls.forEach((el, n) => {
      el.classList.toggle("is-done", doneEdges.has(n));
      el.classList.toggle("is-broken", beat?.broken && beat.edge === n);
    });

    if (ui.caption) {
      const n = i + 1;
      ui.caption.textContent = beat ? `${n}/${beats.length} · ${beat.label}${beat.detail ? " — " + beat.detail : ""}` : "";
      ui.caption.dataset.state = beat?.broken ? "broken" : i === beats.length - 1 ? "end" : "run";
    }
    if (ui.play) ui.play.textContent = timer ? "pausa" : "play";
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function next() {
    if (i >= beats.length - 1) {
      stop();
      return false;
    }
    i++;
    paint();
    if (beats[i].broken) {
      stop();
      return false;
    }
    return true;
  }

  function play() {
    stop();
    if (i >= beats.length - 1) i = 0;
    paint();
    timer = setInterval(() => {
      if (!next()) paint();
    }, BASE_MS / speed);
    paint();
  }

  function toggle() {
    if (timer) {
      stop();
      paint();
    } else {
      play();
    }
  }

  // Respeta movimiento reducido: arranca pausado.
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  paint();
  if (!reduced) play();

  ui.play?.addEventListener("click", toggle);
  ui.next?.addEventListener("click", () => {
    stop();
    next();
    paint();
  });
  ui.prev?.addEventListener("click", () => {
    stop();
    i = Math.max(0, i - 1);
    paint();
  });
  ui.replay?.addEventListener("click", () => {
    stop();
    i = 0;
    play();
  });
  ui.speed?.addEventListener("click", () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    ui.speed.textContent = speed + "x";
    if (timer) play();
  });

  if (broken) ui.caption?.classList.add("has-break");
}

async function draw(node, mermaid) {
  const spec = JSON.parse(node.querySelector(".fa-spec").textContent);
  const canvas = node.querySelector(".fa-canvas");
  const def = buildMermaid(spec.nodes, spec.edges, { stepNumbers: false });

  try {
    const { svg } = await mermaid.render(`fa-${Date.now()}`, def);
    canvas.innerHTML = svg;
    node.dataset.ready = "1";
    const ui = {
      caption: node.querySelector(".fa-caption"),
      play: node.querySelector('[data-fa="play"]'),
      prev: node.querySelector('[data-fa="prev"]'),
      next: node.querySelector('[data-fa="next"]'),
      replay: node.querySelector('[data-fa="replay"]'),
      speed: node.querySelector('[data-fa="speed"]'),
    };
    createPlayer(canvas, spec, ui);
    node.querySelector(".fa-controls")?.removeAttribute("hidden");
  } catch {
    // queda el fallback estático que ya trae el HTML
  }
}

export async function enhanceFlowanim(root) {
  const nodes = [...root.querySelectorAll("[data-flowanim]")];
  if (!nodes.length) return;

  const mermaid = await loadMermaid();
  if (!mermaid) return;

  for (const node of nodes) {
    if (node.dataset.ready === "1") continue;
    await draw(node, mermaid);
  }
}
