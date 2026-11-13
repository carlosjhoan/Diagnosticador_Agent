// Store de conversaciones. Persistido en localStorage.
// Forma: { v: 2, currentId, sessions: [{ id, title, createdAt, updatedAt, turns[] }] }

const KEY = "sng.diagnostico.store.v2";
const LEGACY = "sng.diagnostico.session.v1";

const store = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const sid = (p = "s") => p + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);

export function newSessionRecord(title = "") {
  const now = new Date().toISOString();
  return { id: sid("c"), title, createdAt: now, updatedAt: now, archived: false, turns: [] };
}

export function emptyStore() {
  const s = newSessionRecord();
  return { v: 2, currentId: s.id, sessions: [s] };
}

/** Título de la primera consulta, recortado en frontera de palabra. */
export function titleFrom(question, max = 90) {
  const raw = String(question || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s¿¡"'«»-]+/, "")
    .trim();
  if (!raw) return "Nueva conversación";

  const clean = raw.replace(/[.?!]+$/, "");
  if (clean.length <= max) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  const cut = clean.slice(0, max);
  const at = cut.lastIndexOf(" ");
  const base = at > max * 0.6 ? cut.slice(0, at) : cut;
  return base.charAt(0).toUpperCase() + base.slice(1) + "…";
}

function sanitizeStore(parsed) {
  if (!parsed || !Array.isArray(parsed.sessions) || !parsed.sessions.length) return null;
  const sessions = parsed.sessions
    .filter((s) => s && typeof s.id === "string" && Array.isArray(s.turns))
    .map((s) => ({
      id: s.id,
      title: typeof s.title === "string" ? s.title : "",
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || s.createdAt || new Date().toISOString(),
      archived: Boolean(s.archived),
      turns: s.turns,
    }));
  if (!sessions.length) return null;
  const currentId = sessions.some((s) => s.id === parsed.currentId) ? parsed.currentId : sessions[0].id;
  return { v: 2, currentId, sessions };
}

/** Migra la sesión única de la versión anterior, si existe. */
function migrateLegacy(ls) {
  try {
    const raw = ls.getItem(LEGACY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!old || !Array.isArray(old.turns) || !old.turns.length) return null;

    const first = (old.turns[0] || {}).pregunta || "";
    const rec = newSessionRecord(titleFrom(first));
    rec.turns = old.turns;
    rec.createdAt = old.createdAt || rec.createdAt;
    rec.updatedAt = old.turns[old.turns.length - 1]?.at || rec.updatedAt;
    return { v: 2, currentId: rec.id, sessions: [rec] };
  } catch {
    return null;
  }
}

export function loadStore() {
  const ls = store();
  if (!ls) return emptyStore();

  try {
    const raw = ls.getItem(KEY);
    if (raw) {
      const parsed = sanitizeStore(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    /* cae a migración o a store vacío */
  }

  return migrateLegacy(ls) || emptyStore();
}

export function saveStore(data) {
  const ls = store();
  if (!ls) return false;
  try {
    ls.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function currentSession(data) {
  if (!data) return null;
  return data.sessions.find((s) => s.id === data.currentId) || data.sessions[0] || null;
}

export function addSession(data, record) {
  data.sessions.unshift(record);
  data.currentId = record.id;
  return data;
}

export function clearStore() {
  const ls = store();
  try {
    ls?.removeItem(KEY);
    ls?.removeItem(LEGACY);
  } catch {
    /* noop */
  }
}

/* ---------- turnos ---------- */

export function makeTurn(question) {
  return {
    id: sid("t"),
    at: new Date().toISOString(),
    pregunta: String(question || ""),
    spec: null,
    etapas: [],
    ms: 0,
    costo: 0,
  };
}

/** Los turnos se guardan recortados: la vista completa, no el stream crudo. */
export function trimEvents(events) {
  return (Array.isArray(events) ? events : []).map((e) => ({
    type: e.type,
    t: e.t,
    data: e.data && typeof e.data === "object" ? e.data : undefined,
  }));
}

/** Suma de la sesión usando la tasa que quedó guardada en cada turno. */
export function sessionTotals(turns, fallbackRate = 0) {
  const list = Array.isArray(turns) ? turns : [];
  const by = {};
  let usd = 0;
  let cop = 0;
  let priced = 0;

  for (const t of list) {
    if (!t || t.costo == null) continue;
    priced += 1;

    const rate = t.fx && Number(t.fx.usdToCop) ? Number(t.fx.usdToCop) : Number(fallbackRate) || 0;
    const u = Number(t.costo) || 0;
    usd += u;
    cop += u * rate;

    for (const [key, v] of Object.entries(t.uso || {})) {
      if (!v || !v.calls) continue;
      const b = (by[key] ||= { cost: 0, costCop: 0, tokens: 0, calls: 0, model: null });
      const c = Number(v.cost) || 0;
      b.cost += c;
      b.costCop += c * rate;
      b.tokens += Number(v.tokens) || 0;
      b.calls += Number(v.calls) || 0;
      if (v.model) b.model = v.model;
    }
  }

  return { turns: list.length, priced, usd, cop, by };
}
