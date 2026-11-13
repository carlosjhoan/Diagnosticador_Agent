import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROJECTS,
  adaptProject,
  estadoNodo,
  cobertura,
  robustez,
  veredictoGlobal,
  desactualizado,
} from "../public/diagnostic.mjs";

const load = (id) => JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), "utf8"));
const adapt = (id) => adaptProject(load(id), PROJECTS.find((p) => p.id === id));

const nodo = (extra) => ({
  id: "N01",
  title: "Prueba",
  stage: "captura",
  implemented: "TRUE",
  reliability: 2,
  quality: "solid",
  ...extra,
});

const proj = (nodos) => adaptProject({ nodes: nodos, edges: [], findings: [], hypotheses: [], matrix: {} }, PROJECTS[0]);

/* ---------- adaptación ---------- */

test("los tres diagnósticos se adaptan sin romper", () => {
  for (const p of PROJECTS) {
    const a = adapt(p.id);
    assert.equal(a.sinDiagnostico, false, p.id);
    assert.ok(a.nodos.length > 0, p.id);
    assert.ok(a.etapas.length > 0, p.id);
  }
});

test("sin diagnóstico no se inventan números", () => {
  const a = adaptProject(null, PROJECTS[0]);
  assert.equal(a.sinDiagnostico, true);
  assert.equal(a.nodos.length, 0);
  assert.equal(veredictoGlobal(a).estado, "sin-diagnostico");
  assert.equal(veredictoGlobal(a).cobertura, null);
});

test("las escalas se mapean con la tabla de la rúbrica", () => {
  assert.equal(adapt("cotizador").nodos.find((n) => n.id === "N02").integracion, "I3");
  assert.equal(adapt("cotizador").nodos.find((n) => n.id === "N10b").integracion, "I2");
  assert.equal(adapt("cotizador").nodos.find((n) => n.id === "N07b").integracion, "I0");
});

test("funcionamiento no se infla a F3", () => {
  for (const p of PROJECTS) {
    for (const n of adapt(p.id).nodos) {
      assert.notEqual(n.funcionamiento, "F3", `${p.id}/${n.id} no puede ser F3 sin verificación de ejecución`);
    }
  }
});

test("los ejes salen de la matriz, con null donde no aplica", () => {
  const cot = adapt("cotizador");
  const conNull = cot.nodos.find((n) => Object.values(n.ejes).includes(null));
  assert.ok(conNull, "el cotizador trae celdas nulas y deben sobrevivir");

  const n = adapt("landing").nodos[0];
  const valores = Object.values(n.ejes);
  assert.equal(valores.length, 10, "landing tiene 10 ejes");
  for (const v of valores) assert.ok(v === null || (v >= 0 && v <= 3), `valor de eje inválido: ${v}`);

  const ger = adapt("gerencial");
  assert.equal(Object.keys(ger.nodos[0].ejes).length, 11, "gerencial tiene 11 ejes");
});

test("las aristas alimentan dependeDe y alimenta en ambos sentidos", () => {
  const a = adapt("cotizador");
  const n08 = a.nodos.find((n) => n.id === "N08");
  assert.ok(n08.dependeDe.length > 0);
  const n05 = a.nodos.find((n) => n.id === "N05");
  assert.ok(n05.alimenta.length > 0);
});

test("las hipótesis se enlazan a sus nodos", () => {
  const a = adapt("cotizador");
  const conHipotesis = a.nodos.filter((n) => n.hipotesisRelacionadas.length);
  assert.ok(conHipotesis.length > 0);
});

test("las brechas del diagnóstico se reportan, no se rellenan", () => {
  const a = adapt("cotizador");
  assert.ok(a.advertencias.some((x) => x.includes("alcance")));
  assert.ok(a.advertencias.some((x) => x.includes("riesgos")));
  assert.equal(a.alcanceDeclarado, false);
});

test("un nodo fuera del sistema se marca como tal", () => {
  const p = proj([nodo({ fueraDelSistema: "Excel del comercial" })]);
  assert.equal(estadoNodo(p.nodos[0]).implementado, "externo");
});

/* ---------- señales ---------- */

test("implementado y robustez son señales independientes", () => {
  const p = proj([nodo({ implemented: "TRUE", quality: "needs_work" })]);
  const e = estadoNodo(p.nodos[0]);
  assert.equal(e.implementado, "si");
  assert.equal(e.robustez, "Q1");
});

/* ---------- promedios ---------- */

test("la cobertura exige integrado Y funcionando", () => {
  const p = proj([
    nodo({ id: "A", implemented: "TRUE", reliability: 2 }),
    nodo({ id: "B", implemented: "TRUE", reliability: 1 }),
    nodo({ id: "C", implemented: "PARTIAL", reliability: 2 }),
    nodo({ id: "D", implemented: "FALSE", reliability: 0 }),
  ]);
  const c = cobertura(p);
  assert.equal(c.incluidos, 1);
  assert.equal(c.total, 4);
  assert.equal(c.pct, 25);
});

test("los nodos futuros no entran en los promedios", () => {
  const p = proj([
    nodo({ id: "A" }),
    nodo({ id: "B", alcance: "Futuro" }),
    nodo({ id: "C", alcance: "Futuro" }),
  ]);
  assert.equal(cobertura(p).total, 1);
  assert.equal(robustez(p).total, 1);
});

