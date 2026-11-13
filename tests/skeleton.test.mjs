import test from "node:test";
import assert from "node:assert/strict";
import { skeletonFor, SKELETON_VIEWS } from "../public/skeleton.mjs";

test("toda vista tiene esqueleto", () => {
  for (const view of SKELETON_VIEWS) {
    const html = skeletonFor(view);
    assert.ok(html && html.length > 40, `esqueleto vacío para ${view}`);
    assert.match(html, /sk-/, `sin clases de esqueleto en ${view}`);
  }
});

test("una vista desconocida cae al esqueleto por defecto", () => {
  const html = skeletonFor("inexistente");
  assert.match(html, /sk-block/);
  assert.equal(html, skeletonFor("map"));
});

test("el esqueleto no contiene contenido real", () => {
  for (const view of SKELETON_VIEWS) {
    const html = skeletonFor(view);
    assert.ok(!/<(p|h1|table|ul)\b/.test(html), `${view} filtra contenido real`);
  }
});
