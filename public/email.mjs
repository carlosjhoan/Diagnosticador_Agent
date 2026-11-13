/**
 * Validación de correos, compartida por navegador y servidor.
 * Puro: no toca red. El MX se consulta en server/email-check.mjs.
 */

const SYNTAX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "yopmail.com", "throwawaymail.com", "sharklasers.com", "temp-mail.org",
  "getnada.com", "maildrop.cc", "dispostable.com", "trashmail.com",
]);

const ROLE = new Set([
  "info", "ventas", "sales", "soporte", "support", "admin", "contacto",
  "contact", "hola", "hello", "noreply", "no-reply", "facturacion", "billing",
]);

const TYPO = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gnail.com": "gmail.com", "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "outlok.com": "outlook.com",
  "outlook.co": "outlook.com", "yahoo.co": "yahoo.com", "yaho.com": "yahoo.com",
  "icloud.co": "icloud.com", "protonmal.com": "protonmail.com", "steelandglas.com": "steelandglass.com",
};

/** Corta una cadena en direcciones: comas, punto y coma, espacios o saltos. */
export function splitList(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalize(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function domainOf(email) {
  const i = email.lastIndexOf("@");
  return i < 0 ? "" : email.slice(i + 1).toLowerCase();
}

/** Devuelve { ok, reason } sin consultar DNS. */
export function localVerdict(raw) {
  const email = normalize(raw);

  if (!email) return { email, ok: false, reason: "vacio" };
  if (email.length > 254) return { email, ok: false, reason: "largo" };
  if (!SYNTAX.test(email)) return { email, ok: false, reason: "formato" };

  const [local, domain] = email.split("@");
  if (local.length > 64) return { email, ok: false, reason: "largo" };
  if (DISPOSABLE.has(domain)) return { email, ok: false, reason: "descartable", suggestion: TYPO[domain] };

  const hint = TYPO[domain];
  if (hint) return { email, ok: false, reason: "typo", suggestion: `${local}@${hint}` };

  if (ROLE.has(local)) return { email, ok: true, reason: "rol" };
  return { email, ok: true, reason: "ok" };
}

export const COPY = {
  ok: "válido",
  rol: "buzón compartido",
  vacio: "escribe un correo",
  formato: "falta el @ o el dominio",
  largo: "demasiado largo",
  descartable: "dominio temporal",
  typo: "parece un error de tipeo",
  "sin-mx": "el dominio no recibe correos",
  "sin-dominio": "el dominio no existe",
  dudoso: "no pudimos confirmar el dominio",
};

export function labelFor(reason) {
  return COPY[reason] || "revisá el correo";
}
