// Cache local de respuestas (modo avión). Lee los goldens capturados.
// Si no hay red, el agente responde con lo último verificado y lo declara.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

export async function loadCache(dir) {
  const files = await readdir(dir).catch(() => []);
  const entries = [];
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    try {
      const rec = JSON.parse(await readFile(join(dir, f), "utf8"));
      if (rec?.question && rec?.response) entries.push({ question: rec.question, response: rec.response });
    } catch {
      /* un archivo roto no invalida el resto */
    }
  }
  return entries;
}

export function lookupCache(entries, question) {
  if (!Array.isArray(entries) || !entries.length) return null;

  const q = String(question).trim().toLowerCase();
  if (!q) return null;

  const exact = entries.find((e) => String(e.question).trim().toLowerCase() === q);
  if (exact) return exact.response;

  const qw = new Set(norm(question));
  if (!qw.size) return null;

  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    const ew = norm(e.question);
    if (!ew.length) continue;
    const hits = ew.filter((w) => qw.has(w)).length;
    const score = hits / Math.max(qw.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore >= 0.8 ? best.response : null;
}
