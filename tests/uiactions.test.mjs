import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECTS, adaptProject } from "../public/diagnostic.mjs";
import { runUiAction } from "../public/uiactions.mjs";

const projects = PROJECTS.map((p) =>
  adaptProject(
    JSON.parse(readFileSync(new URL(`../public/data/${p.id}.json`, import.meta.url), "utf8")),
    p
  )
);

const ctx = (currentId = null) => ({
  projects,
  currentProject: () => projects.find((p) => p.id === currentId) || null,
  openProject() {},
  openNode() {},
  focusNode() {},
  setFilter() {},
});

test("abrir_proyecto devuelve la vista en vez de navegar", () => {
  const out = runUiAction("abrir_proyecto", { proyecto: "cotizador" }, ctx());
  assert.equal(out.ok, true);
  assert.deepEqual(out.vista, { tipo: "proyecto", proyectoId: "cotizador" });
});

test("un proyecto inexistente no devuelve vista", () => {
  const out = runUiAction("abrir_proyecto", { proyecto: "otro" }, ctx());
  assert.equal(out.ok, false);
  assert.equal(out.vista, undefined);
});

test("abrir_detalle abre el modal, no una tarjeta", () => {
  const out = runUiAction("abrir_detalle", { nodo: "N08" }, ctx());
  assert.equal(out.ok, true);
  assert.equal(out.vista, undefined, "no debe crear otra entrada en el hilo");
  assert.equal(out.modal.nodoId, "N08");
  assert.equal(out.modal.proyectoId, "cotizador");
});

test("enfocar un nodo del proyecto abierto no crea otra vista", () => {
  const out = runUiAction("enfocar_nodo", { nodo: "N08" }, ctx("cotizador"));
  assert.equal(out.ok, true);
  assert.equal(out.vista, undefined, "ya está en pantalla: solo se señala");
});


test("el detalle se encuentra por el nombre que dice la persona", () => {
  const out = runUiAction("abrir_detalle", { nombre: "comparación con cotizaciones" }, ctx("cotizador"));
  assert.equal(out.ok, true);
  assert.equal(out.modal.nodoId, "N08");
});

test("el nombre tolera tildes y mayúsculas", () => {
  const out = runUiAction("abrir_detalle", { nombre: "COMPARACION CON COTIZACIONES" }, ctx("cotizador"));
  assert.equal(out.ok, true);
  assert.equal(out.modal.nodoId, "N08");
});

test("un nombre que no existe no inventa un nodo", () => {
  const out = runUiAction("abrir_detalle", { nombre: "cotizador cuántico" }, ctx());
  assert.equal(out.ok, false);
});
