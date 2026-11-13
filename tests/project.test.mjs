import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECTS, adaptProject } from "../public/diagnostic.mjs";
import { visibleNodes, etapasConNodos, flowOrder } from "../public/project.mjs";

const adapt = (id) =>
  adaptProject(
    JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), "utf8")),
    PROJECTS.find((p) => p.id === id)
  );

const COT = adapt("cotizador");

test("sin filtros se ven todos los nodos actuales", () => {
  const v = visibleNodes(COT, {});
  assert.equal(v.length, COT.nodos.filter((n) => n.alcance !== "Futuro").length);
});

test("el filtro de problemas deja solo Q1 y Q0", () => {
  const v = visibleNodes(COT, { onlyProblems: true });
  assert.ok(v.length > 0);
  for (const n of v) assert.ok(["Q1", "Q0"].includes(n.calidad), `${n.id} tiene ${n.calidad}`);
});

test("las etapas conservan su orden y sus nodos visibles", () => {
  const etapas = etapasConNodos(COT, {});
  assert.equal(etapas.length, COT.etapas.length);
  assert.deepEqual(
    etapas.map((e) => e.orden),
    [...etapas.map((e) => e.orden)].sort((a, b) => a - b)
  );
  const total = etapas.reduce((a, e) => a + e.nodos.length, 0);
  assert.equal(total, visibleNodes(COT, {}).length);
});

test("filtrar por problemas reduce lo que se muestra", () => {
  const todos = etapasConNodos(COT, {}).reduce((a, e) => a + e.nodos.length, 0);
  const pocos = etapasConNodos(COT, { onlyProblems: true }).reduce((a, e) => a + e.nodos.length, 0);
  assert.ok(pocos < todos);
});

test("mostrar futuro suma los nodos que estaban ocultos", () => {
  const p = adapt("gerencial");
  const con = visibleNodes(p, { showFuture: true }).length;
  const sin = visibleNodes(p, { showFuture: false }).length;
  assert.ok(con >= sin);
});

test("una etapa puede quedar vacía sin romper el render", () => {
  const etapas = etapasConNodos(COT, { onlyProblems: true });
  assert.ok(etapas.some((e) => e.nodos.length === 0));
});

test("todos los nodos del pipeline existen en el proyecto original", () => {
  const ids = new Set(COT.nodos.map((n) => n.id));
  for (const e of etapasConNodos(COT, {})) {
    for (const id of e.nodos) assert.ok(ids.has(id), `nodo inexistente: ${id}`);
  }
});

test("las aristas referencian nodos existentes", () => {
  const ids = new Set(COT.nodos.map((n) => n.id));
  for (const a of COT.aristas) {
    assert.ok(ids.has(a.de), `origen inexistente: ${a.de}`);
    assert.ok(ids.has(a.a), `destino inexistente: ${a.a}`);
  }
});

test("el orden de encendido sigue el flujo declarado", () => {
  const orden = flowOrder(COT);
  assert.equal(orden.length, COT.nodos.length);
  assert.equal(orden[0], "N01");
  // el recorrido declarado va primero y en su orden
  assert.deepEqual(orden.slice(0, COT.flow.length), COT.flow);
  // y el resto de nodos entra después, sin quedar afuera
  assert.equal(orden.length, COT.nodos.length);
});

test("cada nodo aparece una sola vez en el encendido", () => {
  for (const id of ["landing", "cotizador", "gerencial"]) {
    const orden = flowOrder(adapt(id));
    assert.equal(new Set(orden).size, orden.length, id);
  }
});

test("sin flujo declarado cae en etapa y orden", () => {
  const sinFlujo = { ...COT, flow: [] };
  const orden = flowOrder(sinFlujo);
  assert.equal(orden.length, COT.nodos.length);
  assert.equal(orden[0], "N01");
});

test("el encendido no incluye ids inexistentes", () => {
  const ids = new Set(COT.nodos.map((n) => n.id));
  for (const id of flowOrder(COT)) assert.ok(ids.has(id), id);
});
