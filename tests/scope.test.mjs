import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lexicalScope, looksLikeGarbage } from "../scope.mjs";

const g = JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8"));

const inside = [
  "que riesgos corro en el comercial",
  "que falta para robustecer el gerencial brain",
  "como se conectan la landing y el comercial",
  "muestrame la evidencia del hallazgo C-P0-1",
  "que deberia recibir el proyecto landing",
];

const outside = [
  "cuanto cuesta un kilo de pan",
  "quien gano el mundial de 1998",
  "cual es la capital de francia",
  "dame el clima de manana en bogota",
  "como hago una torta de chocolate",
];

const garbage = [
  "cvncncggch",
  "asdkjhasd",
  "xzcvbnm",
  "qwrtypsdfg",
  "llllllllll",
  "",
  "   ",
  "!!!???",
];

const notGarbage = [
  "riesgos",
  "comercial",
  "que riesgos hay",
  "sng",
  "cvncncggch comercial",
  "dame el estado del brain",
];

for (const q of inside) {
  const r = lexicalScope(q, g);
  assert.equal(r.inScope, true, `deberia estar EN alcance: "${q}" (score ${r.score.toFixed(2)})`);
}

for (const q of outside) {
  const r = lexicalScope(q, g);
  assert.equal(r.inScope, false, `deberia estar FUERA de alcance: "${q}" (score ${r.score.toFixed(2)})`);
}

for (const q of garbage) {
  assert.equal(looksLikeGarbage(q), true, `deberia ser RUIDO: "${q}"`);
}

for (const q of notGarbage) {
  assert.equal(looksLikeGarbage(q), false, `NO deberia ser ruido: "${q}"`);
}

console.log(
  `ok: ${inside.length} en alcance, ${outside.length} fuera, ${garbage.length} ruido, ${notGarbage.length} no-ruido`
);
