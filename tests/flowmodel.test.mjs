import test from "node:test";
import assert from "node:assert/strict";
import { buildMermaid, planSequence } from "../public/flowmodel.mjs";

const nodes = [
  { id: "a", label: "Lead en Landing", kind: "human" },
  { id: "b", label: "POST /process", kind: "system" },
  { id: "c", label: "Extracción", kind: "ai" },
  { id: "d", label: "Pricing", kind: "system" },
];

const edges = [
  { from: "a", to: "b", label: "envío" },
  { from: "b", to: "c", label: "requirement", status: "broken" },
  { from: "c", to: "d", label: "propuesta" },
];

test("la secuencia arranca en el primer nodo y avanza por aristas", () => {
  const { beats } = planSequence(nodes, edges);
  assert.equal(beats[0].node, 0);
  assert.equal(beats[0].edge, null);
  assert.equal(beats[1].node, 1);
  assert.equal(beats[1].edge, 0);
});

test("la secuencia se corta en la arista rota, incluida", () => {
  const { beats, broken } = planSequence(nodes, edges);
  assert.equal(broken, true);
  assert.equal(beats.length, 3, "inicio + b + corte en c");
  assert.equal(beats.at(-1).node, 2);
  assert.equal(beats.at(-1).broken, true);
});

test("sin cortes recorre todo el flujo", () => {
  const ok = edges.map((e) => ({ ...e, status: "ok" }));
  const { beats, broken } = planSequence(nodes, ok);
  assert.equal(broken, false);
  assert.equal(beats.length, nodes.length);
});

test("descarta aristas hacia nodos inexistentes", () => {
  const { beats } = planSequence(nodes, [{ from: "a", to: "zzz" }]);
  assert.equal(beats.length, 1, "sólo el nodo inicial");
});

test("un flujo vacío no genera beats", () => {
  assert.deepEqual(planSequence([], []), { beats: [], broken: false });
});

test("la definición declara nodos con su clase y la arista rota en rojo", () => {
  const def = buildMermaid(nodes, edges);
  assert.match(def, /n0\["Lead en Landing"\]:::human/);
  assert.match(def, /n1\["POST \/process"\]:::system/);
  assert.match(def, /linkStyle 1 stroke:#8c2f27/);
});

test("no emite la animación nativa de Mermaid (la maneja el secuenciador)", () => {
  const def = buildMermaid(nodes, edges);
  assert.ok(!/step:/.test(def), "no debe asignar step");
  assert.match(def, /useMaxWidth: false/, "debe respetar el tamaño natural");
});

test("todo kind usado tiene su classDef", () => {
  const def = buildMermaid(nodes, edges);
  for (const kind of ["human", "system", "ai", "data", "risk"]) {
    assert.match(def, new RegExp(`classDef ${kind} `), `falta classDef ${kind}`);
  }
  const used = [...def.matchAll(/:::([a-z]+)/g)].map((m) => m[1]);
  for (const k of used) assert.match(def, new RegExp(`classDef ${k} `), `kind sin definir: ${k}`);
});

test("escapa comillas, pipes y saltos de línea", () => {
  const def = buildMermaid([{ id: "x", label: 'dice "hola" | adiós\nfin', kind: "system" }], []);
  assert.ok(!def.includes('"hola"'), "comillas sin escapar");
  assert.match(def, /#quot;/);
  assert.ok(!def.includes("|"));
});

test("una arista que entra a un nodo risk cuenta como corte", () => {
  const ns = [
    { id: "a", label: "Inicio", kind: "system" },
    { id: "b", label: "Falla", kind: "risk" },
    { id: "c", label: "Nunca llega", kind: "system" },
  ];
  const es = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ];
  const { beats, broken } = planSequence(ns, es);
  assert.equal(broken, true);
  assert.equal(beats.length, 2);
  assert.equal(beats.at(-1).broken, true);

  const def = buildMermaid(ns, es);
  assert.match(def, /linkStyle 0 stroke:#8c2f27/, "la arista de entrada al riesgo debe ir en rojo");
});
