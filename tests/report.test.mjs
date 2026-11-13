import test from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "../server/report.mjs";

const spec = {
  v: 2,
  view: "map",
  title: "Riesgos del Comercial",
  story: "Tres riesgos abiertos en la captura de leads.",
  layout: [
    { type: "controls", props: { facet: "risks" } },
    { type: "heading", props: { eyebrow: "riesgos", text: "Lo que puede romperse" } },
    {
      type: "kpi-row",
      props: { items: [{ value: "3", label: "riesgos" }, { value: "1", label: "crítico" }] },
    },
    {
      type: "list",
      props: {
        items: [
          { title: "URL del cotizador vacía", text: "El lead no llega.", tone: "critical", tag: "S1" },
          { title: "Contrato sin versión", text: "Rompe al cambiar.", tone: "medium" },
        ],
      },
    },
    {
      type: "table",
      props: { columns: ["Costura", "Estado"], rows: [["S1", "roto"], ["S2", "parcial"]] },
    },
  ],
};

test("el asunto lleva el título del turno", () => {
  const r = renderReport({ question: "¿qué riesgos?", spec });
  assert.match(r.subject, /Riesgos del Comercial/);
});

test("la nota va al principio del asunto y sin saltos de línea", () => {
  const r = renderReport({ question: "q", spec, note: "para el jefe\nurgente" });
  assert.ok(r.subject.startsWith("para el jefe urgente"));
  assert.ok(!r.subject.includes("\n"));
});

test("el html no arrastra el bloque de controles", () => {
  const r = renderReport({ question: "q", spec });
  assert.ok(!r.html.includes("facet"), "los controles son interactivos, no van al correo");
});

test("el html es email-safe: tablas y sin flex ni grid", () => {
  const r = renderReport({ question: "q", spec });
  assert.ok(r.html.includes("<table"));
  assert.ok(!/display:\s*(flex|grid)/.test(r.html));
  assert.ok(!r.html.includes("<script"));
  assert.ok(!r.html.includes("var(--"));
});

test("escapa el contenido del turno", () => {
  const r = renderReport({
    question: "<script>alert(1)</script>",
    spec: { title: "A & B", story: "<img src=x onerror=alert(1)>", layout: [] },
  });
  assert.ok(!r.html.includes("<script>alert(1)"));
  assert.ok(!r.html.includes("<img src=x"));
  assert.ok(r.html.includes("A &amp; B"));
});

test("incluye los datos del listado y la tabla", () => {
  const r = renderReport({ question: "q", spec });
  assert.ok(r.html.includes("URL del cotizador vacía"));
  assert.ok(r.html.includes("Costura"));
  assert.ok(r.text.includes("S1 | roto"));
});

test("sin costo no inventa la línea de dinero", () => {
  const r = renderReport({ question: "q", spec });
  assert.ok(!r.html.includes("US$"));
});

test("con costo formatea dólares y pesos", () => {
  const r = renderReport({ question: "q", spec, cost: { usd: 0.0012 }, fx: { usdToCop: 4000 } });
  assert.ok(r.html.includes("US$0,0012"));
  assert.ok(r.html.includes("5 COP"));
});
