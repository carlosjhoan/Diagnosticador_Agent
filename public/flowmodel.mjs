// Construye la definición Mermaid de un flujo y la secuencia de reproducción.
// Puro: entrada specs, salida string/objetos. Sin DOM.

const clean = (s, max = 60) =>
  String(s ?? "")
    .replace(/"/g, "#quot;")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .trim()
    .slice(0, max);

/**
 * Arma los "beats" de la reproducción. El primero es el nodo inicial; cada uno
 * siguiente es la arista que entra a un nodo. La secuencia se corta en la
 * primera arista rota, que sí se incluye (para poder mostrarla como corte).
 */
/** Un nodo de riesgo marca un corte aunque el modelo olvide el status. */
const isBroken = (edge, kindById) => edge.status === "broken" || kindById.get(edge.to) === "risk";

export function planSequence(nodes, edges) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const kindById = new Map(nodes.map((n) => [n.id, n.kind]));
  const usable = [];
  edges.forEach((e, i) => {
    if (idx.has(e.from) && idx.has(e.to)) usable.push({ edge: e, index: i });
  });

  const beats = [];
  if (!nodes.length) return { beats, broken: false };

  const start = usable.length ? idx.get(usable[0].edge.from) : 0;
  beats.push({ node: start, edge: null, label: nodes[start]?.label || "", detail: "", broken: false });

  let broken = false;
  for (const { edge, index } of usable) {
    const to = idx.get(edge.to);
    const cuts = isBroken(edge, kindById);
    beats.push({
      node: to,
      edge: index,
      label: nodes[to]?.label || "",
      detail: edge.label || "",
      broken: cuts,
    });
    if (cuts) {
      broken = true;
      break;
    }
  }

  return { beats, broken };
}

export function buildMermaid(nodes, edges, { stepNumbers = false } = {}) {
  const ids = new Map();
  nodes.forEach((n, i) => ids.set(n.id, `n${i}`));

  const usable = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const head = [
    "---",
    "config:",
    "  flowchart:",
    "    useMaxWidth: false",
    "    curve: linear",
    "    nodeSpacing: 30",
    "    rankSpacing: 48",
    `    stepNumbers: ${stepNumbers}`,
    "---",
    "flowchart LR",
  ];

  const nodeLines = nodes.map((n, i) => `  n${i}["${clean(n.label)}"]:::${n.kind}`);

  const edgeLines = usable.map((e, i) => {
    const label = e.label ? `|${clean(e.label, 40)}|` : "";
    return `  ${ids.get(e.from)} e${i}@-->${label} ${ids.get(e.to)}`;
  });

  const brokenIdx = usable
    .map((e, i) => (isBroken(e, new Map(nodes.map((n) => [n.id, n.kind]))) ? i : -1))
    .filter((i) => i >= 0);
  const styleLines = brokenIdx.map((i) => `  linkStyle ${i} stroke:#8c2f27,stroke-width:2px`);

  const classDefs = [
    "  classDef human fill:#ffffff,stroke:#c3d3bc,stroke-width:1.5px",
    "  classDef system fill:#ffffff,stroke:#c4c9bf",
    "  classDef ai fill:#eef0ea,stroke:#787d6c",
    "  classDef data fill:#ffffff,stroke:#c4c9bf,stroke-dasharray:4 3",
    "  classDef risk fill:#f8eeec,stroke:#8c2f27",
  ];

  return [...head, ...nodeLines, ...edgeLines, ...styleLines, ...classDefs].join("\n");
}
