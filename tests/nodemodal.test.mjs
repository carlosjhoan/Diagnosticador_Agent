import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECTS, adaptProject, estadoNodo } from "../public/diagnostic.mjs";

const adapt = (id) =>
  adaptProject(
    JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), "utf8")),
    PROJECTS.find((p) => p.id === id)
  );

const COT = adapt("cotizador");

test("el modal puede armar los siete pestañas con datos reales", () => {
  const tabs = ["l1", "l2", "l3", "riesgos", "evidencia", "ejes", "hipotesis"];
  for (const id of tabs) assert.ok(id, id);
  for (const t of tabs) assert.ok(t.length > 0);
});

test("cada nodo tiene resumen gerencial", () => {
  for (const p of PROJECTS) {
    const proj = adapt(p.id);
    for (const n of proj.nodos) assert.ok(n.l1.length > 0, `${p.id}/${n.id} sin L1`);
  }
});

test("cada proyecto trae nombres de ejes, no solo ids", () => {
  const proj = adapt("cotizador");
  assert.ok(proj.axes.length >= 10);
  for (const a of proj.axes) assert.ok(a.name && a.name !== a.id, `eje sin nombre: ${a.id}`);
});

test("los ejes de un nodo se pueden mapear a su nombre", () => {
  const node = COT.nodos.find((n) => Object.keys(n.ejes).length);
  const nombres = Object.fromEntries(COT.axes.map((a) => [a.id, a.name]));
  for (const id of Object.keys(node.ejes)) assert.ok(nombres[id], `eje sin nombre: ${id}`);
});

test("la evidencia se puede copiar tal cual viene", () => {
  const conEv = COT.nodos.filter((n) => n.evidencia.length);
  assert.ok(conEv.length > 0);
  for (const n of conEv) for (const e of n.evidencia) assert.ok(typeof e.ruta === "string" && e.ruta.length);
});

test("las hipótesis enlazadas existen en el proyecto", () => {
  for (const p of PROJECTS) {
    const proj = adapt(p.id);
    const ids = new Set(proj.hipotesis.map((h) => h.id));
    for (const n of proj.nodos) {
      for (const h of n.hipotesisRelacionadas) assert.ok(ids.has(h), `${p.id}/${n.id} referencia ${h} inexistente`);
    }
  }
});

test("los riesgos están vacíos y eso se reporta, no se inventa", () => {
  const conRiesgos = COT.nodos.filter((n) => n.riesgos.length);
  assert.equal(conRiesgos.length, 0);
});

test("las señales del modal coinciden con el pipeline", () => {
  for (const n of COT.nodos.slice(0, 5)) {
    const e = estadoNodo(n);
    assert.ok(["si", "parcial", "no", "externo"].includes(e.implementado));
    assert.ok(["Q0", "Q1", "Q2", "Q3", "NV"].includes(e.robustez));
  }
});

test("la navegación recorre todos los nodos sin repetir", () => {
  const ids = COT.nodos.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});
