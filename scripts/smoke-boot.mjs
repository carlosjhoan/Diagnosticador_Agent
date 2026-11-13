// Arnés mínimo: ejecuta el módulo del cliente contra un DOM falso.
// Sirve para detectar el peor fallo posible: página en blanco por error de arranque.
// Uso: node scripts/smoke-boot.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GRAPH = readFileSync(fileURLToPath(new URL("../public/data/graph.json", import.meta.url)), "utf8");

function makeEl(id = "") {
  const el = {
    id,
    children: [],
    innerHTML: "",
    textContent: "",
    hidden: false,
    value: "",
    onclick: null,
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      _s: new Set(),
      add(...c) {
        c.forEach((x) => this._s.add(x));
      },
      remove(...c) {
        c.forEach((x) => this._s.delete(x));
      },
      toggle(c) {
        if (this._s.has(c)) {
          this._s.delete(c);
          return false;
        }
        this._s.add(c);
        return true;
      },
      contains(c) {
        return this._s.has(c);
      },
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    insertBefore(c) {
      this.children.push(c);
      return c;
    },
    replaceChildren() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener(type, fn) {
      (this._l ||= {})[type] = fn;
    },
    removeEventListener() {},
    querySelector(sel) {
      const m = /^\[data-id="(.+)"\]$/.exec(sel);
      if (m) return this.children.find((c) => c.dataset && c.dataset.id === m[1]) || null;
      this._q = this._q || {};
      if (!this._q[sel]) this._q[sel] = makeEl(sel);
      return this._q[sel];
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    contains() {
      return false;
    },
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    requestSubmit() {},
    getBoundingClientRect() {
      return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 };
    },
    parentElement: null,
    focus() {},
  };
  return el;
}

const registry = new Map();
const parentStub = makeEl('parent');
const ids = ["canvas", "chips", "composer", "hint", "input", "instant", "newstuff", "progress", "reset", "send", "session", "status", "thread"];
for (const id of ids) { const e = makeEl(id); e.parentElement = parentStub; registry.set(id, e); }

const docListeners = {};
const fireDoc = (type, target) => {
  for (const fn of docListeners[type] || []) {
    try {
      fn({ target });
    } catch (e) {
      console.log('click handler falló:', e.message);
    }
  }
};
globalThis.document = {
  getElementById: (id) => {
    if (!registry.has(id)) registry.set(id, makeEl(id));
    return registry.get(id);
  },
  createElement: () => makeEl(),
  createTextNode: (t) => ({ textContent: t }),
  addEventListener(type, fn) {
    (docListeners[type] = docListeners[type] || []).push(fn);
  },
  removeEventListener() {},
  querySelectorAll: () => [],
  querySelector: () => null,
  head: makeEl("head"),
  body: makeEl("body"),
};

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  location: { search: "", hostname: "localhost", reload() {} },
};
globalThis.location = globalThis.window.location;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now() + 16), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.EventSource = class {
  addEventListener() {}
};
globalThis.AbortController = globalThis.AbortController || class { abort() {} };


