import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const g = JSON.parse(readFileSync(new URL("./public/data/graph.json", import.meta.url), "utf8"));

const ids = new Set();
const sevOk = new Set(["critical", "high", "medium"]);
const typeOk = new Set(["gap", "risk", "debt"]);
const projIds = new Set(g.projects.map((p) => p.id));

assert.equal(projIds.size, 3, "deben ser 3 proyectos");

for (const p of g.projects) {
  assert.ok(p.id && p.name && p.status, `proyecto ${p.id} incompleto`);
  assert.ok(Array.isArray(p.expected) && p.expected.length, `${p.id} sin expected`);
  assert.ok(Array.isArray(p.delivered) && p.delivered.length, `${p.id} sin delivered`);
  assert.ok(Array.isArray(p.findings) && p.findings.length, `${p.id} sin findings`);

  for (const f of p.findings) {
    assert.ok(f.id && !ids.has(f.id), `id duplicado o vacío: ${f.id}`);
    ids.add(f.id);
    assert.ok(sevOk.has(f.sev), `${f.id} severidad inválida: ${f.sev}`);
    assert.ok(typeOk.has(f.type), `${f.id} tipo inválido: ${f.type}`);
    assert.ok(f.claim && f.claim.length > 20, `${f.id} claim muy corto`);
    assert.ok(f.evidence, `${f.id} sin evidencia`);
  }
}

for (const s of g.seams) {
  assert.ok(projIds.has(s.from) && projIds.has(s.to), `costura ${s.id} apunta a proyecto inexistente`);
  assert.ok(["broken", "partial", "missing", "fragmented", "ok"].includes(s.status), `costura ${s.id} estado inválido`);
  assert.ok(s.impact, `costura ${s.id} sin impacto`);
}

if (g.process) {
  assert.ok(g.process.name && g.process.summary, "proceso sin nombre o resumen");
  assert.ok(Array.isArray(g.process.steps) && g.process.steps.length >= 5, "proceso con pocos pasos");
  const stepStates = new Set(["ok", "warn", "run", "fail", "blocked", "skip"]);
  for (const st of g.process.steps) {
    assert.ok(st.label && st.detail, `paso ${st.n} incompleto`);
    assert.ok(stepStates.has(st.status), `paso ${st.n} estado inválido: ${st.status}`);
    if (st.finding) assert.ok(ids.has(st.finding), `paso ${st.n} apunta a hallazgo inexistente: ${st.finding}`);
  }
}

console.log(`ok: ${g.projects.length} proyectos, ${ids.size} hallazgos, ${g.seams.length} costuras` + (g.process ? `, ${g.process.steps.length} pasos` : ""));
