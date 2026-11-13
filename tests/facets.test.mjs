import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFacet, buildFacet, facetSpec, controlsFor } from "../facets.mjs";

const g = JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8"));

test("detecta la faceta correcta por pregunta", () => {
  // panorama, costuras y proceso ya no se enrutan: se exploran desde el diagnóstico.
  assert.equal(detectFacet("que riesgos corro", g).facet, "risks");
  assert.equal(detectFacet("como se conectan los sistemas", g), null);
  assert.equal(detectFacet("dame el panorama general", g), null);
  assert.equal(detectFacet("hazme un diagrama del proceso", g), null);
});

test("no inventa faceta donde no hay", () => {
  assert.equal(detectFacet("que falta en el brain", g), null);
  assert.equal(detectFacet("dame la evidencia del C-P0-1", g), null);
});

test("el proceso no se detecta si el grafo no lo tiene", () => {
  assert.equal(detectFacet("hazme un diagrama del proceso", { ...g, process: undefined }), null);
});

test("riesgos filtra por proyecto y por gravedad", () => {
  const base = buildFacet("risks", { project: "todos", sev: "all" }, g);
  const crit = buildFacet("risks", { project: "todos", sev: "critical" }, g);
  const listBase = base.layout.find((b) => b.type === "list").props.items;
  const listCrit = crit.layout.find((b) => b.type === "list").props.items;
  assert.ok(listBase.length > listCrit.length, "el filtro crítico debe achicar");
  assert.ok(listCrit.every((i) => i.tone === "critical"));
});

test("riesgos con proyecto 'todos' suma los tres", () => {
  const todos = buildFacet("risks", { project: "todos", sev: "all" }, g).layout.find((b) => b.type === "list").props.items;
  const uno = buildFacet("risks", { project: "landing", sev: "all" }, g).layout.find((b) => b.type === "list").props.items;
  assert.ok(todos.length > uno.length);
});

test("costuras filtra por estado", () => {
  const todas = buildFacet("seams", { status: "all" }, g).layout[0].props.items;
  const rotas = buildFacet("seams", { status: "broken" }, g).layout[0].props.items;
  assert.equal(todas.length, g.seams.length);
  assert.ok(rotas.length < todas.length);
  assert.ok(rotas.every((i) => i.tag === "broken"));
});

test("panorama agrupa por proyecto, severidad y tipo", () => {
  for (const group of ["project", "severity", "type"]) {
    const b = buildFacet("panorama", { group }, g);
    const matrix = b.layout.find((x) => x.type === "matrix");
    assert.ok(matrix.props.rows.length >= 3, `grupo ${group} sin filas`);
    assert.ok(matrix.props.columns.length >= 3, `grupo ${group} sin columnas`);
  }
});

test("el proceso respeta el formato pedido", () => {
  const steps = buildFacet("process", { mode: "steps" }, g);
  assert.equal(steps.layout[0].type, "stepper");
  const diag = buildFacet("process", { mode: "diagram" }, g);
  assert.equal(diag.layout[0].type, "flowanim");
});

test("la vista de faceta pone los controles primero", () => {
  const spec = facetSpec("risks", { project: "todos", sev: "all" }, g);
  assert.equal(spec.layout[0].type, "controls");
  assert.equal(spec.layout[0].props.facet, "risks");
  assert.equal(spec.verification.status, "deterministic");
});

test("un parámetro inválido cae al default, no rompe", () => {
  const spec = facetSpec("risks", { project: "<script>", sev: "inventado" }, g);
  const controls = spec.layout[0].props;
  assert.ok(["todos", "landing", "comercial", "gerencial"].includes(controls.params.project));
  assert.ok(["all", "high", "critical"].includes(controls.params.sev));
});

test("los controles declarados coinciden con los parámetros", () => {
  for (const facet of ["risks", "seams", "panorama", "process"]) {
    const controls = controlsFor(facet, g);
    assert.ok(controls.length > 0, `${facet} sin controles`);
    for (const c of controls) {
      const spec = facetSpec(facet, {}, g);
      assert.ok(c.options.some((o) => o.value === spec.layout[0].props.params[c.id]), `${facet}.${c.id} fuera de opciones`);
    }
  }
});

test("toda la data mostrada sale del grafo", () => {
  const spec = facetSpec("risks", { project: "todos", sev: "all" }, g);
  const items = spec.layout.find((b) => b.type === "list").props.items;
  const claims = new Set(g.projects.flatMap((p) => p.findings.map((f) => f.claim)));
  for (const i of items) assert.ok(claims.has(i.title), `afirmación inventada: ${i.title.slice(0, 40)}`);
});
