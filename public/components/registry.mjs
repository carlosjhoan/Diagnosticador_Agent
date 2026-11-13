// Registro cerrado de bloques. Cada primitiva sabe sanear props y renderizar HTML.
// Puro: no toca el DOM, así el servidor puede validar y los tests correr en Node.

import { esc } from "../esc.mjs";

const MAX_BLOCKS = 12;
const MAX_ROWS = 30;
const MAX_ITEMS = 12;

const str = (v, max = 300) => {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
};
const list = (v, max = MAX_ITEMS) => (Array.isArray(v) ? v.slice(0, max) : []);
const tone = (v) => (["info", "warn", "danger", "ok"].includes(v) ? v : "info");

export const TONES = ["info", "warn", "danger", "ok"];
export const STEP_STATES = ["ok", "warn", "run", "fail", "blocked", "skip"];
export const NODE_KINDS = ["human", "system", "ai", "data", "risk"];

// Trazo del icono por estado. Se dibuja animando stroke-dashoffset.
const STEP_PATH = {
  ok: "M6.2 10.5 L8.8 13.1 L13.9 7.3",
  warn: "M10 6.2 L10 10.8 M10 13.6 L10 14",
  fail: "M7.1 7.1 L12.9 12.9 M12.9 7.1 L7.1 12.9",
};

