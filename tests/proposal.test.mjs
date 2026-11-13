import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECTS, adaptProject } from "../public/diagnostic.mjs";
import { buildProposal, proposalFor } from "../public/proposal.mjs";

const adapt = (id) =>
  adaptProject(
    JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), "utf8")),
    PROJECTS.find((p) => p.id === id)
  );

const projects = PROJECTS.map((p) => adapt(p.id));

test("cada proyecto con diagnóstico tiene propuesta", () => {
  for (const p of projects) {
    const prop = buildProposal(p);
    assert.ok(prop, p.id);
    assert.ok(prop.infra.length > 0, p.id);
    assert.ok(prop.fases.length > 0, p.id);
    assert.ok(prop.escenarios.length > 0, p.id);
  }
});

test("sin diagnóstico no hay propuesta inventada", () => {
  const vacio = adaptProject(null, PROJECTS[0]);
  assert.equal(buildProposal(vacio), null);
});

test("toda recomendación cita hallazgos que existen", () => {
  for (const p of projects) {
    const ids = new Set(p.hallazgos.map((h) => h.id));
    const prop = buildProposal(p);
    for (const item of prop.infra) {
      assert.ok(item.resuelve.length > 0, `${p.id}/${item.id} sin ancla`);
      for (const id of item.resuelve) assert.ok(ids.has(id), `${p.id}/${item.id} cita ${id} inexistente`);
    }
    for (const f of prop.fases) {
      for (const id of f.cierra) assert.ok(ids.has(id), `${p.id}/${f.nombre} cierra ${id} inexistente`);
    }
  }
});

test("no quedan recomendaciones sin ancla por descarte silencioso", () => {
  for (const p of projects) assert.deepEqual(buildProposal(p).descartadas, [], p.id);
});

test("la cobertura cuenta bien los P0", () => {
  const cot = buildProposal(adapt("cotizador"));
  const p0 = adapt("cotizador").hallazgos.filter((h) => h.severidad === "P0");
  assert.equal(cot.cobertura.p0Total, p0.length);
  assert.ok(cot.cobertura.p0Cubiertos <= cot.cobertura.p0Total);
  const sum = cot.cobertura.p0Cubiertos + cot.cobertura.p0Sueltos.length;
  assert.equal(sum, cot.cobertura.p0Total);
});

test("los escenarios declaran qué cambia, no adjetivos", () => {
  for (const p of projects) {
    for (const e of buildProposal(p).escenarios) {
      assert.ok(e.cambia.length > 0, `${p.id}/${e.id} sin cambios`);
      for (const c of e.cambia) assert.ok(c.length > 12, `cambio demasiado corto: ${c}`);
    }
  }
});

test("cada riesgo de la propuesta trae un supuesto", () => {
  for (const p of projects) {
    for (const r of buildProposal(p).riesgos) {
      assert.ok(r.texto.length > 10);
      assert.ok(r.supuesto.length > 10, `riesgo sin supuesto en ${p.id}`);
    }
  }
});

test("la propuesta no cambia el diagnóstico original", () => {
  const antes = adapt("cotizador");
  const copia = JSON.parse(JSON.stringify(antes.hallazgos));
  buildProposal(antes);
  assert.deepEqual(antes.hallazgos, copia);
});

test("no hay propuesta para un proyecto desconocido", () => {
  assert.equal(proposalFor("otro"), null);
});
