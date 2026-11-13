// Reparto del costo por proveedor. Puro: sin DOM.

export const PROVIDERS = [
  { key: "deepseek", name: "DeepSeek", mark: "D", color: "#5786fe", logo: "/brand/deepseek.svg" },
  { key: "jev", name: "Jev", mark: "J", color: "#3b3f38", logo: "/brand/typesafe.png" },
];

export function usageShares(uso) {
  if (!uso) return [];
  const rows = PROVIDERS.filter((p) => uso[p.key] && uso[p.key].calls > 0).map((p) => ({
    key: p.key,
    name: p.name,
    mark: p.mark,
    color: p.color,
    logo: p.logo,
    model: uso[p.key].model || p.name,
    cost: Number(uso[p.key].cost) || 0,
    tokens: Number(uso[p.key].tokens) || 0,
    calls: Number(uso[p.key].calls) || 0,
  }));

  const total = rows.reduce((acc, r) => acc + r.cost, 0);
  return rows
    .map((r) => ({ ...r, pct: total > 0 ? (r.cost / total) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);
}
