import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Envío de correo con dos drivers.
 *  - dry (por defecto): escribe el correo en .mail/ y no contacta a nadie.
 *  - smtp: Nodemailer (ACS, Gmail, M365, cualquier SMTP con auth simple).
 *
 * El remitente SIEMPRE sale del entorno, nunca de lo que pida el modelo.
 */

const FROM = process.env.MAIL_FROM || "Diagnóstico Steel and Glass <DoNotReply@azurecomm.net>";
const DRY = process.env.DRY_RUN !== "0";

export function mailerStatus() {
  return {
    dryRun: DRY,
    from: FROM,
    host: process.env.MAIL_HOST || null,
    ready: DRY || Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS),
  };
}

let transport = null;
async function smtp() {
  if (transport) return transport;
  const { default: nodemailer } = await import("nodemailer");

  transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === "1",
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });

  await transport.verify();
  return transport;
}

function slug(s) {
  return String(s || "reporte")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function sendMail({ to, cc = [], subject, html, text }) {
  const status = mailerStatus();
  if (!status.ready) {
    return { ok: false, error: "mailer_no_configurado", detail: "Faltan MAIL_HOST / MAIL_USER / MAIL_PASS." };
  }

  const recipients = [...to, ...cc];
  if (!recipients.length) return { ok: false, error: "sin_destinatarios" };

  if (DRY) {
    const dir = join(process.cwd(), ".mail");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(dir, `${stamp}-${slug(subject)}`);
    await writeFile(`${base}.html`, html, "utf8");
    await writeFile(`${base}.txt`, text, "utf8");
    await writeFile(
      `${base}.json`,
      JSON.stringify({ to, cc, from: FROM, subject, savedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    return { ok: true, dry: true, id: `dry-${stamp}`, file: `${base}.html` };
  }

  const t = await smtp();
  const info = await t.sendMail({
    from: FROM,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    text,
    html,
    headers: { "X-Diagnostico": "steel-and-glass" },
  });

  return { ok: true, dry: false, id: info.messageId };
}