const SEED = process.env.SEED_TURN === '1';
if (SEED) {
  const turn = {
    id: 't_seed',
    at: new Date().toISOString(),
    pregunta: '¿qué riesgos corro en el comercial?',
    spec: { view: 'map', title: 'Riesgos', story: 'story', layout: [{ type: 'callout', props: { text: 'hola' } }] },
    etapas: [],
    ms: 2700,
    costo: 0.0010,
    fx: { usdToCop: 3297.07, source: 'TRM oficial', date: '2026-11-11', exact: true },
    uso: { deepseek: { cost: 0.00067, tokens: 5350, calls: 2, model: 'deepseek-flash' }, jev: { cost: 0.00033, tokens: 8075, calls: 2, model: 'jev-1.14.0' } },
  };
  const data = JSON.stringify({ v: 1, id: 's_seed', createdAt: new Date().toISOString(), turns: [turn] });
  globalThis.localStorage = { getItem: (k) => (k === "sng.diagnostico.session.v1" ? data : null), setItem() {}, removeItem() {} };
} else {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("graph.json")) return { ok: true, json: async () => JSON.parse(GRAPH) };
  if (u.includes("/api/fx")) return { ok: true, json: async () => ({ usdToCop: 3297.07, source: "TRM oficial", date: "2026-11-11" }) };
  if (u.includes("/api/health")) return { ok: true, json: async () => ({ ok: true, model: "deepseek-flash", jev: true, stream: true }) };
  if (u.includes("/api/livereload")) return { ok: true, body: null };
  if (u.includes("/api/diagnosticos")) {
    const project = (id, nombre, pct) => ({
      id,
      nombre,
      linea: "línea",
      fecha: "2026-11-12",
      commit: "abc1234",
      sinDiagnostico: false,
      nodos: [],
      etapas: [],
      aristas: [],
      hipotesis: [],
      hallazgos: [],
      metricas: { total: 10, implementados: 6, parciales: 3, ausentes: 1, futuros: 0, verificados: 10 },
      veredicto: {
        estado: "aceptable",
        etiqueta: "Cobertura " + pct + "% · aceptable",
        cobertura: { pct, incluidos: 6, total: 10 },
        robustez: { valor: 2.2, incluidos: 10, total: 10 },
        verificados: 10,
        total: 10,
        formula: "6/10 nodos integrados",
      },
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ projects: [project("landing", "Landing", 62), project("cotizador", "Cotizador", 55), project("gerencial", "Gerencial Brain", 52)] }),
    };
  }

  if (u.includes("/api/ask")) {
    const frames = [
      { type: "run.started", data: { question: "test" } },
      {
        type: "tool.requested",
        data: { tool: "email", args: { to: ["jefe@empresa.com"], nota: "revisar" }, source: "model" },
      },
      { type: "run.finished", data: { ms: 1200, cost: 0.0012, by: null } },
    ];
    const body =
      frames.map((f) => "data: " + JSON.stringify(f) + "\n\n").join("") +
      "event: result\n" +
      "data: " +
      JSON.stringify({
        spec: { v: 2, view: "map", title: "Prueba de correo", story: "story", layout: [] },
      }) +
      "\n\n";
    const bytes = new TextEncoder().encode(body);
    let sent = false;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
        }),
      },
    };
  }

  if (u.includes("/api/email/status")) {
    return { ok: true, json: async () => ({ dryRun: true, from: "x@y.com", ready: true }) };
  }

  if (u.includes("/api/email/check")) {
    return { ok: true, json: async () => ({ results: [] }) };
  }

  return { ok: false, status: 404, json: async () => ({}) };
};

const errors = [];
process.on("unhandledRejection", (e) => errors.push(e));
process.on("uncaughtException", (e) => errors.push(e));

await import("../public/app.js");
await new Promise((r) => setTimeout(r, 200));

const canvas = registry.get('canvas');
const status = registry.get('status');
const welcome = registry.get('welcome-text');
const typed = welcome && welcome.children[0] ? String(welcome.children[0].textContent) : '';

const homeHost = document.getElementById('home-host');
const homeHtml = homeHost ? homeHost.innerHTML : '';
const ok = SEED
  ? !!document.getElementById('canvas').children[0] && status.dataset.state !== 'cargando'
  : homeHtml.includes('data-project') && (homeHtml.match(/pcard/g) || []).length >= 3;
console.log('canvas con bienvenida:', canvas.innerHTML.includes('welcome'));
console.log('status:', JSON.stringify(status.textContent));
console.log('tarjetas del home:', (homeHtml.match(/data-project=/g) || []).length);
if (errors.length) console.log('ERRORES:', errors.map((e) => e.message).join(' | '));

if (SEED) {
  const canvasEl = document.getElementById('canvas');
  const card = canvasEl.children[0];
  const head = card ? card.innerHTML : '';
  const body = card ? card.querySelector('.turn-body').innerHTML : '';
  const foot = card ? card.querySelector('.turn-foot').textContent : '';
  console.log('turno restaurado:', head.includes('turn-q'));
  console.log('spec restaurada:', body.includes('Riesgos'));
  console.log('pie:', JSON.stringify(foot));
  const footHtml = card ? card.querySelector('.turn-foot').innerHTML : '';
  console.log('precio clickeable:', footHtml.includes('u-price'));
  console.log('hora y duracion:', footHtml.includes('2.7s'));
  if (!head.includes('turn-q') || !body.includes('Riesgos')) errors.push(new Error('no restauró el turno'));

  const sessionBtn = document.getElementById('session');
  console.log('boton de sesion visible:', sessionBtn.hidden === false);
  console.log('texto:', JSON.stringify(sessionBtn.innerHTML));
  if (sessionBtn.hidden !== false) errors.push(new Error('el botón de sesión quedó oculto'));
  if (!String(sessionBtn.innerHTML).includes('COP') && !String(sessionBtn.innerHTML).includes('USD')) {
    errors.push(new Error('el botón de sesión no muestra el total'));
  }
  if (!footHtml.includes('2.7s')) errors.push(new Error('el pie no muestra el tiempo'));
  if (!footHtml.includes('u-price')) errors.push(new Error('el precio no es clickeable'));
  console.log('muestra COP:', footHtml.includes('COP'));
  if (!footHtml.includes('COP')) errors.push(new Error('el precio no se muestra en pesos'));

  // popover de costo: dispara el mismo camino que el click del usuario
  const priceBtn = {
    closest: (sel) => (sel === '[data-id]' ? card : null),
    getBoundingClientRect: () => ({ top: 100, right: 300, bottom: 120, left: 250, width: 50, height: 20 }),
    setAttribute() {},
  };
  const target = { closest: (sel) => (sel === '.u-price' ? priceBtn : null) };
  try {
    fireDoc('click', target);
  } catch (e) {
    errors.push(new Error('popover: ' + e.message));
  }
  const pop = document.body.children[document.body.children.length - 1];
  const popOk = Boolean(pop && String(pop.innerHTML).includes('costo de la interacción'));
  console.log('popover abierto:', popOk);
  if (!popOk) errors.push(new Error('el popover de costo no se abrió'));
}

