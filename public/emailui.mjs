/**
 * Modal "enviar por correo": destinatarios con chips, validación en vivo
 * y confirmación antes de disparar el envío.
 */

import { splitList, localVerdict, labelFor } from "./email.mjs";
import { esc } from "./esc.mjs";

const API = {
  status: "/api/email/status",
  check: "/api/email/check",
  send: "/api/email/send",
};

let ctx = null;
let recipients = [];
let status = null;

const el = (id) => document.getElementById(id);

const ICON_OK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 6.5"/></svg>';
const ICON_BAD = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function chipHtml(r, i) {
  const cls = r.checking ? "is-checking" : r.ok ? "is-ok" : "is-bad";
  const tip = labelFor(r.reason);
  const mark = r.checking ? "" : r.ok ? ICON_OK : ICON_BAD;

  // El estado se ve sin hover: check verde o cruz roja dentro del chip.
  // El motivo solo ocupa espacio cuando hay algo que corregir.
  const why = !r.checking && !r.ok && r.reason !== "typo" ? `<span class="chip-why">${esc(tip)}</span>` : "";
  const fix = r.suggestion
    ? `<button type="button" class="chip-fix" data-fix="${i}">usar ${esc(r.suggestion)}</button>`
    : "";

  return `<span class="chip ${cls}" title="${esc(tip)}">
    <span class="chip-text">${esc(r.email)}</span>
    ${why}${fix}
    <span class="chip-ico" aria-hidden="true">${mark}</span>
    <button type="button" class="chip-x" data-del="${i}" aria-label="Quitar ${esc(r.email)}">×</button>
  </span>`;
}

function renderChips() {
  const box = el("em-chips");
  if (!box) return;
  box.innerHTML = recipients.map(chipHtml).join("");
  const inp = el("em-input");
  if (inp) inp.placeholder = recipients.length ? "" : "nombre@empresa.com";
  updateSend();
}

function updateSend() {
  const btn = el("em-send");
  if (!btn) return;
  const checking = recipients.some((r) => r.checking);
  const bad = recipients.some((r) => !r.ok && !r.checking);
  btn.disabled = !recipients.length || checking || bad || Boolean(ctx?.busy);
  el("em-hint").textContent = checking
    ? "verificando dominios…"
    : bad
    ? "hay correos con problemas"
    : recipients.length
    ? `${recipients.length} ${recipients.length === 1 ? "destinatario" : "destinatarios"}`
    : "";
}

async function addRecipients(raw) {
  const tokens = splitList(raw);
  if (!tokens.length) return;

  for (const raw of tokens) {
    const base = localVerdict(raw);
    const exists = recipients.some((r) => r.email === base.email);
    if (exists || !base.email) continue;

    const entry = { ...base, checking: base.ok };
    recipients.push(entry);
    renderChips();

    if (!base.ok) continue;

    fetch(API.check, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: [base.email] }),
    })
      .then((r) => r.json())
      .then((data) => {
        const res = data.results?.[0];
        if (!res) return;
        Object.assign(entry, res, { checking: false });
        renderChips();
      })
      .catch(() => {
        entry.checking = false;
        renderChips();
      });
  }
  renderChips();
}

function reset() {
  recipients = [];
  el("em-note").value = "";
  el("em-input").value = "";
  el("em-result").innerHTML = "";
  el("em-hint").textContent = "";
  renderChips();
}

export async function openEmail(turn, prefill = {}) {
  ctx = { turn, busy: false };
  reset();

  const dlg = el("email");
  if (!dlg || dlg.open) return;

  if (!status) {
    status = await fetch(API.status).then((r) => r.json()).catch(() => null);
  }

  const preview = el("em-preview");
  if (preview) preview.textContent = turn?.spec?.title || "esta conversación";

  const dryLine = el("em-dry");
  if (dryLine) {
    dryLine.hidden = !status?.dryRun;
    dryLine.textContent = status?.dryRun
      ? "Modo prueba: el correo se guarda en .mail/ y no sale a nadie."
      : "";
  }

  el("em-subject").value = (turn?.spec?.title || "Diagnóstico").slice(0, 90);
  if (prefill.nota) el("em-note").value = String(prefill.nota).slice(0, 120);

  dlg.showModal();

  // Si el modelo ya extrajo destinatarios, entran como chips y se validan igual.
  if (Array.isArray(prefill.to) && prefill.to.length) addRecipients(prefill.to.join(" "));
  setTimeout(() => el("em-input")?.focus(), 30);
}

async function send() {
  if (!ctx?.turn || ctx.busy) return;
  const t = ctx.turn;
  ctx.busy = true;
  updateSend();

  const btn = el("em-send");
  const original = btn.textContent;
  btn.textContent = "Enviando…";
  el("em-result").innerHTML = "";

  try {
    const res = await fetch(API.send, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: recipients.filter((r) => r.ok).map((r) => r.email),
        subject: el("em-subject").value,
        note: el("em-note").value,
        question: t.pregunta,
        spec: t.spec,
        at: t.at,
        cost: t.costo,
        fx: t.fx,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      el("em-result").innerHTML = `<p class="em-error">${esc(
        data.error === "destinatarios_invalidos"
          ? "Hay correos que no se pueden entregar."
          : data.error === "rate_limited"
          ? "Demasiados envíos seguidos. Esperá un minuto."
          : data.detail || "No se pudo enviar."
      )}</p>`;
    } else {
      el("em-result").innerHTML = `<p class="em-ok">${esc(
        data.dry
          ? `Guardado en modo prueba · ${data.recipients.length} destinatario(s)`
          : `Enviado a ${data.recipients.length} destinatario(s)`
      )}</p>`;
      setTimeout(() => el("email")?.close(), 1100);
    }
  } catch (e) {
    el("em-result").innerHTML = `<p class="em-error">${esc(String(e.message || e))}</p>`;
  } finally {
    ctx.busy = false;
    btn.textContent = original;
    updateSend();
  }
}

export function mountEmail() {
  const dlg = el("email");
  if (!dlg) return;

  const input = el("em-input");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (!input.value.trim()) return;
      e.preventDefault();
      addRecipients(input.value);
      input.value = "";
    } else if (e.key === "Backspace" && !input.value && recipients.length) {
      recipients.pop();
      renderChips();
    }
  });

  input?.addEventListener("blur", () => {
    if (input.value.trim()) {
      addRecipients(input.value);
      input.value = "";
    }
  });

  dlg.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (text.includes("@") && splitList(text).length > 1) {
      e.preventDefault();
      addRecipients(text);
    }
  });

  dlg.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      recipients.splice(Number(del.dataset.del), 1);
      renderChips();
      return;
    }
    const fix = e.target.closest("[data-fix]");
    if (fix) {
      const r = recipients[Number(fix.dataset.fix)];
      if (r?.suggestion) {
        Object.assign(r, localVerdict(r.suggestion), { checking: true });
        renderChips();
        fetch(API.check, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emails: [r.email] }),
        })
          .then((res) => res.json())
          .then((data) => {
            Object.assign(r, data.results?.[0] || {}, { checking: false });
            renderChips();
          })
          .catch(() => {
            r.checking = false;
            renderChips();
          });
      }
      return;
    }
    if (e.target.closest("#em-send")) send();
  });

  el("em-cancel")?.addEventListener("click", () => dlg.close());
  el("em-close")?.addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => {
    ctx = null;
  });
}
