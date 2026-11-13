import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const DIR_V1 = join(ROOT, "golden");
const DIR_V2 = join(ROOT, "golden-v2");
const VIEWS = ["map", "flow", "scope", "gaps", "risks", "compare", "evidence", "out_of_scope"];

async function readDir(dir) {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    return Promise.all(files.map(async (f) => ({ file: f, rec: JSON.parse(await readFile(join(dir, f), "utf8")) })));
  } catch {
    return [];
  }
}

const refs = [...(await readDir(DIR_V1)), ...(await readDir(DIR_V2))];

test("hay al menos 10 referencias capturadas", () => {
  assert.ok(refs.length >= 10, `sólo hay ${refs.length}`);
});

for (const { file, rec } of refs) {
  test(`contrato: ${file}`, () => {
    assert.equal(typeof rec.question, "string");
    assert.ok(rec.question.length > 0);

    const r = rec.response;
    assert.ok(r && typeof r === "object", "sin response");
    assert.ok(VIEWS.includes(r.view), `view inválida: ${r.view}`);
    assert.equal(typeof r.title, "string");
    assert.equal(typeof r.story, "string");

    if (r.view === "out_of_scope") {
      assert.ok(["garbage", "out_of_scope", "unanswered"].includes(r.reason), `reason inválida: ${r.reason}`);
      assert.ok(Array.isArray(r.scope?.projects) && r.scope.projects.length === 3);
    } else {
      assert.ok(Array.isArray(r.intents) || r.view === "map", "vista compuesta sin intents");
    }

    if (r.layout !== undefined) {
      assert.ok(Array.isArray(r.layout), "layout no es array");
      assert.ok(r.layout.length > 0 && r.layout.length <= 12, `layout con ${r.layout.length} bloques`);
      for (const b of r.layout) {
        assert.equal(typeof b.type, "string");
        assert.ok(b.props && typeof b.props === "object", "bloque sin props");
      }
    }

    if (r.verification) {
      assert.ok(["ok", "rejected", "unverified"].includes(r.verification.status));
      assert.equal(typeof r.verification.scores, "object");
    }
  });
}

test("invariante: el ruido nunca llega a un modelo generativo", async () => {
  const rec = JSON.parse(await readFile(join(DIR_V1, "08-ruido.json"), "utf8"));
  assert.equal(rec.response.view, "out_of_scope");
  assert.equal(rec.response.reason, "garbage");
  assert.ok(rec.ms < 500, `el ruido tardó ${rec.ms}ms: debería cortar sin red`);
});

test("invariante: fuera de alcance no compone", async () => {
  const rec = JSON.parse(await readFile(join(DIR_V1, "09-fuera.json"), "utf8"));
  assert.equal(rec.response.view, "out_of_scope");
  assert.equal(rec.response.reason, "out_of_scope");
});
