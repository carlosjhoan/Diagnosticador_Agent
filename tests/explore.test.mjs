import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECTS, adaptProject } from "../public/diagnostic.mjs";
import {
  resolveProject,
  exploreQuestion,
  exploreToday,
  exploreFindings,
  exploreNodes,
  exploreAxes,
  exploreHypotheses,
  exploreNode,
  exploreProposal,
  axisAverages,
  managementAxes,
} from "../public/explore.mjs";

const projects = PROJECTS.map((p) =>
  adaptProject(
    JSON.parse(readFileSync(new URL(`../public/data/${p.id}.json`, import.meta.url), "utf8")),
    p
  )
);
const cot = projects.find((p) => p.id === "cotizador");
const items = (spec, type = "list") => spec.layout.find((b) => b.type === type)?.props?.items || [];

/* ---------- resolución ---------- */

test("el proyecto se resuelve por nombre", () => {
  assert.equal(resolveProject("qué pasa en la landing", projects).id, "landing");
  assert.equal(resolveProject("qué pasa en el comercial", projects).id, "cotizador");
  assert.equal(resolveProject("qué pasa en gerencial", projects).id, "gerencial");
});

test("sin nombre se resuelve por etapa única", () => {
  assert.equal(resolveProject("mostrame la etapa de captura", projects).id, "cotizador");
});

test("sin pistas no se adivina", () => {
  assert.equal(resolveProject("hola", projects, null), null);
});

/* ---------- concisión ---------- */

test("los hallazgos no vuelcan los 16: muestran 5 y avisan cuántos quedan", () => {
  const spec = exploreFindings(cot);
  assert.equal(items(spec).length, 5);
  assert.match(spec.story, /5 de 16/);
  assert.match(spec.story, /hay 11 más/);
});

test("filtrar por P0 devuelve sólo bloqueantes y no más de cinco", () => {
  const list = items(exploreFindings(cot, "P0"));
  assert.ok(list.length > 0 && list.length <= 5);
  for (const i of list) assert.equal(i.tag, "bloquea");
});

test("los nodos se agrupan por etapa, no en una tabla de 22", () => {
  const spec = exploreNodes(cot);
  const filas = items(spec);
  assert.equal(filas.length, cot.etapas.length, "una fila por etapa");
  for (const f of filas) assert.match(f.tag, /^\d+ pasos$/);
});

test("una etapa concreta muestra sólo sus pasos flojos", () => {
  const spec = exploreNodes(cot, "extraccion");
  const filas = items(spec);
  assert.ok(filas.length <= 6);
  assert.match(spec.title, /Pre-cotización/i);
});

test("los ejes muestran los tres más flojos, no los once", () => {
  const spec = exploreAxes(cot);
  const filas = items(spec);
  assert.equal(filas.length, 3);
  assert.ok(axisAverages(cot).length >= 10, "la fuente sigue teniendo los once");
});

test("los cinco ejes de gerencia salen de los técnicos, sin inventar", () => {
  const gerencia = managementAxes(cot);
  assert.equal(gerencia.length, 5);
  for (const e of gerencia) {
    assert.ok(e.promedio >= 0 && e.promedio <= 3);
    assert.ok(e.tecnicos.length > 0);
  }
});

test("las hipótesis priorizan las refutadas y no pasan de cuatro", () => {
  const spec = exploreHypotheses(cot);
  const filas = items(spec);
  assert.ok(filas.length <= 4);
  const refutadas = filas.filter((f) => f.tag === "refutada");
  assert.ok(refutadas.length > 0, "las refutadas son las que cambian decisiones");
});

test("el detalle de un nodo no muestra códigos internos", () => {
  const spec = exploreNode(cot, "N08");
  assert.ok(!/\bI[0-3]\b|\bF[0-3]\b|\bQ[0-3]\b/.test(spec.title + " " + spec.story), "sin códigos en el texto");
  assert.match(spec.story, /construido|a medias|falta/);
});

test("un nodo inexistente no inventa nada", () => {
  assert.equal(exploreNode(cot, "X99"), null);
});

test("la vista de hoy trae etapas y los tres problemas que frenan", () => {
  const spec = exploreToday(cot);
  const tabla = spec.layout.find((b) => b.type === "table");
  assert.equal(tabla.props.rows.length, cot.etapas.length);
  assert.ok(spec.story.includes("%"));
});

test("la propuesta se etiqueta como propuesta", () => {
  const spec = exploreProposal(cot);
  assert.match(spec.story, /propuesta, no un hallazgo/i);
});

/* ---------- detección ---------- */

test("una pregunta sin proyecto mira los tres", () => {
  const spec = exploreQuestion("¿qué riesgos hay?", projects, null);
  assert.equal(spec.projectId, null);
  assert.match(spec.title, /tres/);
});

test("las preguntas del dashboard entran por la exploración nueva", () => {
  const casos = [
    ["¿Qué riesgos corro en el Cotizador?", /frena/],
    ["¿Qué le falta al Gerencial?", /falta/],
    ["¿Cuáles son los ejes del Landing?", /flojos/],
    ["¿Qué tenemos hoy en el Cotizador?", /hoy/],
    ["la propuesta robusta del cotizador", /sólido/],
    ["mostrame los nodos del N08", /Comparación/],
  ];
  for (const [q, esperado] of casos) {
    const spec = exploreQuestion(q, projects, null);
    assert.ok(spec, `no resolvió: ${q}`);
    assert.match(spec.title, esperado, q);
  }
});

test("una pregunta ajena no la secuestra", () => {
  assert.equal(exploreQuestion("¿cómo está el clima?", projects, null), null);
});

test("todas las vistas traen layout renderizable", () => {
  for (const p of projects) {
    for (const spec of [
      exploreToday(p),
      exploreFindings(p),
      exploreNodes(p),
      exploreAxes(p, { management: true }),
      exploreHypotheses(p),
      exploreProposal(p),
    ]) {
      if (!spec) continue;
      assert.ok(Array.isArray(spec.layout) && spec.layout.length > 0, p.id);
      for (const b of spec.layout) assert.ok(b.type && b.props, `${p.id}: bloque sin forma`);
    }
  }
});

test("ninguna vista muestra más de seis filas por bloque", () => {
  for (const p of projects) {
    for (const spec of [exploreToday(p), exploreFindings(p), exploreNodes(p), exploreAxes(p), exploreHypotheses(p)]) {
      if (!spec) continue;
      for (const b of spec.layout) {
        const n = (b.props?.items || b.props?.rows || []).length;
        if (n) assert.ok(n <= 6, `${p.id}: un bloque con ${n} filas`);
      }
    }
  }
});

test("una pregunta sobre un paso lo encuentra por su nombre", () => {
  const spec = exploreQuestion("qué tenemos acerca de la selección de cita por ejemplo", projects, null);
  assert.ok(spec, "debe resolver");
  assert.equal(spec.title, "Selección de cita");
  assert.ok(!/I\d|Q\d|F\d/.test(spec.story), "sin códigos internos");
});

test("el nombre del paso se reconoce aunque falten tildes o sobre texto", () => {
  const spec = exploreQuestion("y el cuestionario de 37 preguntas, cómo está?", projects, null);
  assert.equal(spec.title, "Cuestionario guiado de 37 preguntas");
});

test("una palabra suelta no secuestra la pregunta", () => {
  const spec = exploreQuestion("qué pasa con la producción de contenido", projects, null);
  // "producción" sola no debe alcanzar para abrir un paso: cae en hallazgos o null
  assert.ok(!spec || !/^Producción/.test(spec.title), "no debe matchear por una palabra");
});
