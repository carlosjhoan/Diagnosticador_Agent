import test from "node:test";
import assert from "node:assert/strict";
import { loadCache, lookupCache } from "../cache.mjs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./golden-v2", import.meta.url));

test("carga los goldens como cache", async () => {
  const entries = await loadCache(DIR);
  assert.ok(entries.length >= 10, `sólo ${entries.length} entradas`);
  assert.ok(entries.every((e) => e.question && e.response));
});

test("un directorio inexistente no rompe", async () => {
  assert.deepEqual(await loadCache("/ruta/que/no/existe"), []);
});

test("match exacto devuelve la respuesta", async () => {
  const entries = await loadCache(DIR);
  const hit = lookupCache(entries, entries[0].question);
  assert.ok(hit);
  assert.equal(hit.view, entries[0].response.view);
});

test("match por parecido tolera tildes y mayúsculas", async () => {
  const entries = [{ question: "¿Qué riesgos corro en el Comercial?", response: { view: "map", ok: 1 } }];
  assert.ok(lookupCache(entries, "que riesgos corro en el comercial"));
});

test("una pregunta distinta no devuelve nada", async () => {
  const entries = [{ question: "¿Qué riesgos corro en el Comercial?", response: { view: "map" } }];
  assert.equal(lookupCache(entries, "cuanto cuesta un kilo de pan"), null);
});

test("cache vacío o inválido devuelve null", () => {
  assert.equal(lookupCache([], "hola"), null);
  assert.equal(lookupCache(null, "hola"), null);
  assert.equal(lookupCache([{ question: "", response: {} }], ""), null);
});