// --- simular envío de una consulta ---
const input = registry.get('input');
const composer = registry.get('composer');
input.value = 'que riesgos corro en el comercial';
input._l?.input?.();
console.log('boton habilitado con texto:', !registry.get('send').disabled);

composer._l?.submit?.({ preventDefault() {} });
await new Promise((r) => setTimeout(r, 120));

const railQ = document.getElementById('sessions').innerHTML;
if (errors.length) console.log('REJECTS:', errors.map(e => e.message).join(' | '));
console.log('lista de conversaciones:', railQ.includes('session-item'));
console.log('input despues de enviar:', JSON.stringify(input.value));
if (!railQ.includes('session-item')) errors.push(new Error('no se renderizó la lista de conversaciones'));

// --- nuevo chat: crea otra sesión y la titula con la primera consulta ---
const newBtn = document.getElementById('new-chat');
fireDoc('click', { closest: (sel) => (sel === '#new-chat' ? newBtn : null) });

const count1 = (document.getElementById('sessions').innerHTML.match(/session-item/g) || []).length;
console.log('sesiones tras nuevo chat:', count1);

input.value = 'que falta en el gerencial brain';
input._l?.input?.();
composer._l?.submit?.({ preventDefault() {} });
await new Promise((r) => setTimeout(r, 120));

const listHtml = document.getElementById('sessions').innerHTML;
const count2 = (listHtml.match(/session-item/g) || []).length;
const titled = /que falta en el gerencial brain/i.test(listHtml);
console.log('sesiones tras enviar:', count2, '| título nuevo:', titled);
if (!titled) errors.push(new Error('la sesión nueva no tomó el título de la primera consulta'));
if (count2 !== count1) errors.push(new Error('el envío creó una sesión extra'));

const sessionsHtml = document.getElementById('sessions').innerHTML;
const hasMenuBtn = /data-menu="/.test(sessionsHtml);
const hasTabs = /data-tab="archived"/.test(readFileSync('public/index.html', 'utf8'));
console.log('boton de acciones por sesión:', hasMenuBtn);
console.log('pestañas activas/archivadas:', hasTabs);
if (!hasMenuBtn) errors.push(new Error('la card de sesión no tiene menú de acciones'));
if (!hasTabs) errors.push(new Error('el rail no tiene pestañas'));
console.log('input editable:', !document.getElementById('input').disabled);

// --- envío por correo: se verifica la conexión, no el pintado ---
const appSrc = readFileSync("public/app.js", "utf8");
const htmlSrc = readFileSync("public/index.html", "utf8");
console.log("correo cableado:", appSrc.includes("data-mail="));
console.log("correo visible:", /const SHOW_MAIL = true/.test(appSrc));
console.log("modal de correo montado:", htmlSrc.includes('id="email"'));
console.log("apertura diferida al cerrar el turno:", appSrc.includes("state.pendingTool"));
// --- el modelo propone correo: el modal debe abrirse solo ---
console.log("modal automatico:", Boolean(document.getElementById("email").open));

if (!ok || errors.length) {
  for (const e of errors) console.log("ERROR:", e && e.message ? e.message : String(e));
  console.log('FALLO: el cliente no arrancó');
  process.exit(1);
}
console.log("ok: el cliente arranca y pinta la vista inicial");
process.exit(0);