export const PRIMITIVES = {
  // Barra de filtros. Los valores se resuelven contra el grafo en el servidor:
  // el control no inventa nada, sólo elige qué parte de lo real se muestra.
  controls: {
    sanitize: (p) => {
      const facet = str(p?.facet, 20);
      const controls = list(p?.controls, 4)
        .map((c) => ({
          id: str(c?.id, 20),
          label: str(c?.label, 40),
          options: list(c?.options, 8)
            .map((o) => ({ value: str(o?.value, 30), label: str(o?.label, 40) }))
            .filter((o) => o.value),
        }))
        .filter((c) => c.id && c.options.length);
      if (!facet || !controls.length) return null;

      const params = {};
      for (const c of controls) {
        const given = str(p?.params?.[c.id], 30);
        params[c.id] = c.options.some((o) => o.value === given) ? given : c.options[0].value;
      }
      return { facet, controls, params };
    },
    render: (p) =>
      `<div class="b-controls" data-facet="${esc(p.facet)}" data-params="${esc(JSON.stringify(p.params))}">
        ${p.controls
          .map(
            (c) => `<div class="fc">
              <span class="fc-label">${esc(c.label)}</span>
              <span class="fc-opts">${c.options
                .map(
                  (o) =>
                    `<button type="button" class="fc-opt${o.value === p.params[c.id] ? " is-on" : ""}" data-control="${esc(
                      c.id
                    )}" data-value="${esc(o.value)}">${esc(o.label)}</button>`
                )
                .join("")}</span>
            </div>`
          )
          .join("")}
      </div>`,
  },

  heading: {
    sanitize: (p) => {
      const text = str(p?.text, 140);
      return text ? { eyebrow: str(p?.eyebrow, 40), text } : null;
    },
    render: (p) =>
      `<div class="b-heading">${p.eyebrow ? `<span class="b-eyebrow">${esc(p.eyebrow)}</span>` : ""}<h2>${esc(p.text)}</h2></div>`,
  },

  story: {
    sanitize: (p) => {
      const text = str(p?.text, 900);
      return text ? { text } : null;
    },
    render: (p) => `<p class="view-story">${esc(p.text)}</p>`,
  },

  "kpi-row": {
    sanitize: (p) => {
      const items = list(p?.items, 6)
        .map((i) => ({ value: str(i?.value, 24), label: str(i?.label, 48), hint: str(i?.hint, 60) }))
        .filter((i) => i.label);
      return items.length ? { items } : null;
    },
    render: (p) =>
      `<div class="b-kpis">${p.items
        .map(
          (i) =>
            `<div class="b-kpi"><span class="b-kpi-v">${esc(i.value)}</span><span class="b-kpi-l">${esc(i.label)}</span>${
              i.hint ? `<span class="b-kpi-h">${esc(i.hint)}</span>` : ""
            }</div>`
        )
        .join("")}</div>`,
  },

  table: {
    sanitize: (p) => {
      const columns = list(p?.columns, 8).map((c) => str(c, 60)).filter(Boolean);
      const rows = list(p?.rows, MAX_ROWS)
        .map((r) => list(r, columns.length || 8).map((c) => str(c, 220)))
        .filter((r) => r.length);
      if (!columns.length || !rows.length) return null;
      return { columns, rows, caption: str(p?.caption, 140) };
    },
    render: (p) =>
      `<div class="b-table-wrap"><table class="matrix">${
        p.caption ? `<caption>${esc(p.caption)}</caption>` : ""
      }<thead><tr>${p.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${p.rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`,
  },

  matrix: {
    sanitize: (p) => {
      const columns = list(p?.columns, 8).map((c) => str(c, 60)).filter(Boolean);
      const rows = list(p?.rows, MAX_ROWS)
        .map((r) => ({ label: str(r?.label, 80), cells: list(r?.cells, columns.length || 8).map((c) => str(c, 220)) }))
        .filter((r) => r.label);
      if (!columns.length || !rows.length) return null;
      return { columns, rows };
    },
    render: (p) =>
      `<div class="b-table-wrap"><table class="matrix"><thead><tr><th></th>${p.columns
        .map((c) => `<th>${esc(c)}</th>`)
        .join("")}</tr></thead><tbody>${p.rows
        .map((r) => `<tr><td>${esc(r.label)}</td>${r.cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`,
  },

  list: {
    sanitize: (p) => {
      const items = list(p?.items, MAX_ITEMS)
        .map((i) => ({
          title: str(i?.title, 160),
          text: str(i?.text, 400),
          tag: str(i?.tag, 40),
          tone: ["critical", "high", "medium", "info", "ok"].includes(i?.tone) ? i.tone : "",
          evidence: str(i?.evidence, 160),
        }))
        .filter((i) => i.title);
      return items.length ? { items, ordered: Boolean(p?.ordered) } : null;
    },
    render: (p) => {
      const tag = p.ordered ? "ol" : "ul";
      return `<${tag} class="b-list">${p.items
        .map(
          (i) =>
            `<li class="b-item ${i.tone ? "t-" + esc(i.tone) : ""}">
              <div class="b-item-head">
                <span class="b-item-title">${esc(i.title)}</span>
                ${i.tag ? `<span class="b-tag">${esc(i.tag)}</span>` : ""}
              </div>
              ${i.text ? `<div class="b-item-text">${esc(i.text)}</div>` : ""}
              ${i.evidence ? `<div class="ev">${esc(i.evidence)}</div>` : ""}
            </li>`
        )
        .join("")}</${tag}>`;
    },
  },

  pills: {
    sanitize: (p) => {
      const items = list(p?.items, MAX_ITEMS)
        .map((i) => ({ text: str(i?.text, 80), tone: ["in", "out", "info", "ok", "warn"].includes(i?.tone) ? i.tone : "" }))
        .filter((i) => i.text);
      return items.length ? { items } : null;
    },
    render: (p) =>
      `<div class="b-pills">${p.items
        .map((i) => `<span class="b-pill ${i.tone ? "p-" + esc(i.tone) : ""}">${esc(i.text)}</span>`)
        .join("")}</div>`,
  },

  stepper: {
    sanitize: (p) => {
      const steps = list(p?.steps, 12)
        .map((s) => ({
          label: str(s?.label, 120),
          status: STEP_STATES.includes(s?.status) ? s.status : "skip",
          detail: str(s?.detail, 160),
        }))
        .filter((s) => s.label);
      return steps.length ? { steps } : null;
    },
    // El trazo se dibuja con dashoffset; --i escalona fila, conector y check.
    render: (p) =>
      `<ol class="b-steps">${p.steps
        .map((s, i) => {
          const path = STEP_PATH[s.status];
          return `<li class="b-step st-${esc(s.status)}" style="--i:${i}">
            <svg class="b-step-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <circle cx="10" cy="10" r="8.4"></circle>
              ${path ? `<path class="b-step-check" d="${path}"></path>` : ""}
            </svg>
            <span class="b-step-body"><span class="b-step-label">${esc(s.label)}</span>${
              s.detail ? `<span class="b-step-detail">${esc(s.detail)}</span>` : ""
            }</span>
          </li>`;
        })
        .join("")}</ol>`,
  },

  flow: {
    sanitize: (p) => {
      const nodes = list(p?.nodes, 12)
        .map((n) => ({ id: str(n?.id, 40), label: str(n?.label, 100), kind: NODE_KINDS.includes(n?.kind) ? n.kind : "system" }))
        .filter((n) => n.label);
      const ids = new Set(nodes.map((n) => n.id).filter(Boolean));
      const edges = list(p?.edges, 20)
        .map((e) => ({ from: str(e?.from, 40), to: str(e?.to, 40), label: str(e?.label, 80), status: e?.status === "broken" ? "broken" : "ok" }))
        .filter((e) => ids.has(e.from) && ids.has(e.to));
      return nodes.length ? { nodes, edges } : null;
    },
    render: (p) => {
      const byId = new Map(p.nodes.map((n) => [n.id, n.label]));
      return `<div class="b-flow">
        <div class="b-flow-nodes">${p.nodes
          .map((n) => `<span class="b-flow-node kind-${esc(n.kind)}">${esc(n.label)}</span>`)
          .join('<span class="b-flow-arrow" aria-hidden="true">→</span>')}</div>
        ${
          p.edges.length
            ? `<ul class="b-flow-edges">${p.edges
                .map(
                  (e) =>
                    `<li class="${e.status === "broken" ? "broken" : ""}">${esc(byId.get(e.from))} → ${esc(
                      byId.get(e.to)
                    )}${e.label ? ` <em>${esc(e.label)}</em>` : ""}${e.status === "broken" ? ' <span class="badge broken">roto</span>' : ""}</li>`
                )
                .join("")}</ul>`
            : ""
        }
      </div>`;
    },
  },

  // Flujo animado. El HTML puro trae el fallback estático; flowanim.mjs lo
  // reemplaza por un diagrama Mermaid con el punto viajando por las aristas.
  flowanim: {
    sanitize: (p) => PRIMITIVES.flow.sanitize(p),
    render: (p) => {
      const spec = JSON.stringify({ nodes: p.nodes, edges: p.edges }).replace(/</g, "\\u003c");
      return `<div class="b-flowanim" data-flowanim>
        <div class="fa-shell"><div class="fa-canvas">${PRIMITIVES.flow.render(p)}</div></div>
        <div class="fa-bar">
          <span class="fa-caption" data-state="run">recorrido del flujo</span>
          <div class="fa-controls" hidden>
            <button type="button" data-fa="prev" aria-label="paso anterior">◀</button>
            <button type="button" data-fa="play">play</button>
            <button type="button" data-fa="next" aria-label="paso siguiente">▶</button>
            <button type="button" data-fa="replay">repetir</button>
            <button type="button" data-fa="speed">1x</button>
          </div>
        </div>
        <script type="application/json" class="fa-spec">${spec}</script>
      </div>`;
    },
  },

  "two-col": {
    sanitize: (p) => {
      const col = (c) => ({
        title: str(c?.title, 80),
        items: list(c?.items, 10).map((i) => str(i, 240)).filter(Boolean),
      });
      const left = col(p?.left);
      const right = col(p?.right);
      return left.items.length || right.items.length ? { left, right } : null;
    },
    render: (p) =>
      `<div class="two-col">${[p.left, p.right]
        .map(
          (c) =>
            `<div class="col-card"><h4>${esc(c.title)}</h4><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`
        )
        .join("")}</div>`,
  },

  timeline: {
    sanitize: (p) => {
      const events = list(p?.events, 12)
        .map((e) => ({ when: str(e?.when, 40), title: str(e?.title, 140), text: str(e?.text, 260) }))
        .filter((e) => e.title);
      return events.length ? { events } : null;
    },
    render: (p) =>
      `<ol class="b-timeline">${p.events
        .map(
          (e) =>
            `<li><span class="b-tl-when">${esc(e.when)}</span><span class="b-tl-body"><strong>${esc(
              e.title
            )}</strong>${e.text ? `<span>${esc(e.text)}</span>` : ""}</span></li>`
        )
        .join("")}</ol>`,
  },

  callout: {
    sanitize: (p) => {
      const text = str(p?.text, 400);
      return text ? { tone: tone(p?.tone), title: str(p?.title, 80), text } : null;
    },
    render: (p) =>
      `<div class="b-callout c-${esc(p.tone)}">${p.title ? `<strong>${esc(p.title)}</strong>` : ""}<span>${esc(
        p.text
      )}</span></div>`,
  },

  evidence: {
    sanitize: (p) => {
      const rows = list(p?.rows, MAX_ROWS)
        .map((r) => ({ id: str(r?.id, 24), ref: str(r?.ref, 180), note: str(r?.note, 120) }))
        .filter((r) => r.ref);
      return rows.length ? { rows } : null;
    },
    render: (p) =>
      `<div class="evidence-list">${p.rows
        .map(
          (r) =>
            `<div class="ev-row"><code>${esc(r.id)}</code><span>${esc(r.ref)}${
              r.note ? ` <em>(${esc(r.note)})</em>` : ""
            }</span></div>`
        )
        .join("")}</div>`,
  },
};

export const BLOCK_TYPES = Object.keys(PRIMITIVES);

/** Descarta tipos desconocidos o props inválidas. Nunca lanza. */
export function sanitizeLayout(layout) {
  if (!Array.isArray(layout)) return [];
  const out = [];
  for (const block of layout.slice(0, MAX_BLOCKS)) {
    const type = typeof block?.type === "string" ? block.type : "";
    const prim = PRIMITIVES[type];
    if (!prim) continue;
    try {
      const props = prim.sanitize(block?.props);
      if (props) out.push({ type, props });
    } catch {
      /* un bloque roto no puede tumbar la vista */
    }
  }
  return out;
}

export function renderLayout(layout) {
  return sanitizeLayout(layout)
    .map((b) => {
      try {
        return PRIMITIVES[b.type].render(b.props);
      } catch {
        return "";
      }
    })
    .join("");
}
