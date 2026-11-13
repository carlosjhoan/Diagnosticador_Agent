import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLayout, renderLayout, PRIMITIVES, BLOCK_TYPES } from "../public/components/registry.mjs";

test("el registro expone los bloques esperados", () => {
  for (const t of [
    "controls",
    "heading",
    "story",
    "kpi-row",
    "table",
    "matrix",
    "list",
    "pills",
    "stepper",
    "flow",
    "two-col",
    "timeline",
    "callout",
    "evidence",
    "flowanim",
  ]) {
    assert.ok(PRIMITIVES[t], `falta la primitiva ${t}`);
  }
  assert.equal(BLOCK_TYPES.length, 15);
});

test("descarta tipos desconocidos", () => {
  const out = sanitizeLayout([
    { type: "heading", props: { text: "Hola" } },
    { type: "iframe", props: { src: "http://evil" } },
    { type: "script", props: {} },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "heading");
});

test("descarta bloques con props inválidas", () => {
  const out = sanitizeLayout([
    { type: "heading", props: {} },
    { type: "callout", props: { text: "" } },
    { type: "table", props: { columns: [], rows: [] } },
    { type: "pills", props: { items: [] } },
  ]);
  assert.deepEqual(out, []);
});

test("no lanza ante basura", () => {
  for (const bad of [null, undefined, 42, "texto", {}, [null], [{ type: 3 }], [{ props: null }]]) {
    assert.doesNotThrow(() => sanitizeLayout(bad));
    assert.deepEqual(sanitizeLayout(bad), []);
  }
});

test("recorta el exceso de bloques", () => {
  const many = Array.from({ length: 40 }, () => ({ type: "story", props: { text: "x" } }));
  assert.equal(sanitizeLayout(many).length, 12);
});

test("escapa texto en todos los bloques", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const blocks = [
    { type: "heading", props: { text: payload } },
    { type: "story", props: { text: payload } },
    { type: "callout", props: { text: payload } },
    { type: "pills", props: { items: [{ text: payload }] } },
    { type: "list", props: { items: [{ title: payload, text: payload }] } },
    { type: "kpi-row", props: { items: [{ label: payload, value: payload }] } },
    { type: "evidence", props: { rows: [{ id: payload, ref: payload }] } },
    { type: "stepper", props: { steps: [{ label: payload, status: "ok" }] } },
  ];
  const html = renderLayout(blocks);
  assert.ok(!html.includes("<img"), "hay HTML sin escapar");
  assert.ok(html.includes("&lt;img"));
});

test("flow descarta aristas que apuntan a nodos inexistentes", () => {
  const [b] = sanitizeLayout([
    {
      type: "flow",
      props: {
        nodes: [
          { id: "a", label: "Formulario", kind: "human" },
          { id: "b", label: "API", kind: "system" },
        ],
        edges: [
          { from: "a", to: "b", label: "POST" },
          { from: "a", to: "zzz", label: "fantasma" },
        ],
      },
    },
  ]);
  assert.equal(b.props.edges.length, 1);
  assert.equal(b.props.edges[0].to, "b");
});

test("stepper normaliza estados inválidos a skip", () => {
  const [b] = sanitizeLayout([
    { type: "stepper", props: { steps: [{ label: "uno", status: "explotó" }, { label: "dos", status: "fail" }] } },
  ]);
  assert.equal(b.props.steps[0].status, "skip");
  assert.equal(b.props.steps[1].status, "fail");
});

test("cada primitiva renderiza con props mínimas válidas", () => {
  const cases = [
    ["heading", { text: "T" }],
    ["story", { text: "T" }],
    ["kpi-row", { items: [{ label: "L", value: "1" }] }],
    ["table", { columns: ["A"], rows: [["1"]] }],
    ["matrix", { columns: ["A"], rows: [{ label: "L", cells: ["1"] }] }],
    ["list", { items: [{ title: "T" }] }],
    ["pills", { items: [{ text: "P" }] }],
    ["stepper", { steps: [{ label: "S", status: "ok" }] }],
    ["flow", { nodes: [{ id: "a", label: "N", kind: "system" }], edges: [] }],
    ["two-col", { left: { title: "L", items: ["x"] }, right: { title: "R", items: ["y"] } }],
    ["timeline", { events: [{ when: "hoy", title: "T" }] }],
    ["callout", { tone: "warn", text: "C" }],
    ["evidence", { rows: [{ id: "E1", ref: "file.js:1" }] }],
  ];
  for (const [type, props] of cases) {
    const html = renderLayout([{ type, props }]);
    assert.ok(html.length > 10, `${type} no renderizó`);
  }
});

test("tone inválido cae a info", () => {
  const [b] = sanitizeLayout([{ type: "callout", props: { text: "x", tone: "flúor" } }]);
  assert.equal(b.props.tone, "info");
});

test("el stepper escalona cada paso con --i", () => {
  const html = renderLayout([
    {
      type: "stepper",
      props: {
        steps: [
          { label: "uno", status: "ok" },
          { label: "dos", status: "fail" },
          { label: "tres", status: "blocked" },
        ],
      },
    },
  ]);
  assert.match(html, /style="--i:0"/);
  assert.match(html, /style="--i:1"/);
  assert.match(html, /style="--i:2"/);
});

test("el stepper dibuja el trazo sólo donde hay icono", () => {
  const html = renderLayout([
    {
      type: "stepper",
      props: {
        steps: [
          { label: "ok", status: "ok" },
          { label: "falla", status: "fail" },
          { label: "bloqueado", status: "blocked" },
        ],
      },
    },
  ]);
  const paths = html.match(/b-step-check/g) || [];
  assert.equal(paths.length, 2, "ok y fail dibujan trazo; blocked no");
});

test("el stepper acepta warn y lo conserva", () => {
  const [b] = sanitizeLayout([{ type: "stepper", props: { steps: [{ label: "x", status: "warn" }] } }]);
  assert.equal(b.props.steps[0].status, "warn");
});

test("el stepper escapa los detalles", () => {
  const html = renderLayout([
    { type: "stepper", props: { steps: [{ label: "x", status: "ok", detail: "<script>alert(1)</script>" }] } },
  ]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("los controles marcan la opción activa y llevan la faceta", () => {
  const html = renderLayout([
    {
      type: "controls",
      props: {
        facet: "risks",
        params: { project: "comercial", sev: "critical" },
        controls: [
          { id: "project", label: "Proyecto", options: [{ value: "todos", label: "los tres" }, { value: "comercial", label: "Comercial" }] },
          { id: "sev", label: "Gravedad", options: [{ value: "all", label: "todo" }, { value: "critical", label: "sólo críticos" }] },
        ],
      },
    },
  ]);
  assert.match(html, /data-facet="risks"/);
  assert.equal((html.match(/fc-opt is-on/g) || []).length, 2, "debe haber una opción activa por control");
  assert.match(html, /data-control="project" data-value="comercial"/);
});

test("un parámetro fuera de las opciones cae a la primera", () => {
  const [b] = sanitizeLayout([
    {
      type: "controls",
      props: {
        facet: "risks",
        params: { project: "inventado" },
        controls: [{ id: "project", label: "Proyecto", options: [{ value: "todos", label: "los tres" }] }],
      },
    },
  ]);
  assert.equal(b.props.params.project, "todos");
});

test("un control sin faceta u opciones se descarta", () => {
  assert.deepEqual(sanitizeLayout([{ type: "controls", props: { params: {} } }]), []);
  assert.deepEqual(sanitizeLayout([{ type: "controls", props: { facet: "x", controls: [] } }]), []);
});
