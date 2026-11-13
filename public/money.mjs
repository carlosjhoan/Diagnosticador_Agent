// Conversión y formato de moneda. Puro: sin DOM, sin red.

export function copFromUsd(usd, rate) {
  const u = Number(usd);
  const r = Number(rate);
  if (!Number.isFinite(u) || !Number.isFinite(r)) return 0;
  return u * r;
}

export function fmtCop(value) {
  const v = Number(value) || 0;
  if (v <= 0) return "$0 COP";
  const decimals = 2;
  const n = v.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return "$" + n + " COP";
}

export function fmtMoney(usd, rate, currency = "COP") {
  if (currency === "USD") {
    const v = Number(usd) || 0;
    if (v <= 0) return "$0";
    return "$" + v.toFixed(4);
  }
  return fmtCop(copFromUsd(usd, rate));
}

export function fxLabel(fx) {
  if (!fx || !fx.usdToCop) return "";
  const rate = Number(fx.usdToCop).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const when = fx.date ? " · " + fx.date : "";
  return `TRM $${rate}${when} · ${fx.source || ""}`.trim();
}

export function fmtUsd(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return "$0 USD";
  return "$" + v.toFixed(4) + " USD";
}
