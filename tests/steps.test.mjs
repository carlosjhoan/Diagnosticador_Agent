import test from "node:test";
import assert from "node:assert/strict";
import { buildSteps, applyEvent, replay, summary, detailFor } from "../public/steps.mjs";

const ev = (type, t, data = {}) => ({ v: 1, t, type, data });

test("arranca con la primera etapa corriendo y el resto pendiente", () => {
  const steps = buildSteps();
  assert.equal(steps.length, 5);
  assert.equal(steps[0].state, "pending");
});

test("una consulta completa recorre las etapas y converge", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("interpret.done", 1200, { intenciones: ["a", "b"] }));
  applyEvent(steps, ev("scope.resolved", 1800, { original: 0.97 }));
  applyEvent(steps, ev("decompose.done", 1900, { visible: 3, total: 9 }));
  applyEvent(steps, ev("render.ready", 2000, {}));
  applyEvent(steps, ev("run.finished", 2100, { ms: 2100, cost: 0.0003 }));

  assert.deepEqual(
    steps.map((s) => s.state),
    ["done", "done", "done", "skip", "done"]
  );
  assert.equal(steps[0].detail, "2 intenciones");
  assert.equal(steps[1].detail, "en alcance · 0.97");
  assert.equal(steps[2].detail, "3 de 9");

  const s = summary(steps, { finished: true, ms: 2100 });
  assert.equal(s.text, "Listo! Ya tengo la información necesaria");
  assert.equal(s.state, "done");
});

test("un timeout deja la etapa en aviso, no en error", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("stage.failed", 900, { stage: "compose", reason: "timeout:compose" }));
  const buscar = steps.find((s) => s.id === "buscar");
  assert.equal(buscar.state, "warn");
  assert.match(buscar.detail, /demoró/);

  const s = summary(steps, { finished: true, ms: 900 });
  assert.match(s.text, /usó el respaldo/);
  assert.equal(s.state, "warn");
});

test("un fallo no-timeout se reporta como error", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("stage.failed", 500, { stage: "verify", reason: "Jev 500" }));
  assert.equal(steps.find((s) => s.id === "auditar").state, "fail");
});

test("un reintento se ve como advertencia mientras corre", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("stage.retry", 400, { stage: "compose", attempt: 1 }));
  const buscar = steps.find((s) => s.id === "buscar");
  assert.equal(buscar.state, "warn");
  assert.equal(buscar.detail, "reintentando 1");
});

test("el ruido corta todo después de interpretar", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("guard.noise", 5, {}));
  assert.equal(steps[0].state, "done");
  assert.ok(steps.slice(1).every((s) => s.state === "skip"));
});

test("replay reconstruye el recorrido desde los eventos guardados", () => {
  const steps = replay([
    ev("interpret.done", 900, { intenciones: ["x"] }),
    ev("scope.resolved", 1400, { original: 0.91 }),
    ev("run.finished", 1500, { ms: 1500 }),
  ]);
  assert.equal(steps[0].state, "done");
  assert.equal(steps[1].state, "done");
  assert.equal(steps[2].state, "skip");
  assert.equal(steps[4].state, "skip");
});

test("el resumen en curso nombra la etapa actual", () => {
  const steps = buildSteps();
  applyEvent(steps, ev("interpret.done", 900, { intenciones: ["x"] }));
  const s = summary(steps, { finished: false });
  assert.match(s.text, /Verificando si está en el diagnóstico/);
  assert.equal(s.state, "running");
});

test("detailFor no inventa datos", () => {
  assert.equal(detailFor(ev("audit.done", 0, { status: "ok" })), "aprobada");
  assert.equal(detailFor(ev("audit.done", 0, { status: "rejected" })), "con observaciones");
  assert.equal(detailFor(ev("render.ready", 0, {})), "");
});
