import test from "node:test";
import assert from "node:assert/strict";
import { deepseekCost, jevCost, deepseekTokens, jevTokens, RATES } from "../pricing.mjs";
import { fmtCost, fmtTokens } from "../public/trace-labels.mjs";

test("costo de DeepSeek con cache miss y output", () => {
  const usage = {
    prompt_tokens: 8000,
    completion_tokens: 1000,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 8000,
  };
  // 8000 * 0.15/M + 1000 * 0.60/M
  assert.ok(Math.abs(deepseekCost(usage) - 0.0018) < 1e-9);
});

test("el cache hit cuesta 50 veces menos", () => {
  const miss = { prompt_tokens: 10000, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10000 };
  const hit = { prompt_tokens: 10000, completion_tokens: 0, prompt_cache_hit_tokens: 10000, prompt_cache_miss_tokens: 0 };
  assert.ok(deepseekCost(hit) < deepseekCost(miss) / 40);
});

test("sin usage el costo es cero", () => {
  assert.equal(deepseekCost(null), 0);
  assert.equal(jevCost(undefined), 0);
  assert.equal(deepseekTokens(null), 0);
});

test("costo de Jev", () => {
  // 3500 * 0.042/M
  assert.ok(Math.abs(jevCost({ input_tokens: 3500, output_tokens: 60 }) - 0.000147) < 1e-9);
});

test("tokens suman entrada y salida", () => {
  assert.equal(deepseekTokens({ prompt_tokens: 100, completion_tokens: 20 }), 120);
  assert.equal(jevTokens({ input_tokens: 100, output_tokens: 20 }), 120);
});

test("las tarifas son configurables", () => {
  const prev = process.env.PRICE_DS_OUTPUT;
  process.env.PRICE_DS_OUTPUT = "10";
  assert.equal(RATES().deepseek.output, 10);
  if (prev === undefined) delete process.env.PRICE_DS_OUTPUT;
  else process.env.PRICE_DS_OUTPUT = prev;
});

test("formato de costo y tokens", () => {
  assert.equal(fmtCost(0), "$0");
  assert.equal(fmtCost(0.0018), "$0.0018");
  assert.equal(fmtCost(0.00001), "<$0.0001");
  assert.equal(fmtTokens(12400), "12.4k");
  assert.equal(fmtTokens(120), "120");
});
