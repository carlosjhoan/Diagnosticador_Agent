import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TRACE_LABEL, TRACE_STATE, STAGE_LABEL } from "../public/trace-labels.mjs";

const pipelineSrc = readFileSync(fileURLToPath(new URL("../pipeline.mjs", import.meta.url)), "utf8");

// Todo `ev("tipo"` del pipeline, sin duplicados
const emitted = [...new Set([...pipelineSrc.matchAll(/\bev\(\s*"([a-z_.]+)"/g)].map((m) => m[1]))];

test("el pipeline emite al menos los eventos del contrato", () => {
  assert.ok(emitted.length >= 8, `sólo ${emitted.length} tipos detectados`);
  for (const required of ["run.started", "interpret.done", "scope.resolved", "compose.done", "audit.done", "render.ready", "run.finished"]) {
    assert.ok(emitted.includes(required), `falta ${required} en el pipeline`);
  }
});

test("cada evento emitido tiene etiqueta de traza", () => {
  const missing = emitted.filter((t) => !TRACE_LABEL[t]);
  assert.deepEqual(missing, [], `sin etiqueta: ${missing.join(", ")}`);
});

test("cada evento emitido tiene etiqueta de etapa para el hint", () => {
  const missing = emitted.filter((t) => !STAGE_LABEL[t]);
  assert.deepEqual(missing, [], `sin etapa: ${missing.join(", ")}`);
});

test("los estados de traza referencian eventos reales", () => {
  for (const type of Object.keys(TRACE_STATE)) {
    assert.ok(emitted.includes(type), `estado definido para un evento inexistente: ${type}`);
  }
});

test("las etiquetas no referencian eventos que el pipeline no emite", () => {
  const extra = Object.keys(TRACE_LABEL).filter((t) => !emitted.includes(t));
  assert.deepEqual(extra, [], `etiquetas huérfanas: ${extra.join(", ")}`);
});
