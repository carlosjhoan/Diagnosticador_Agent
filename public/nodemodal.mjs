/**
 * Modal de detalle por nodo: siete pestañas con lo que el diagnóstico sabe.
 * Si un dato no existe, se dice — no se rellena.
 */

import { esc } from "./esc.mjs";
import { estadoNodo } from "./diagnostic.mjs";

const TABS = [
  { id: "l1", label: "Resumen" },
  { id: "falta", label: "Qué falta" },
  { id: "tecnico", label: "Técnico" },
];

const VERDICT = {
  CONFIRMADA: { texto: "confirmada", tono: "warn" },
  PARTIALLY_CONFIRMED: { texto: "parcialmente confirmada", tono: "mid" },
  REFUTADA: { texto: "refutada", tono: "ok" },
  NO_CONCLUYENTE: { texto: "no concluyente", tono: "nv" },
};

const vacio = (texto) => `<p class="nm-empty">${esc(texto)}</p>`;

function ejesHtml(node, project) {
  const ids = Object.keys(node.ejes);
  if (!ids.length) return vacio("El diagnóstico no trae ejes para este nodo.");

  const nombres = {};
  for (const a of project.axes || []) nombres[a.id] = a.name;

  return `<div class="nm-axes">${ids
    .map((id) => {
      const v = node.ejes[id];
      const pct = v == null ? 0 : (v / 3) * 100;
      return `<div class="nm-axis" data-v="${v ?? "nv"}">
        <span class="na-name">${esc(nombres[id] || id)}</span>
        <span class="na-bar"><i style="width:${pct}%"></i></span>
        <span class="na-val">${v == null ? "—" : v}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function bodyHtml(tab, node, project) {
  const e = estadoNodo(node);
  const etapa = project.etapas.find((x) => x.id === node.etapa)?.titulo || node.etapa;

  if (tab === "l1") {
    return `
      <p class="nm-lead">${esc(node.l1 || "Sin resumen.")}</p>
      <dl class="nm-kv">
        <dt>Cómo está</dt><dd>${esc(e.implementadoTexto)}</dd>
        <dt>Estado</dt><dd>${esc(e.robustezTexto)}</dd>
        <dt>Etapa</dt><dd>${esc(etapa)}</dd>
      </dl>
      ${(node.l2?.hace || []).length ? `<h4 class="nm-h">Qué hace hoy</h4><ul class="nm-list">${node.l2.hace.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}`;
  }

  if (tab === "falta") {
    const falta = (node.l2?.falta || []).slice(0, 4);
    const mejora = (node.l3?.mejora || []).slice(0, 2);
    return `
      ${falta.length
        ? `<h4 class="nm-h">Qué le falta</h4><ul class="nm-list is-warn">${falta.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
        : '<p class="nm-lead">Este paso no tiene pendientes abiertos.</p>'}
      ${mejora.length ? `<h4 class="nm-h">Cómo debería resolverse</h4><ul class="nm-list">${mejora.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}`;
  }

  const ev = node.evidencia || [];
  const hip = (project.hipotesis || []).filter((h) => (h.nodos || []).includes(node.id));
  const riesgos = node.riesgos || [];

  return `
    <dl class="nm-kv">
      <dt>Integración</dt><dd>${esc(node.integracion)}</dd>
      <dt>Funcionamiento</dt><dd>${esc(node.funcionamiento)}</dd>
      <dt>Verificado por</dt><dd>${esc(node.verificadoPor)}</dd>
    </dl>
    ${ev.length ? `<h4 class="nm-h">Evidencia</h4><ul class="nm-ev">${ev.map((x) => `<li><code>${esc(x.ruta)}${x.linea ? ":" + x.linea : ""}</code><button type="button" class="nm-copy" data-copy="${esc(x.ruta)}${x.linea ? ":" + x.linea : ""}">copiar</button></li>`).join("")}</ul>` : ""}
    ${ejesHtml(node, project)}
    ${hip.length ? `<h4 class="nm-h">Hipótesis</h4><ul class="nm-hyp">${hip.map((h) => { const v = VERDICT[h.veredicto] || { texto: String(h.veredicto).toLowerCase(), tono: "nv" }; return `<li><span class="nh-badge" data-s="${v.tono}">${esc(h.id)} · ${esc(v.texto)}</span><p>${esc(h.texto)}</p></li>`; }).join("")}</ul>` : ""}
    ${riesgos.length ? `<h4 class="nm-h">Riesgos</h4><ul class="nm-list">${riesgos.map((r) => `<li>${esc(r.descripcion || "")}</li>`).join("")}</ul>` : '<p class="nm-empty">El diagnóstico no registra riesgos para este paso.</p>'}`;
}

/** Ficha compacta para embeber en el hilo. */
export function renderNodeInline(host, project, nodeId, { onExpand } = {}) {
  const node = project.nodos.find((n) => n.id === nodeId);
  if (!node) {
    host.innerHTML = `<p class="nm-empty">No encontré el nodo ${esc(nodeId)}.</p>`;
    return;
  }
  const e = estadoNodo(node);
  const falta = node.l2?.falta || [];

  host.innerHTML = `<div class="nin">
    <header class="nin-head">
      <span class="nm-id">${esc(node.id)}</span>
      <h3 class="nin-title">${esc(node.nombre)}</h3>
      <span class="nm-signal" data-implementado="${esc(e.implementado)}">${esc(e.implementadoTexto)}</span>
      <span class="nm-signal" data-robustez="${esc(e.robustez)}">${esc(e.robustezTexto)}</span>
    </header>
    <p class="nin-lead">${esc(node.l1)}</p>
    ${falta.length ? `<h4 class="nm-h">Qué falta</h4><ul class="nm-list is-warn">${falta.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <button type="button" class="nin-more" id="nin-more">Ver ficha completa →</button>
  </div>`;

  host.querySelector("#nin-more")?.addEventListener("click", () => onExpand?.());
}

export function openNodeModal(project, nodeId, { onChange } = {}) {
  const dlg = document.getElementById("nmodal");
  if (!dlg) return;

  const idx = () => project.nodos.findIndex((n) => n.id === nodeId);
  let tab = "l1";

  const pintar = () => {
    const node = project.nodos[idx()];
    if (!node) return;
    const e = estadoNodo(node);

    dlg.querySelector("#nm-id").textContent = node.id;
    dlg.querySelector("#nm-title").textContent = node.nombre;
    dlg.querySelector("#nm-impl").textContent = e.implementadoTexto;
    dlg.querySelector("#nm-impl").dataset.implementado = e.implementado;
    dlg.querySelector("#nm-rob").textContent = e.robustezTexto;
    dlg.querySelector("#nm-rob").dataset.robustez = e.robustez;

    dlg.querySelector("#nm-tabs").innerHTML = TABS.map(
      (t) => `<button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}" class="${t.id === tab ? "is-on" : ""}">${t.label}</button>`
    ).join("");

    dlg.querySelector("#nm-body").innerHTML = bodyHtml(tab, node, project);
    dlg.querySelector("#nm-pos").textContent = `${idx() + 1} / ${project.nodos.length}`;
    dlg.querySelector("#nm-prev").disabled = idx() <= 0;
    dlg.querySelector("#nm-next").disabled = idx() >= project.nodos.length - 1;

    dlg.querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.tab;
        pintar();
      })
    );

    dlg.querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          b.textContent = "copiado";
          setTimeout(() => (b.textContent = "copiar"), 1200);
        } catch {
          /* sin permiso de portapapeles: se deja el texto visible */
        }
      })
    );

    const ask = dlg.querySelector("#nm-ask");
    if (ask) {
      ask.onclick = () => {
        const input = document.getElementById("input");
        if (input) {
          input.value = `Muéstrame el detalle de ${node.nombre}`;
          input.focus();
        }
        dlg.close();
      };
    }

    onChange?.(node.id);
  };

  const move = (delta) => {
    const next = idx() + delta;
    if (next < 0 || next >= project.nodos.length) return;
    nodeId = project.nodos[next].id;
    pintar();
  };

  const onKey = (ev) => {
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      move(1);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      move(-1);
    }
  };

  dlg.addEventListener("keydown", onKey);
  dlg.addEventListener("close", () => dlg.removeEventListener("keydown", onKey), { once: true });

  dlg.querySelector("#nm-prev").onclick = () => move(-1);
  dlg.querySelector("#nm-next").onclick = () => move(1);
  dlg.querySelector("#nm-close").onclick = () => dlg.close();

  pintar();
  if (!dlg.open) dlg.showModal();
}
