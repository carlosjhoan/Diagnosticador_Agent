// Adaptador HTTP. Toda la orquestación vive en pipeline.mjs.
// /api/ask responde SSE; /api/ask?mode=json mantiene el contrato viejo.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, watch } from "node:fs";
import { join, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "./pipeline.mjs";
import { loadCache, lookupCache } from "./cache.mjs";
import { checkMany } from "./server/email-check.mjs";
import { renderReport } from "./server/report.mjs";
import { sendMail, mailerStatus } from "./server/mailer.mjs";
import { normalizePrecotizador } from "./precotizador.mjs";
import { adaptProject, PROJECTS } from "./public/diagnostic.mjs";

const ROOT = resolve(fileURLToPath(new URL("./public", import.meta.url)));
const PORT = Number(process.env.PORT || 4399);
const HEARTBEAT_MS = 15000;

// tiny .env loader: KEY=value lines, no deps
try {
  for (const line of readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env, fine */
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

let cacheEntries = null;
const getCache = async () => {
  if (!cacheEntries) cacheEntries = await loadCache(join(ROOT, "..", "tests", "golden-v2"));
  return cacheEntries;
};

const readData = (name) => readFile(join(ROOT, "data", name), "utf8").then(JSON.parse);
const readGraph = async () => {
  const [graph, pc] = await Promise.all([
    readData("graph.json"),
    readData("cotizador.json").catch(() => null),
  ]);

  // Los diagnósticos nuevos son la fuente del dashboard y de la exploración.
  const diagnostics = [];
  for (const p of PROJECTS) {
    const raw = await readData(p.id + ".json").catch(() => null);
    diagnostics.push(adaptProject(raw, p));
  }

  return { ...graph, precotizador: normalizePrecotizador(pc), diagnostics };
};

function send(res, status, body, type) {
  res.writeHead(status, { "content-type": type || "application/json; charset=utf-8" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(pathname).replace(/^([/\\])+/, "");

  // public/ primero; assets/ vive un nivel arriba. Se prueban ambos sin
  // depender del separador que devuelva normalize() en cada sistema.
  const roots = rel.split(/[\\/]/)[0] === "assets" ? [join(ROOT, ".."), ROOT] : [ROOT];

  for (const base of roots) {
    const file = join(base, rel || "index.html");
    if (!file.startsWith(base)) continue;
    try {
      const st = await stat(file);
      if (st.isDirectory()) continue;
      return send(res, 200, await readFile(file), MIME[extname(file)] || "application/octet-stream");
    } catch {
      /* probar el siguiente */
    }
  }
  return send(res, 404, { error: "not found" });
}

const trace = (e) => {
  if (!process.env.DEBUG_PIPE) return;
  console.log(`[${String(e.seq).padStart(2, "0")} ${String(e.t).padStart(5)}ms] ${e.type}`, JSON.stringify(e.data).slice(0, 220));
};

/* ---------- livereload: equivale al watcher de Django/Vite ---------- */

const LIVE = process.env.LIVERELOAD !== "0";
const liveClients = new Set();

if (LIVE) {
  let timer = null;
  try {
    watch(ROOT, { recursive: true }, (_event, file) => {
      if (!file || !/\.(js|mjs|css|html|json)$/.test(String(file))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const res of liveClients) {
          try {
            res.write("data: reload\n\n");
          } catch {
            liveClients.delete(res);
          }
        }
        console.log(`[livereload] ${file}`);
      }, 140);
    });
  } catch (e) {
    console.warn("[livereload] no disponible:", e.message);
  }
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body || "{}");
  const question = String(parsed.question || "").slice(0, 500);
  const params = parsed.params && typeof parsed.params === "object" ? parsed.params : null;
  return question ? { question, params } : null;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (body.length > 1_000_000) throw new Error("too_large");
  return JSON.parse(body || "{}");
}

/** SSE: cada evento del pipeline viaja como frame propio. */
async function streamAsk(req, res, question, params) {
  const graph = await readGraph();

  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders?.();

  let closed = false;
  const close = () => {
    closed = true;
  };
  // 'close' sobre la respuesta es la señal fiable de desconexión del cliente.
  res.on("close", close);
  res.on("error", close);

  const write = (chunk) => {
    if (closed) return false;
    try {
      return res.write(chunk);
    } catch {
      closed = true;
      return false;
    }
  };

  const heartbeat = setInterval(() => write(": keep-alive\n\n"), HEARTBEAT_MS);

  try {
    const entries = await getCache().catch(() => []);
    const spec = await runPipeline({
      question,
      graph,
      params,
      deps: { cache: (q) => lookupCache(entries, q) },
      emit: (e) => {
        trace(e);
        write(`data: ${JSON.stringify(e)}\n\n`);
      },
    });
    write(`event: result\ndata: ${JSON.stringify({ spec })}\n\n`);
  } catch (e) {
    write(`event: error\ndata: ${JSON.stringify({ message: String(e?.message || e).slice(0, 200) })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    if (!closed) {
      res.end();
    }
  }
}

/* ---------- tipo de cambio USD → COP ---------- */

let liveCache = { at: 0, data: null };

/** Cotización en vivo (intraday), como la que muestra Google. Caché 5 min. */
async function getLive() {
  const now = Date.now();
  if (liveCache.data && now - liveCache.at < 5 * 60_000) return liveCache.data;

  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/USDCOP=X?interval=1m&range=1d", {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const rate = Number(meta?.regularMarketPrice);
    if (rate > 0) {
      const at = meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();
      liveCache = { at: now, data: { usdToCop: rate, source: "mercado · en vivo", date: at, exact: true } };
      return liveCache.data;
    }
  } catch {
    /* cae a la TRM */
  }
  return null;
}

let fxCache = { at: 0, series: null };

const FX_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=40";

/** Serie de TRM (últimos 40 registros) cacheada 6 h. */
async function loadSeries() {
  const now = Date.now();
  if (fxCache.series && now - fxCache.at < 6 * 3600_000) return fxCache.series;

  try {
    const r = await fetch(FX_URL, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) throw new Error("http " + r.status);
    const rows = await r.json();
    const series = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        from: String(row.vigenciadesde || "").slice(0, 10),
        to: String(row.vigenciahasta || "").slice(0, 10),
        rate: Number(row.valor),
      }))
      .filter((x) => x.from && x.rate > 0);

    if (series.length) {
      fxCache = { at: now, series };
      return series;
    }
  } catch {
    /* sigue con el respaldo */
  }
  return null;
}

/** La TRM que cubre esa fecha; si aún no se publicó, la última vigente. */
function rateFor(series, date) {
  if (!series || !series.length) return null;
  const hit = series.find((r) => r.from <= date && date < (r.to || r.from));
  if (hit) return { rate: hit.rate, date: hit.from, exact: true };
  const last = series[0];
  return { rate: last.rate, date: last.from, exact: false };
}

async function getFx(dateParam) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "")
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  // 1) En vivo: sólo para hoy. Un día pasado se responde con su TRM.
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) {
    const live = await getLive();
    if (live) return { ...live, requestedDate: date };
  }

  // 2) TRM oficial de la fecha pedida
  const series = await loadSeries();
  const hit = rateFor(series, date);
  if (hit) {
    return {
      usdToCop: hit.rate,
      source: "TRM oficial",
      date: hit.date,
      requestedDate: date,
      exact: hit.exact,
    };
  }

  // 3) Configurado
  const fallback = Number(process.env.FX_FALLBACK || 4000);
  return { usdToCop: fallback, source: "configurado", date: null, requestedDate: date, exact: false };
}

const buckets = new Map();
function limiter(name, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(name) || { at: now, n: 0 };
  if (now - b.at > windowMs) {
    b.at = now;
    b.n = 0;
  }
  b.n += 1;
  buckets.set(name, b);
  return b.n <= max;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/livereload") {
    res.writeHead(200, SSE_HEADERS);
    res.flushHeaders?.();
    res.write(": conectado\n\n");
    liveClients.add(res);
    res.on("close", () => liveClients.delete(res));
    return;
  }

  if (url.pathname === "/api/fx") {
    const fx = await getFx(url.searchParams.get("date")).catch(() => ({
      usdToCop: Number(process.env.FX_FALLBACK || 4000),
      source: "configurado",
      date: null,
      requestedDate: null,
      exact: false,
    }));
    return send(res, 200, fx);
  }

  if (url.pathname === "/api/health") {
    const hasKey = Boolean(process.env.DEEPSEEK_API_KEY);
    return send(res, 200, {
      ok: true,
      model: hasKey ? process.env.DEEPSEEK_MODEL || "deepseek-flash" : null,
      jev: Boolean(process.env.TYPESAFE_API_KEY),
      stream: true,
      // diagnóstico de despliegue: nunca expone valores, sólo largos
      build: {
        node: process.version,
        deploy: process.env.RAILWAY_DEPLOYMENT_ID ? "railway" : "local",
        commit: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
        env: {
          deepseek: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.length : 0,
          typesafe: process.env.TYPESAFE_API_KEY ? process.env.TYPESAFE_API_KEY.length : 0,
          variables: Object.keys(process.env).filter((k) => /KEY|TOKEN|SECRET|RAILWAY/.test(k)).length,
        },
      },
    });
  }

  if (url.pathname === "/api/diagnosticos") {
    try {
      const { adaptProject, veredictoGlobal, PROJECTS } = await import("./public/diagnostic.mjs");
      const out = [];
      for (const p of PROJECTS) {
        const raw = await readData(p.id + ".json").catch(() => null);
        const proyecto = adaptProject(raw, p);
        out.push({ ...proyecto, veredicto: veredictoGlobal(proyecto) });
      }
      return send(res, 200, { projects: out });
    } catch (e) {
      return send(res, 500, { error: "diagnosticos_failed", detail: String(e.message).slice(0, 200) });
    }
  }

  if (url.pathname === "/api/email/status") {
    return send(res, 200, mailerStatus());
  }

  if (url.pathname === "/api/email/check" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    if (!body || !Array.isArray(body.emails)) return send(res, 400, { error: "bad_request" });
    if (body.emails.length > 25) return send(res, 400, { error: "too_many" });
    try {
      const results = await checkMany(body.emails.map((e) => String(e).slice(0, 200)));
      return send(res, 200, { results });
    } catch {
      return send(res, 500, { error: "check_failed" });
    }
  }

  if (url.pathname === "/api/email/send" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    if (!body) return send(res, 400, { error: "bad_json" });

    // Límite simple: 5 envíos por minuto por proceso.
    if (!limiter("email", 5, 60_000)) return send(res, 429, { error: "rate_limited" });

    const to = [...new Set((body.to || []).map((e) => String(e).trim()).filter(Boolean))];
    const cc = [...new Set((body.cc || []).map((e) => String(e).trim()).filter(Boolean))];
    if (!to.length) return send(res, 400, { error: "sin_destinatarios" });
    if (to.length + cc.length > 10) return send(res, 400, { error: "demasiados_destinatarios" });

    const results = await checkMany([...to, ...cc]);
    const bad = results.filter((r) => !r.ok);
    if (bad.length) return send(res, 422, { error: "destinatarios_invalidos", results });

    let spec = body.spec;
    try {
      if (JSON.stringify(spec ?? null).length > 200_000) throw new Error("too_big");
    } catch {
      return send(res, 400, { error: "spec_invalido" });
    }
    if (!spec || typeof spec !== "object") return send(res, 400, { error: "sin_spec" });

    const report = renderReport({
      question: String(body.question || "").slice(0, 500),
      spec,
      at: body.at,
      cost: body.cost,
      fx: body.fx,
      note: String(body.note || "").slice(0, 200),
    });

    try {
      const out = await sendMail({ to, cc, subject: report.subject, html: report.html, text: report.text });
      if (!out.ok) return send(res, 502, out);
      return send(res, 200, { ...out, subject: report.subject, recipients: [...to, ...cc] });
    } catch (e) {
      return send(res, 502, { error: "send_failed", detail: String(e.message).slice(0, 200) });
    }
  }

  if (url.pathname === "/api/ask" && req.method === "POST") {
    let input;
    try {
      input = await readBody(req);
    } catch {
      return send(res, 400, { error: "bad json" });
    }
    if (!input) return send(res, 400, { error: "empty question" });
    const { question, params } = input;

    // Compatibilidad: consumidores viejos siguen recibiendo un JSON único.
    if (url.searchParams.get("mode") === "json") {
      try {
        const graph = await readGraph();
        const entries = await getCache().catch(() => []);
        return send(res, 200, await runPipeline({ question, graph, params, emit: trace, deps: { cache: (q) => lookupCache(entries, q) } }));
      } catch (e) {
        return send(res, 500, { error: "pipeline_failed", message: String(e.message).slice(0, 200) });
      }
    }

    return streamAsk(req, res, question, params);
  }

  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
  serveStatic(req, res, url.pathname === "/" ? "/index.html" : url.pathname);
}

const server = createServer(handleRequest).listen(PORT, () => {
  // En un hosting el puerto y la dirección importan: quedan en el log.
  const addr = server.address();
  const donde = typeof addr === "object" && addr ? `${addr.address}:${addr.port}` : String(PORT);
  const entorno = process.env.RAILWAY_ENVIRONMENT ? "railway" : "local";
  const commit = (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || "sin-commit";

  console.log(`\n  Diagnóstico agéntico  →  http://localhost:${PORT}`);
  console.log(`  escuchando en ${donde} · entorno ${entorno} · commit ${commit}`);
  console.log(`  ${process.env.DEEPSEEK_API_KEY ? "DeepSeek conectado" : "Sin DEEPSEEK_API_KEY: modo demo por palabras clave"}`);
  console.log(`  SSE activo · ${process.env.DEEPSEEK_API_KEY ? "" : "sin "}stream\n`);
});

// señales del hosting: se registra el cierre para saber quién lo pidió
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[arranque] recibí ${sig}: cerrando`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `\n  El puerto ${PORT} ya está en uso.\n` +
        `  Cerrá el proceso anterior o levantá en otro puerto:\n\n` +
        `    PORT=${PORT + 1} node server.mjs\n`
    );
    process.exit(1);
  }
  throw e;
});
