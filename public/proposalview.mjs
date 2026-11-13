/**
 * Vista "Versión robusta". Todo lo de acá es PROPUESTA, no diagnóstico.
 */

import { esc } from "./esc.mjs";
import { buildProposal } from "./proposal.mjs";

const EFFORT = {
  S: { letra: "S", texto: "chico", clase: "s" },
  M: { letra: "M", texto: "medio", clase: "m" },
  L: { letra: "L", texto: "grande", clase: "l" },
};

export function renderProposal(host, project, { onBack, inline = false } = {}) {
  const prop = buildProposal(project);
  if (!prop) {
    host.innerHTML = `<div class="prop"><p class="prop-empty">Sin propuesta para este proyecto.</p></div>`;
    return;
  }

  const hallazgos = new Map(project.hallazgos.map((h) => [h.id, h]));

  host.innerHTML = `<div class="prop">
    <header class="prop-head">
      ${inline ? "" : `<button type="button" class="proj-back" id="prop-back">← ${esc(project.nombre)}</button>`}
      <div class="prop-flag">PROPUESTA</div>
      <h2 class="prop-title">Versión robusta</h2>
      <p class="prop-objetivo">${esc(prop.objetivo)}</p>
      <p class="prop-note">Esto no es lo que el diagnóstico encontró: es lo que proponemos construir. Cada ítem cita el hallazgo que lo origina.</p>
    </header>

    <section class="prop-sec">
      <h3 class="prop-h">Cobertura de hallazgos</h3>
      <div class="prop-cov">
        <span class="prop-cov-num">${prop.cobertura.p0Cubiertos}/${prop.cobertura.p0Total}</span>
        <span class="prop-cov-txt">hallazgos P0 cubiertos por la propuesta${
          prop.cobertura.p0Sueltos.length ? ` · quedan sueltos: ${esc(prop.cobertura.p0Sueltos.join(", "))}` : ""
        }</span>
      </div>
    </section>

    <section class="prop-sec">
      <h3 class="prop-h">Infraestructura y herramientas</h3>
      <div class="prop-infra">
        ${prop.infra
          .map(
            (i) => `<article class="prop-card">
          <div class="pc-head">
            <h4>${esc(i.nombre)}</h4>
            <span class="eff" data-e="${EFFORT[i.esfuerzo]?.clase || "s"}">${esc(EFFORT[i.esfuerzo]?.letra || i.esfuerzo)}</span>
          </div>
          <p>${esc(i.detalle)}</p>
          <div class="pc-anchors">${i.resuelve
            .map((id) => {
              const h = hallazgos.get(id);
              return `<span class="anchor" title="${esc(h?.titulo || "")}">${esc(id)}</span>`;
            })
            .join("")}</div>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section class="prop-sec">
      <h3 class="prop-h">Escenarios de escala</h3>
      <div class="prop-esc" id="prop-esc">
        ${prop.escenarios
          .map(
            (e, i) => `<button type="button" class="esc-tab${i === 0 ? " is-on" : ""}" data-esc="${esc(e.id)}">${esc(e.etiqueta)}</button>`
          )
          .join("")}
      </div>
      <ul class="prop-cambios" id="prop-cambios">
        ${prop.escenarios[0].cambia.map((c) => `<li>${esc(c)}</li>`).join("")}
      </ul>
    </section>

    <section class="prop-sec">
      <h3 class="prop-h">Ruta por fases</h3>
      <ol class="prop-fases">
        ${prop.fases
          .map(
            (f, i) => `<li>
          <div class="pf-head">
            <span class="pf-num">${i + 1}</span>
            <span class="pf-name">${esc(f.nombre)}</span>
            <span class="eff" data-e="${EFFORT[f.esfuerzo]?.clase || "s"}">${esc(EFFORT[f.esfuerzo]?.letra || f.esfuerzo)}</span>
          </div>
          <div class="pf-meta">cierra ${f.cierra.map((id) => `<span class="anchor">${esc(id)}</span>`).join(" ")}${
            f.dependeDe.length ? ` · después de ${esc(f.dependeDe.join(", "))}` : ""
          }</div>
        </li>`
          )
          .join("")}
      </ol>
    </section>

    <section class="prop-sec">
      <h3 class="prop-h">Riesgos de la propuesta</h3>
      <ul class="prop-riesgos">
        ${prop.riesgos
          .map((r) => `<li><p>${esc(r.texto)}</p><p class="sup"><strong>Supuesto:</strong> ${esc(r.supuesto)}</p></li>`)
          .join("")}
      </ul>
    </section>
  </div>`;

  host.querySelector("#prop-back")?.addEventListener("click", () => onBack?.());

  host.querySelectorAll("[data-esc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      host.querySelectorAll("[data-esc]").forEach((b) => b.classList.toggle("is-on", b === btn));
      const esc = prop.escenarios.find((e) => e.id === btn.dataset.esc);
      const list = host.querySelector("#prop-cambios");
      if (esc && list) list.innerHTML = esc.cambia.map((c) => `<li>${esc(c)}</li>`).join("");
    });
  });
}
