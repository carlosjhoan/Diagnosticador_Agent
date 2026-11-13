/**
 * Trae los tres diagnósticos avanzados desde las carpetas de cada proyecto
 * y los deja donde la app los sirve.
 *
 * Fuentes:
 *   Landing/Landing/Docs/diagnosticos/diagnostico_landing.json
 *   Comercial/Docs/Diagnosticos/diagnostico_avanzado.json
 *   Gerancial-Brain/Docs/Diagnosticos/diagnostico_gerencial.json
 *
 * Uso: node scripts/sync-data.mjs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUT = resolve(HERE, "../public/data");

const SOURCES = [
  { id: "landing", src: "Landing/Docs/diagnosticos/diagnostico_landing.json", out: "landing.json" },
  { id: "cotizador", src: "Comercial/Docs/Diagnosticos/diagnostico_avanzado.json", out: "cotizador.json" },
  { id: "gerencial", src: "Gerancial-Brain/Docs/Diagnosticos/diagnostico_gerencial.json", out: "gerencial.json" },
];

await mkdir(OUT, { recursive: true });

for (const s of SOURCES) {
  const raw = JSON.parse(await readFile(resolve(ROOT, s.src), "utf8"));

  for (const k of ["stages", "nodes", "findings"]) {
    if (!Array.isArray(raw[k]) || !raw[k].length) throw new Error(`${s.src} sin "${k}"`);
  }

  await writeFile(resolve(OUT, s.out), JSON.stringify(raw, null, 1), "utf8");
  console.log(`${s.id}: ${raw.nodes.length} nodos · ${raw.stages.length} etapas · ${raw.findings.length} hallazgos → data/${s.out}`);
}
