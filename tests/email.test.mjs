import test from "node:test";
import assert from "node:assert/strict";
import { splitList, localVerdict, normalize, labelFor } from "../public/email.mjs";

test("acepta correos comunes", () => {
  for (const e of ["ana@steelandglass.com", "j.martinez@empresa.co", "a_b+c@sub.dominio.com.co"]) {
    const v = localVerdict(e);
    assert.equal(v.ok, true, `${e} debería ser válido (${v.reason})`);
  }
});

test("rechaza formatos inválidos", () => {
  for (const e of ["ana", "ana@", "@dominio.com", "ana@dominio", "ana dominio.com", "ana@@x.com"]) {
    assert.equal(localVerdict(e).ok, false, `${e} debería fallar`);
  }
});

test("normaliza a minúsculas y recorta", () => {
  assert.equal(normalize("  Ana@Empresa.CO "), "ana@empresa.co");
  assert.equal(localVerdict("  Ana@Empresa.CO ").email, "ana@empresa.co");
});

test("detecta dominios temporales", () => {
  const v = localVerdict("alguien@mailinator.com");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "descartable");
});

test("sugiere el dominio cuando hay typo", () => {
  const v = localVerdict("ana@gmial.com");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "typo");
  assert.equal(v.suggestion, "ana@gmail.com");
});

test("marca buzones de rol pero los deja pasar", () => {
  const v = localVerdict("ventas@empresa.com");
  assert.equal(v.ok, true);
  assert.equal(v.reason, "rol");
});

test("separa listas por coma, punto y coma o espacios", () => {
  assert.deepEqual(splitList("a@x.com, b@y.com; c@z.com  d@w.com"), [
    "a@x.com",
    "b@y.com",
    "c@z.com",
    "d@w.com",
  ]);
  assert.deepEqual(splitList("   "), []);
});

test("cada motivo tiene copy legible", () => {
  for (const r of ["vacio", "formato", "descartable", "typo", "sin-mx"]) {
    assert.ok(labelFor(r) && labelFor(r) !== "revisá el correo", `falta copy para ${r}`);
  }
});
