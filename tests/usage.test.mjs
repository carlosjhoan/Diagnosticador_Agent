import test from "node:test";
import assert from "node:assert/strict";
import { usageShares, PROVIDERS } from "../public/usage.mjs";

const uso = {
  deepseek: { cost: 0.000676404, tokens: 5350, calls: 2, model: "deepseek-flash" },
  jev: { cost: 0.000334362, tokens: 8075, calls: 2, model: "jev-1.14.0" },
};

test("reparte el costo en porcentajes que suman 100", () => {
  const rows = usageShares(uso);
  assert.equal(rows.length, 2);
  const total = rows.reduce((a, r) => a + r.pct, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test("ordena de mayor a menor costo", () => {
  const rows = usageShares(uso);
  assert.equal(rows[0].key, "deepseek");
  assert.ok(rows[0].pct > rows[1].pct);
});

test("usa el modelo real, no el alias", () => {
  const rows = usageShares(uso);
  assert.equal(rows[1].model, "jev-1.14.0");
});

test("ignora proveedores sin llamadas", () => {
  const rows = usageShares({ deepseek: { cost: 0.001, calls: 1, tokens: 10, model: "x" }, jev: { cost: 0, calls: 0 } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pct, 100);
});

test("sin uso devuelve vacío y no divide por cero", () => {
  assert.deepEqual(usageShares(null), []);
  assert.deepEqual(usageShares({}), []);
  const rows = usageShares({ deepseek: { cost: 0, calls: 1, tokens: 0, model: "x" } });
  assert.equal(rows[0].pct, 0);
});

test("expone las marcas de cada proveedor", () => {
  assert.deepEqual(
    PROVIDERS.map((p) => p.mark),
    ["D", "J"]
  );
});
