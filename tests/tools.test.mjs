import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, UI_TOOLS, toolPrompt, validateToolCall, detectToolCall } from "../server/tools.mjs";

test("el registro declara la herramienta de correo con sus parámetros", () => {
  const t = TOOLS.find((x) => x.name === "email");
  assert.ok(t);
  assert.equal(t.sideEffect, true);
  assert.ok(t.params.some((p) => p.name === "to"));
});

test("el prompt se arma solo desde el registro", () => {
  const p = toolPrompt();
  for (const t of TOOLS) assert.ok(p.includes(`"${t.name}"`), `falta ${t.name}`);
  assert.ok(p.includes("NUNCA inventes direcciones"));
});

test("sin acción no hay llamada", () => {
  assert.deepEqual(validateToolCall(null), { ok: true, tool: null, args: {} });
});

test("acepta una llamada válida y normaliza", () => {
  const r = validateToolCall({ tool: "email", to: ["Jefe@Empresa.com"], nota: "revisar" });
  assert.equal(r.ok, true);
  assert.equal(r.tool, "email");
  assert.deepEqual(r.args.to, ["Jefe@Empresa.com"]);
  assert.equal(r.args.nota, "revisar");
});

test("deduplica sin distinguir mayúsculas", () => {
  const r = validateToolCall({ tool: "email", to: ["a@x.com", "A@X.com", " a@x.com "] });
  assert.deepEqual(r.args.to, ["a@x.com"]);
});

test("descarta lo que no parece un correo", () => {
  const r = validateToolCall({ tool: "email", to: ["juan", "", null, 7, "ok@x.com"] });
  assert.deepEqual(r.args.to, ["ok@x.com"]);
});

test("corta en diez destinatarios", () => {
  const many = Array.from({ length: 20 }, (_, i) => `p${i}@x.com`);
  assert.equal(validateToolCall({ tool: "email", to: many }).args.to.length, 10);
});

test("rechaza herramientas desconocidas y formas raras", () => {
  assert.equal(validateToolCall({ tool: "borrar_todo" }).ok, false);
  assert.equal(validateToolCall("email").ok, false);
  assert.equal(validateToolCall([]).ok, false);
});

test("la nota se recorta y nunca es objeto", () => {
  const r = validateToolCall({ tool: "email", to: [], nota: { a: 1 } });
  assert.equal(r.args.nota, "");
});

test("acepta la forma que devuelve el modelo en español", () => {
  const r = validateToolCall({ herramienta: "email", argumentos: { to: ["juan@empresa.com"], nota: "" } });
  assert.equal(r.ok, true);
  assert.equal(r.tool, "email");
  assert.deepEqual(r.args.to, ["juan@empresa.com"]);
});

test("acepta destinatarios con otros nombres de clave", () => {
  assert.deepEqual(validateToolCall({ tool: "email", para: ["a@b.com"] }).args.to, ["a@b.com"]);
  assert.deepEqual(validateToolCall({ tool: "email", destinatarios: ["c@d.com"] }).args.to, ["c@d.com"]);
});

test("el detector propone correo cuando hay una dirección escrita", () => {
  const d = detectToolCall("mandale el reporte a juan@empresa.com");
  assert.equal(d.tool, "email");
  assert.deepEqual(d.args.to, ["juan@empresa.com"]);
});

test("extrae varias direcciones y deduplica", () => {
  const d = detectToolCall("enviá a ana@x.com y luis@y.com, copia a Ana@X.com");
  assert.deepEqual(d.args.to, ["ana@x.com", "luis@y.com"]);
});

test("detecta el verbo de envío aunque no haya dirección", () => {
  assert.equal(detectToolCall("compartir esto por mail").tool, "email");
  assert.equal(detectToolCall("enviar un correo con el resumen").tool, "email");
});

test("no confunde una pregunta sobre correos con una orden de enviar", () => {
  assert.equal(detectToolCall("¿qué correos electrónicos se envían desde la landing?"), null);
  assert.equal(detectToolCall("¿cuántos correos manda el sistema?"), null);
});

test("sin señales no propone nada", () => {
  assert.equal(detectToolCall("¿qué riesgos corro en el comercial?"), null);
  assert.equal(detectToolCall(""), null);
});

test("las herramientas de interfaz tienen prompt y validador", () => {
  for (const t of UI_TOOLS) {
    assert.ok(toolPrompt().includes(`"${t.name}"`), `falta ${t.name} en el prompt`);
    assert.equal(t.sideEffect, false, `${t.name} no debe tener efecto destructivo`);
  }
});

test("abrir_proyecto sólo acepta los tres proyectos", () => {
  assert.equal(validateToolCall({ tool: "abrir_proyecto", argumentos: { proyecto: "cotizador" } }).ok, true);
  assert.equal(validateToolCall({ tool: "abrir_proyecto", proyecto: "otro" }).ok, false);
  assert.equal(validateToolCall({ tool: "abrir_proyecto", proyecto: "LANDING" }).ok, true);
});

test("los nodos se normalizan a mayúsculas y se validan", () => {
  const r = validateToolCall({ tool: "abrir_detalle", argumentos: { nodo: "n08" } });
  assert.equal(r.ok, true);
  assert.equal(r.args.nodo, "N08");
  assert.equal(validateToolCall({ tool: "abrir_detalle", nodo: "N07b" }).args.nodo, "N07B");
  // un nombre largo ahora es válido: se resuelve contra los títulos
  assert.equal(validateToolCall({ tool: "abrir_detalle", nombre: "comparación con cotizaciones" }).ok, true);
  assert.equal(validateToolCall({ tool: "abrir_detalle", nodo: "ab" }).ok, false);
});


test("el prompt no reusa los argumentos de otra herramienta", () => {
  const p = toolPrompt();
  assert.ok(!/email → .*"proyecto"/.test(p));
  assert.ok(!/abrir_proyecto → .*"to"/.test(p));
});
