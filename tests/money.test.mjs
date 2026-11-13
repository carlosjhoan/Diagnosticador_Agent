import test from "node:test";
import assert from "node:assert/strict";
import { copFromUsd, fmtCop, fmtMoney, fxLabel } from "../public/money.mjs";

test("convierte USD a COP con la tasa", () => {
  assert.ok(Math.abs(copFromUsd(0.00101, 3297.07) - 3.3300407) < 1e-6);
});

test("una tasa inválida no produce NaN", () => {
  assert.equal(copFromUsd(0.001, null), 0);
  assert.equal(copFromUsd(null, 3200), 0);
});

test("formatea pesos con separadores colombianos", () => {
  assert.equal(fmtCop(3.3), "$3,30 COP");
  assert.equal(fmtCop(1234.5), "$1.234,50 COP");
  assert.equal(fmtCop(0), "$0 COP");
});

test("montos diminutos llevan dos decimales", () => {
  assert.equal(fmtCop(0.04), "$0,04 COP");
});

test("fmtMoney respeta la moneda pedida", () => {
  assert.equal(fmtMoney(0.00101, 3297.07, "USD"), "$0.0010");
  assert.equal(fmtMoney(0.00101, 3297.07, "COP"), "$3,33 COP");
});

test("la etiqueta de tasa nombra la fuente y la fecha", () => {
  const label = fxLabel({ usdToCop: 3297.07, source: "TRM oficial", date: "2026-11-11" });
  assert.match(label, /TRM/);
  assert.match(label, /3\.297,07/);
  assert.match(label, /2026-11-11/);
  assert.match(label, /TRM oficial/);
});

test("sin tasa no hay etiqueta", () => {
  assert.equal(fxLabel(null), "");
  assert.equal(fxLabel({}), "");
});

import { fmtUsd } from "../public/money.mjs";

test("el dólar también lleva unidad", () => {
  assert.equal(fmtUsd(0.00101), "$0.0010 USD");
  assert.equal(fmtUsd(0), "$0 USD");
  assert.equal(fmtUsd(null), "$0 USD");
});