test("los nodos sin verificar no bajan el promedio", () => {
  const p = proj([
    nodo({ id: "A", quality: "solid" }),
    nodo({ id: "B", quality: "solid" }),
    nodo({ id: "C", quality: "desconocido" }),
  ]);
  const r = robustez(p);
  assert.equal(r.incluidos, 2, "el NV queda afuera del promedio");
  assert.equal(r.total, 3, "pero sí cuenta en el denominador informado");
  assert.equal(r.valor, 3);
});

test("la robustez no se calcula sobre futuro", () => {
  const p = proj([nodo({ id: "A", quality: "solid" }), nodo({ id: "B", quality: "needs_work", alcance: "Futuro" })]);
  assert.equal(robustez(p).valor, 3);
});

/* ---------- veredicto global ---------- */

test("el veredicto informa cuántos nodos están verificados", () => {
  const v = veredictoGlobal(adapt("cotizador"));
  assert.ok(v.verificados > 0);
  assert.ok(v.total >= v.verificados);
  assert.match(v.formula, /nodos verificados/);
});

test("un proyecto con diagnóstico parcial no finge certeza", () => {
  const p = proj([nodo({ id: "A", quality: "solid" }), nodo({ id: "B", quality: "NV" })]);
  const v = veredictoGlobal(p);
  assert.equal(v.verificados, 1);
  assert.equal(v.total, 2);
});

/* ---------- desactualizado ---------- */

test("detecta el diagnóstico desactualizado comparando commits", () => {
  const p = adapt("cotizador");
  const actual = p.commit.slice(0, 7).padEnd(7, "0");
  assert.equal(desactualizado(p, actual), null, "mismo commit no marca nada");

  const otro = "0000000";
  if (p.commit.slice(0, 7) !== otro) {
    const d = desactualizado(p, otro);
    assert.ok(d);
    assert.equal(d.actual, otro);
  }
});

test("sin commit actual no se afirma nada", () => {
  assert.equal(desactualizado(adapt("cotizador"), null), null);
  assert.equal(desactualizado(adapt("cotizador"), ""), null);
});

test("el veredicto separa construido de listo", () => {
  const cot = adapt("cotizador");
  const v = veredictoGlobal(cot);
  assert.equal(v.construido.incluidos, 17);
  assert.equal(v.construido.total, 22);
  assert.equal(v.construido.pct, 77);
  assert.equal(v.cobertura.pct, 55, "listo para producción aplica el filtro de funcionamiento");
  assert.ok(v.construido.pct > v.cobertura.pct);
});

test("construido cuenta sólo lo integrado, sin mirar robustez", () => {
  const p = proj([nodo({ id: "A" }), nodo({ id: "B", implemented: "TRUE", reliability: 1 }), nodo({ id: "C", implemented: "PARTIAL" })]);
  const v = veredictoGlobal(p);
  assert.equal(v.construido.incluidos, 2, "I3 cuenta aunque funcione sólo en el caso feliz");
  assert.equal(v.cobertura.incluidos, 1, "pero sólo uno está listo");
});

test("en Landing y Gerencial las dos medidas coinciden", () => {
  for (const id of ["landing", "gerencial"]) {
    const v = veredictoGlobal(adapt(id));
    assert.equal(v.construido.pct, v.cobertura.pct, id);
  }
});

test("un nodo fuera de la rúbrica no baja el porcentaje", () => {
  const landing = adapt("landing");
  const l12 = landing.nodos.find((n) => n.id === "L12");
  assert.equal(l12.fueraDeRubrica, true, "la gestión de contenido es una propuesta, no un requisito");
  assert.equal(landing.nodos.find((n) => n.id === "L13").fueraDeRubrica, true, "medición y aprendizaje también es propuesta");

  const v = veredictoGlobal(landing);
  assert.equal(v.construido.total, 11, "13 nodos menos las dos propuestas");
  assert.equal(v.cobertura.total, 11);
  assert.equal(v.construido.pct, 73, "sin las propuestas, Landing queda en 73%");
});

test("los demás proyectos no tienen nodos fuera de rúbrica", () => {
  for (const id of ["cotizador", "gerencial"]) {
    const p = adapt(id);
    assert.equal(p.metricas.propuestas, 0, id);
    assert.ok(p.nodos.every((n) => n.fueraDeRubrica === false), id);
  }
});

test("el negocio pondera: integrado entero, parcial medio", () => {
  const p = proj([
    nodo({ id: "A", implemented: "TRUE" }),
    nodo({ id: "B", implemented: "PARTIAL" }),
    nodo({ id: "C", implemented: "FALSE" }),
    nodo({ id: "D", implemented: "PARTIAL" }),
  ]);
  const v = veredictoGlobal(p);
  assert.equal(v.negocio.completos, 1);
  assert.equal(v.negocio.parciales, 2);
  assert.equal(v.negocio.ausentes, 1);
  assert.equal(v.negocio.pct, 50, "(1 + 0.5 + 0 + 0.5) / 4");
});

test("el negocio no puede ser menor que la producción", () => {
  for (const p of PROJECTS) {
    const v = veredictoGlobal(adapt(p.id));
    assert.ok(v.negocio.pct >= v.cobertura.pct, `${p.id}: negocio ${v.negocio.pct} < producción ${v.cobertura.pct}`);
  }
});
