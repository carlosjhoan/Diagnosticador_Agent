import test from "node:test";
import assert from "node:assert/strict";
import { traceRowHtml, traceRowClass, traceDetail, esc, fmtMs } from "../public/trace-labels.mjs";

const ev = (type, data = {}, t = 1200) => ({ v: 1, seq: 1, t, type, data });

test("fmtMs formatea segundos y milisegundos", () => {
  assert.equal(fmtMs(320), "320ms");
  assert.equal(fmtMs(1843), "1.8s");
});

test("los chips de intención marcan dentro y fuera de alcance", () => {
  const html = traceRowHtml(
    ev("scope.resolved", {
      original: 0.96,
      intents: [
        { texto: "¿Qué falta en el brain?", inScope: true },
        { texto: "¿Cuánto cuesta una ventana?", inScope: false },
      ],
    })
  );
  assert.match(html, /class="intent in"/);
  assert.match(html, /class="intent out"/);
  assert.match(html, /Qué falta en el brain/);
  assert.match(html, /Cuánto cuesta una ventana/);
});

test("el detalle de alcance muestra el original y el conteo", () => {
  const d = traceDetail(ev("scope.resolved", { original: 0.96, intents: [{}, {}] }));
  assert.match(d, /0\.96/);
  assert.match(d, /2 intención/);
});

test("las intenciones se escapan", () => {
  const html = traceRowHtml(
    ev("scope.resolved", { original: 0.9, intents: [{ texto: "<img src=x onerror=alert(1)>", inScope: true }] })
  );
  assert.ok(!html.includes("<img"), "HTML sin escapar");
  assert.match(html, /&lt;img/);
});

test("auditoría lista los tres scores", () => {
  const d = traceDetail(ev("audit.done", { status: "ok", scores: { respaldada: 0.92, responde: 0.82, severidad: 0.97 } }));
  assert.match(d, /respaldada 0\.92/);
  assert.match(d, /responde 0\.82/);
  assert.match(d, /severidad 0\.97/);
});

test("una vista degradada lo dice en el detalle", () => {
  const d = traceDetail(ev("compose.done", { view: "map", title: "Panorama", degraded: true }));
  assert.match(d, /respaldo/);
});

test("la clase de fila refleja el estado del evento", () => {
  assert.equal(traceRowClass(ev("guard.noise")), "trace-row warn");
  assert.equal(traceRowClass(ev("stage.failed")), "trace-row failed");
  assert.equal(traceRowClass(ev("compose.done")), "trace-row done");
});

test("sin datos no se ofrece el toggle de payload", () => {
  const html = traceRowHtml(ev("compose.started", {}));
  assert.ok(!html.includes("trace-more"));
  assert.ok(!html.includes("trace-payload"));
});

test("con datos se incluye el payload oculto y escapado", () => {
  const html = traceRowHtml(ev("compose.done", { view: "risks", title: "<b>x</b>" }));
  assert.match(html, /trace-more/);
  assert.match(html, /trace-payload" hidden/);
  assert.match(html, /&lt;b&gt;/);
});

test("esc cubre los cinco caracteres", () => {
  assert.equal(esc(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});
