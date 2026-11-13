import { promises as dns } from "node:dns";
import { localVerdict, domainOf } from "../public/email.mjs";

const TTL = 10 * 60 * 1000;
const cache = new Map();

function timed(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms).unref?.()),
  ]);
}

async function domainState(domain) {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.state;

  let state;
  try {
    const mx = await timed(dns.resolveMx(domain), 2500);
    state = { ok: mx.length > 0, kind: mx.length ? "mx" : "sin-mx" };
  } catch (e) {
    if (e.code === "ENOTFOUND" || e.code === "ENODATA") {
      // RFC: sin MX se puede intentar el A. En la práctica casi nunca entrega,
      // pero evita marcar como muerto un dominio que sí resuelve.
      try {
        const a = await timed(dns.resolve4(domain), 2000);
        state = a.length ? { ok: true, kind: "dudoso" } : { ok: false, kind: "sin-dominio" };
      } catch {
        state = { ok: false, kind: "sin-dominio" };
      }
    } else {
      state = { ok: true, kind: "dudoso" };
    }
  }

  cache.set(domain, { at: Date.now(), state });
  return state;
}

/** Veredicto completo de una dirección: sintaxis + dominio + MX (cacheados). */
export async function checkEmail(raw) {
  const local = localVerdict(raw);
  if (!local.ok) return local;

  const domain = domainOf(local.email);
  const state = await domainState(domain);
  if (!state.ok) return { ...local, ok: false, reason: state.kind };
  if (state.kind === "dudoso") return { ...local, ok: true, reason: "dudoso" };
  return local;
}

export async function checkMany(list) {
  const unique = [...new Set((list || []).map((e) => String(e).trim()).filter(Boolean))];
  return Promise.all(unique.map((e) => checkEmail(e)));
}
