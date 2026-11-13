// Verifica el contrato SSE contra un servidor real.
// Uso: node server.mjs   (en otra terminal)   →   node scripts/smoke-sse.mjs

import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://localhost:4399";
const QUESTION = process.argv[3] || "que riesgos corro en el comercial";

function parseFrame(raw) {
  let event = "message";
  const data = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return { event, data: data.join("\n") };
}

async function readStream(question) {
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/event-stream/);

  const events = [];
  let result = null;
  let error = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const t0 = Date.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) !== -1) {
      const f = parseFrame(buf.slice(0, cut));
      buf = buf.slice(cut + 2);
      if (!f.data) continue;
      const p = JSON.parse(f.data);
      if (f.event === "result") result = p.spec;
      else if (f.event === "error") error = p.message;
      else events.push({ ...p, arr: Date.now() - t0 });
    }
  }
  return { events, result, error };
}

const t0 = Date.now();
const { events, result, error } = await readStream(QUESTION);
const ms = Date.now() - t0;

assert.equal(error, null, `el stream devolvió error: ${error}`);
assert.ok(events.length >= 6, `sólo ${events.length} eventos`);
assert.equal(events[0].type, "run.started");
assert.equal(events.at(-1).type, "run.finished");

const seqs = events.map((e) => e.seq);
assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b), "seq fuera de orden");
assert.equal(new Set(seqs).size, seqs.length, "seq duplicado");
for (const e of events) {
  assert.equal(e.v, 1);
  assert.equal(typeof e.t, "number");
  assert.ok(e.t >= 0);
}

assert.ok(result, "sin frame de resultado");
assert.ok(["map", "flow", "scope", "gaps", "risks", "compare", "evidence", "out_of_scope"].includes(result.view));

const json = await fetch(`${BASE}/api/ask?mode=json`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ question: QUESTION }),
}).then((r) => r.json());
assert.equal(json.view, result.view, "modo json y SSE discrepan en la vista");

console.log(`ok · ${events.length} eventos · ${ms}ms · view=${result.view}`);
console.log("   " + events.map((e) => `${e.type}@${e.arr}ms`).join(" → "));

// Anti-buffering: el primer evento tiene que llegar bastante antes del cierre.
if (ms > 2000) {
  assert.ok(
    events[0].arr <= ms - 1000,
    `posible buffering: primer evento a ${events[0].arr}ms de ${ms}ms totales`
  );
  console.log(`   primer evento a ${events[0].arr}ms (total ${ms}ms) — stream incremental ok`);
}
