import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localSpec } from "../models.mjs";
import { sanitizeLayout } from "../public/components/registry.mjs";

const g = JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8"));

test("el router determinista arma el stepper del proceso", () => {
  for (const q of ["mostrame el proceso paso a paso", "que pasa cuando el comercial da enter", "como funciona el proceso"]) {
    const spec = localSpec(q, g);
    const blocks = sanitizeLayout(spec.layout);
    const stepper = blocks.find((b) => b.type === "stepper");
    assert.ok(stepper, `sin stepper para "${q}"`);
    assert.equal(stepper.props.steps.length, g.process.steps.length);
    assert.ok(blocks.some((b) => b.type === "callout"), "falta el callout del punto de quiebre");
  }
});

test("el stepper del router conserva los estados del grafo", () => {
  const steps = sanitizeLayout(localSpec("proceso de cotizacion paso a paso", g).layout).find(
    (b) => b.type === "stepper"
  ).props.steps;
  const fails = steps.filter((s) => s.status === "fail").length;
  const blocked = steps.filter((s) => s.status === "blocked").length;
  assert.ok(fails >= 3, `se esperaban al menos 3 fallas, hay ${fails}`);
  assert.ok(blocked >= 2, `se esperaban al menos 2 bloqueos, hay ${blocked}`);
});

test("el proceso no secuestra preguntas de conexión ni de riesgo", () => {
  const flow = localSpec("como se conectan la landing y el comercial", g);
  assert.equal(flow.view, "flow");
  assert.ok(!flow.layout, "no debería componer stepper");

  const risks = localSpec("que riesgos corro en el comercial", g);
  assert.equal(risks.view, "risks");
});

test("sin sección process el router no inventa un stepper", () => {
  const bare = { ...g, process: undefined };
  const spec = localSpec("mostrame el proceso paso a paso", bare);
  assert.ok(!spec.layout, "no debe inventar pasos");
});

test("el router arma un flowanim cuando piden un diagrama", () => {
  const spec = localSpec("hazme un diagrama del proceso de cotizacion", g);
  const blocks = sanitizeLayout(spec.layout);
  const flow = blocks.find((b) => b.type === "flowanim");
  assert.ok(flow, "sin flowanim");
  assert.equal(flow.props.nodes.length, g.process.steps.length);
  assert.ok(flow.props.edges.some((e) => e.status === "broken"), "sin corte marcado");
});

test("el diagrama no secuestra la pregunta de pasos", () => {
  const spec = localSpec("mostrame el proceso paso a paso", g);
  const blocks = sanitizeLayout(spec.layout);
  assert.equal(blocks[0].type, "stepper");
});
