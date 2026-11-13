import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyStore,
  loadStore,
  saveStore,
  clearStore,
  currentSession,
  addSession,
  newSessionRecord,
  makeTurn,
  trimEvents,
  sessionTotals,
  titleFrom,
} from "../public/session.mjs";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("sin storage devuelve un store con una sesión vacía", () => {
  delete globalThis.localStorage;
  const s = loadStore();
  assert.equal(s.sessions.length, 1);
  assert.equal(currentSession(s).turns.length, 0);
});

test("guarda y recupera varias sesiones", () => {
  globalThis.localStorage = fakeStorage();
  const store = emptyStore();
  const otra = newSessionRecord("segunda");
  otra.turns.push(makeTurn("hola"));
  addSession(store, otra);
  saveStore(store);

  const back = loadStore();
  assert.equal(back.sessions.length, 2);
  assert.equal(currentSession(back).title, "segunda");
});

test("un JSON roto no rompe el arranque", () => {
  const ls = fakeStorage();
  ls.setItem("sng.diagnostico.store.v2", "{no es json");
  globalThis.localStorage = ls;
  assert.equal(loadStore().sessions.length, 1);
});

test("migra la sesión única de la versión anterior", () => {
  const ls = fakeStorage();
  ls.setItem(
    "sng.diagnostico.session.v1",
    JSON.stringify({
      v: 1,
      id: "s_viejo",
      createdAt: "2026-11-10T10:00:00.000Z",
      turns: [{ id: "t1", at: "2026-11-10T10:00:00.000Z", pregunta: "¿qué riesgos corro?", spec: { title: "x" } }],
    })
  );
  globalThis.localStorage = ls;

  const store = loadStore();
  assert.equal(store.sessions.length, 1);
  const s = currentSession(store);
  assert.equal(s.turns.length, 1);
  assert.match(s.title, /qué riesgos corro/i);
});

test("clear borra todo", () => {
  const ls = fakeStorage();
  globalThis.localStorage = ls;
  saveStore(emptyStore());
  clearStore();
  assert.equal(loadStore().sessions.length, 1);
});

test("el título sale de la primera consulta y se recorta", () => {
  assert.equal(titleFrom("¿Qué riesgos corro en el Comercial?"), "Qué riesgos corro en el Comercial");
  assert.equal(titleFrom("  hola   mundo  "), "Hola mundo");
  assert.equal(titleFrom(""), "Nueva conversación");
  assert.equal(titleFrom("   "), "Nueva conversación");

  const largo = titleFrom("Qué pasa si el corpus tuviera quinientas cotizaciones históricas cargadas y además el Gerencial Brain no recibe el consolidado del Comercial durante tres meses seguidos");
  assert.ok(largo.length <= 91, `quedó en ${largo.length}`);
  assert.ok(largo.endsWith("…"));
});

test("cada turno conserva id único", () => {
  const a = makeTurn("uno");
  const b = makeTurn("dos");
  assert.notEqual(a.id, b.id);
  assert.deepEqual(a.etapas, []);
});

test("trimEvents recorta el stream", () => {
  const out = trimEvents([{ v: 1, seq: 1, t: 10, type: "run.started", data: { q: "x" } }]);
  assert.equal(out[0].seq, undefined);
  assert.equal(out[0].type, "run.started");
});

test("suma cada turno con su propia tasa", () => {
  const turns = [
    { costo: 0.001, fx: { usdToCop: 3300 }, uso: { deepseek: { cost: 0.001, tokens: 10, calls: 1, model: "d" } } },
    { costo: 0.002, fx: { usdToCop: 3400 }, uso: { deepseek: { cost: 0.002, tokens: 20, calls: 1, model: "d" } } },
  ];
  const t = sessionTotals(turns);
  assert.ok(Math.abs(t.usd - 0.003) < 1e-9);
  assert.ok(Math.abs(t.cop - (0.001 * 3300 + 0.002 * 3400)) < 1e-6);
  assert.equal(t.by.deepseek.calls, 2);
});

test("turnos sin tasa usan la tasa de respaldo", () => {
  const t = sessionTotals([{ costo: 0.001, uso: {} }, { costo: 0.002, fx: { usdToCop: 3300 }, uso: {} }], 3300);
  assert.ok(Math.abs(t.usd - 0.003) < 1e-9);
  assert.ok(Math.abs(t.cop - 9.9) < 1e-6);
});

test("ignora turnos sin costo", () => {
  const t = sessionTotals([{ pregunta: "sin respuesta" }, { costo: 0.001, fx: { usdToCop: 3000 } }]);
  assert.equal(t.priced, 1);
  assert.equal(t.turns, 2);
});

test("una sesión nace sin archivar y sobrevive el round-trip", () => {
  globalThis.localStorage = fakeStorage();
  const store = emptyStore();
  const rec = newSessionRecord("archivable");
  assert.equal(rec.archived, false);

  rec.archived = true;
  addSession(store, rec);
  saveStore(store);

  const back = loadStore();
  const found = back.sessions.find((s) => s.id === rec.id);
  assert.equal(found.archived, true);
});

test("archivar no toca las demás ni el contenido", () => {
  globalThis.localStorage = fakeStorage();
  const store = emptyStore();
  const a = newSessionRecord("uno");
  const b = newSessionRecord("dos");
  a.turns.push(makeTurn("pregunta"));
  addSession(store, a);
  addSession(store, b);

  a.archived = true;
  saveStore(store);

  const back = loadStore();
  assert.equal(back.sessions.filter((s) => s.archived).length, 1);
  assert.equal(back.sessions.find((s) => s.id === a.id).turns.length, 1);
  assert.equal(back.sessions.find((s) => s.id === b.id).archived, false);
});

test("un título largo se recorta en una sola fila", () => {
  const largo = "Qué riesgos corro si el Gerencial Brain no recibe el consolidado del Comercial a tiempo";
  const t = titleFrom(largo);
  assert.ok(t.length <= 91, `título demasiado largo: ${t.length} "${t}"`);
  assert.ok(!t.endsWith(" "), "no debe terminar en espacio");
});
