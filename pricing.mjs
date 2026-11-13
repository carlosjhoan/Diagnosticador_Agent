// Precios por millón de tokens. Defaults verificados 2026-11-11.
// Sobreescribibles por env si cambian sin tocar código.

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const RATES = () => ({
  deepseek: {
    cacheHit: num(process.env.PRICE_DS_CACHE_HIT, 0.003),
    cacheMiss: num(process.env.PRICE_DS_CACHE_MISS, 0.15),
    output: num(process.env.PRICE_DS_OUTPUT, 0.6),
  },
  jev: {
    input: num(process.env.PRICE_JEV_INPUT, 0.042),
    output: 0,
  },
});

const M = 1_000_000;

export function deepseekCost(usage) {
  if (!usage) return 0;
  const r = RATES().deepseek;
  const hit = num(usage.prompt_cache_hit_tokens, 0);
  const total = num(usage.prompt_tokens, 0);
  const miss = usage.prompt_cache_miss_tokens != null ? num(usage.prompt_cache_miss_tokens, 0) : Math.max(0, total - hit);
  return (hit * r.cacheHit + miss * r.cacheMiss + num(usage.completion_tokens, 0) * r.output) / M;
}

export function jevCost(usage) {
  if (!usage) return 0;
  return (num(usage.input_tokens, 0) * RATES().jev.input) / M;
}

export function deepseekTokens(usage) {
  if (!usage) return 0;
  return num(usage.prompt_tokens, 0) + num(usage.completion_tokens, 0);
}

export function jevTokens(usage) {
  if (!usage) return 0;
  return num(usage.input_tokens, 0) + num(usage.output_tokens, 0);
}

/** Costo legible: 4 decimales, con piso de "<$0.0001". */
export function fmtCost(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  return "$" + v.toFixed(4);
}

export function fmtTokens(n) {
  const v = Number(n) || 0;
  return v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v);
}
