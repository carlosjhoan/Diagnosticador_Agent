// Captura respuestas reales como referencia de regresión.
// Requiere el servidor levantado:  node --watch server.mjs
// Uso: node scripts/capture-golden.mjs [--out tests/golden-v2] [--base http://localhost:4399]

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = flag("--base", "http://localhost:4399");
const OUT = resolve(flag("--out", fileURLToPath(new URL("../tests/golden", import.meta.url))));

export const QUESTIONS = [
  ["01-conexion", "¿Cómo se conectan la Landing y el Comercial?"],
  ["02-riesgos", "¿Qué riesgos corro en el Comercial?"],
  ["03-brechas", "¿Qué falta para robustecer el Gerencial Brain?"],
  ["04-esperado", "¿Qué debería recibir la Landing?"],
  ["05-evidencia", "Dame la evidencia del hallazgo C-P0-1"],
  ["06-erratas", "che q riesgos tengo en el comersial porfa"],
  ["07-proceso", "mostrame el proceso de cotización"],
  ["08-ruido", "cvncncggch"],
  ["09-fuera", "cuanto cuesta un kilo de pan"],
  ["10-mixta", "¿qué falta en el brain y cuánto sale una ventana de aluminio?"],
  ["11-pasos", "mostrame el proceso de cotización paso a paso"],
  ["12-diagrama", "hazme un diagrama del proceso de cotización"],
];

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("health:", JSON.stringify(health));

  await mkdir(OUT, { recursive: true });

  for (const [slug, question] of QUESTIONS) {
    const t0 = Date.now();
    let body;
    try {
      const res = await fetch(`${BASE}/api/ask?mode=json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      body = await res.json();
    } catch (e) {
      console.error(`  x ${slug}: ${e.message}`);
      continue;
    }
    const record = { question, capturedAt: new Date().toISOString(), ms: Date.now() - t0, response: body };
    await writeFile(join(OUT, `${slug}.json`), JSON.stringify(record, null, 2), "utf8");
    console.log(`  ok ${slug}  ${String(record.ms).padStart(6)}ms  ${body.view}${body.reason ? "/" + body.reason : ""}  ${body.verification?.status || "-"}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
