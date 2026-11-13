import test from "node:test";
import assert from "node:assert/strict";
import { parseFrame } from "../public/sse.mjs";

test("frame de datos sin nombre", () => {
  const f = parseFrame('data: {"type":"run.started"}');
  assert.equal(f.event, "message");
  assert.equal(f.data, '{"type":"run.started"}');
});

test("frame con nombre de evento", () => {
  const f = parseFrame('event: result\ndata: {"spec":1}');
  assert.equal(f.event, "result");
  assert.equal(f.data, '{"spec":1}');
});

test("ignora comentarios de heartbeat", () => {
  const f = parseFrame(": keep-alive");
  assert.equal(f.event, "message");
  assert.equal(f.data, "");
});

test("acepta data en varias líneas", () => {
  const f = parseFrame('data: {"a":\ndata: 1}');
  assert.equal(f.data, '{"a":\n1}');
});

test("tolera ausencia de espacio después de los dos puntos", () => {
  assert.equal(parseFrame('data:{"x":1}').data, '{"x":1}');
  assert.equal(parseFrame("event:result\ndata:{}").event, "result");
});

test("frame vacío no rompe", () => {
  const f = parseFrame("");
  assert.equal(f.event, "message");
  assert.equal(f.data, "");
});

test("payload con saltos escapados sobrevive", () => {
  const raw = 'data: {"story":"linea1\ndata: linea2"}';
  const f = parseFrame(raw);
  assert.equal(f.data, '{"story":"linea1\nlinea2"}');
});
