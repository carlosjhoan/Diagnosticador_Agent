import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePrecotizador, precotizadorSpec } from "../precotizador.mjs";
import { detectFacet, facetSpec } from "../facets.mjs";

const RAW = JSON.parse(readFileSync(new URL("../public/data/cotizador.json", import.meta.url), "utf8"));
const PC = normalizePrecotizador(RAW);

const GRAPH = {
  meta: { title: "Diagnóstico" },
  projects: [
    { id: "landing", name: "Landing", role: "entrada" },
    { id: "comercial", name: "Comercial", role: "cotización" },
  ],
  seams: [],
  precotizador: PC,
};

test("normaliza las cuatro etapas con sus nodos", () => {
  assert.equal(PC.stages.length, 4);
  const total = PC.stages.reduce((a, s) => a + s.nodes.length, 0);
  assert.equal(total, RAW.nodes.length);
});

test("cada nodo conoce el título de su etapa y su tono", () => {
  const n = PC.nodes.find((x) => x.id === "N02");
  assert.equal(n.stageTitle, "Captura");
  assert.equal(n.tone, "ok");
  assert.equal(PC.nodes.find((x) => x.id === "N07b").tone, "critical");
});

test("el recorrido arranca en el cliente y termina en el rango", () => {
  const spec = precotizadorSpec(PC, { mode: "flow" });
  const flow = spec.layout.find((b) => b.type === "flow");
  assert.ok(flow);
  assert.equal(flow.props.steps.length, PC.flow.length);
  assert.match(flow.props.steps[0].label, /cliente llega/i);
  assert.match(flow.props.steps.at(-1).label, /rango/i);
});

test("el recorrido muestra los cortes del diagnóstico", () => {
  const spec = precotizadorSpec(PC, { mode: "flow" });
  const list = spec.layout.filter((b) => b.type === "list").at(-1);
  assert.ok(list.props.items.some((i) => i.title === "N07a → N09"));
});

test("la vista por etapa agrupa en un bloque por etapa", () => {
  const spec = precotizadorSpec(PC, { mode: "stages" });
  const lists = spec.layout.filter((b) => b.type === "list");
  assert.equal(lists.length, PC.stages.length);
});

test("la vista por etapa filtra a una sola", () => {
  const spec = precotizadorSpec(PC, { mode: "stages", stage: "captura" });
  assert.equal(spec.layout.filter((b) => b.type === "list").length, 1);
  assert.match(spec.title, /Captura/);
});

test("los hallazgos se ordenan por severidad visible", () => {
  const spec = precotizadorSpec(PC, { mode: "findings" });
  const kpi = spec.layout.find((b) => b.type === "kpi-row");
  assert.ok(kpi.props.items.some((i) => i.label === "P0 bloquean"));
  const list = spec.layout.find((b) => b.type === "list");
  assert.equal(list.props.items.length, PC.findings.length);
});

test("sin fuente devuelve null en vez de romper", () => {
  assert.equal(precotizadorSpec(null, {}), null);
  assert.equal(normalizePrecotizador(null), null);
});

test("el chat detecta el pre-cotizador sin pasar por el modelo", () => {
  for (const q of [
    "¿cómo funciona el pre-cotizador?",
    "mostrame las 37 preguntas del cuestionario",
    "explicame el flujo del cotizador",
  ]) {
    assert.equal(detectFacet(q, GRAPH).facet, "precotizador", q);
  }
});

test("las preguntas de riesgo siguen yendo a la faceta de riesgos", () => {
  assert.equal(detectFacet("¿qué riesgos corro en el Comercial?", GRAPH).facet, "risks");
});

test("la facet spec conserva los controles al frente", () => {
  const spec = facetSpec("precotizador", { mode: "flow" }, GRAPH);
  assert.equal(spec.layout[0].type, "controls");
  assert.ok(spec.layout.length > 1);
  assert.equal(spec.verification.status, "deterministic");
});
