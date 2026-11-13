const STOP = new Set(
  "que como para porque cuando donde sobre entre hasta desde este esta esto estos estas hay muy mas pero sino tambien solo todo toda todos todas hace hacer tienes tiene puedo podria cuesta cuanto cuantos cual cuales quien quienes dar dame dime muestra muestrame explica quiero necesito algUNA algun alguna algunos los las del con por una uno unos unas son esta estan ser esta estoy".toLowerCase().split(/\s+/)
);

export function tokens(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function collect(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collect(v, out));
  return out;
}

export function vocabulary(graph) {
  return new Set(collect(graph, []).flatMap(tokens));
}

export function lexicalScope(question, graph) {
  const words = [...new Set(tokens(question))];
  if (!words.length) return { inScope: true, score: 1, matched: 0, total: 0, source: "lexical" };

  const vocab = vocabulary(graph);
  const hits = words.filter((w) => vocab.has(w)).length;
  const score = hits / words.length;
  return { inScope: score >= 0.25, score, matched: hits, total: words.length, source: "lexical" };
}

const SENSE_WORDS =
  /\b(que|como|cual|cuanto|cuanta|cuantos|quien|donde|cuando|por|para|hay|es|son|esta|estan|tengo|tiene|puedo|puede|dame|muestra|muestrame|explica|dime|quiero|necesito|riesgo|riesgos|falta|faltan|brecha|brechas|proyecto|proyectos|landing|comercial|gerencial|brain|sistema|datos|evidencia|conecta|conexion|robustecer|diagnostico|mejorar)\b/;

// Detector determinista de ruido: no cuesta una llamada y no puede "alucinar".
export function looksLikeGarbage(text) {
  const flat = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const letters = flat.replace(/[^a-z]/g, "");

  if (!letters) return true;
  if (letters.length < 6) return false;
  if (SENSE_WORDS.test(flat)) return false;

  const vowels = (letters.match(/[aeiou]/g) || []).length;
  const ratio = vowels / letters.length;
  const longestRun = Math.max(...letters.split(/[aeiou]+/).map((s) => s.length));

  return ratio < 0.25 && longestRun >= 5;
}

