/**
 * Convierte un turno del deck en un correo HTML.
 * Email-safe: tablas y estilos inline, sin flex/grid/variables ni JS.
 */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const TONE = {
  critical: "#a83a2a",
  high: "#c2610f",
  medium: "#8a7b2a",
  info: "#4a5b6b",
  ok: "#3f6b45",
  in: "#3f6b45",
  out: "#6b6b6b",
  warn: "#a83a2a",
};

const css = {
  body: "margin:0;padding:0;background:#eef1f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#19233e;",
  wrap: "width:100%;background:#eef1f7;padding:28px 12px;",
  card: "max-width:640px;margin:0 auto;background:#fbfcff;border:1px solid #dee3ed;border-radius:12px;overflow:hidden;",
  head: "padding:22px 26px 18px;border-bottom:1px solid #e9edf4;",
  brand: "font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#5a6a8c;margin:0 0 10px;",
  title: "font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;margin:0;font-weight:400;",
  question: "margin:12px 0 0;font-size:12px;color:#5a6a8c;font-style:italic;",
  pad: "padding:8px 26px 26px;",
  story: "font-size:14px;line-height:1.6;margin:16px 0;color:#2b3350;",
  h2: "font-family:Georgia,'Times New Roman',serif;font-size:15px;margin:26px 0 8px;font-weight:400;color:#19233e;",
  th: "text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5a6a8c;padding:8px 10px;border-bottom:2px solid #dee3ed;",
  td: "font-size:12.5px;line-height:1.5;padding:9px 10px;border-bottom:1px solid #eef1f6;vertical-align:top;",
  foot: "padding:16px 26px 22px;border-top:1px solid #e9edf4;font-size:10.5px;line-height:1.6;color:#7b84a0;",
};

function table(columns, rows, firstHeader = "") {
  const head =
    `<tr>${firstHeader ? `<th style="${css.th}">${esc(firstHeader)}</th>` : ""}` +
    columns.map((c) => `<th style="${css.th}">${esc(c)}</th>`).join("") +
    `</tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="${css.td}">${esc(c)}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0 4px;">${head}${body}</table>`;
}

function block(b) {
  const t = b?.type;
  const p = b?.props || {};

  if (t === "heading") {
    return p.text ? `<h2 style="${css.h2}">${esc(p.text)}</h2>` : "";
  }

  if (t === "story") {
    return p.text ? `<p style="${css.story}">${esc(p.text)}</p>` : "";
  }

  if (t === "kpi-row" && Array.isArray(p.items)) {
    const cells = p.items
      .map(
        (i) =>
          `<td style="padding:12px 10px;text-align:center;border:1px solid #e9edf4;border-radius:8px;">
             <div style="font-family:Georgia,serif;font-size:20px;line-height:1.1;">${esc(i.value || "")}</div>
             <div style="font-size:10px;color:#5a6a8c;margin-top:4px;text-transform:uppercase;letter-spacing:.06em;">${esc(i.label || "")}</div>
           </td>`
      )
      .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px 0;margin:14px 0;"><tr>${cells}</tr></table>`;
  }

  if (t === "table" && Array.isArray(p.columns) && Array.isArray(p.rows)) {
    const cap = p.caption ? `<p style="font-size:11px;color:#5a6a8c;margin:0 0 4px;">${esc(p.caption)}</p>` : "";
    return cap + table(p.columns, p.rows.map((r) => (Array.isArray(r) ? r : [])));
  }

  if (t === "matrix" && Array.isArray(p.columns) && Array.isArray(p.rows)) {
    return table(
      p.columns,
      p.rows.map((r) => [r.label, ...(r.cells || [])]),
      " "
    );
  }

  if (t === "list" && Array.isArray(p.items)) {
    const items = p.items
      .map((i) => {
        const color = TONE[i.tone] || "#19233e";
        const tag = i.tag ? `<span style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:${color};margin-left:6px;">${esc(i.tag)}</span>` : "";
        return `<tr>
          <td style="width:3px;background:${color};"></td>
          <td style="padding:9px 0 9px 12px;border-bottom:1px solid #eef1f6;">
            <div style="font-size:13px;line-height:1.45;color:#19233e;"><strong style="font-weight:600;">${esc(i.title)}</strong>${tag}</div>
            ${i.text ? `<div style="font-size:12px;line-height:1.55;color:#4a5470;margin-top:3px;">${esc(i.text)}</div>` : ""}
            ${i.evidence ? `<div style="font-size:10px;color:#7b84a0;margin-top:4px;">${esc(i.evidence)}</div>` : ""}
          </td>
        </tr>`;
      })
      .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0;">${items}</table>`;
  }

  if (t === "pills" && Array.isArray(p.items)) {
    return `<p style="margin:12px 0;">${p.items
      .map(
        (i) =>
          `<span style="display:inline-block;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #dee3ed;color:${TONE[i.tone] || "#4a5470"};margin:0 6px 6px 0;">${esc(i.text)}</span>`
      )
      .join("")}</p>`;
  }

  if (t === "callout" && p.text) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>
      <td style="border-left:3px solid #5a6a8c;padding:10px 0 10px 14px;font-size:12.5px;line-height:1.55;color:#3b4661;">${esc(p.text)}</td>
    </tr></table>`;
  }

  if (t === "evidence" && Array.isArray(p.items)) {
    const rows = p.items
      .map(
        (i) =>
          `<div style="font-size:11.5px;line-height:1.5;color:#4a5470;padding:6px 0;border-bottom:1px solid #eef1f6;">
            <code style="font-size:11px;color:#19233e;">${esc(i.path || i.ref || "")}</code>${i.note ? ` — ${esc(i.note)}` : ""}
          </div>`
      )
      .join("");
    return rows ? `<div style="margin:10px 0;">${rows}</div>` : "";
  }

  // flow, stepper, timeline, flowanim, two-col: su forma visual no sobrevive
  // al correo, así que van como secuencia de texto.
  if (Array.isArray(p.steps)) {
    return `<p style="font-size:12px;line-height:1.6;color:#4a5470;">${p.steps
      .map((s, i) => `${i + 1}. ${esc(s.label || s.title || s.text || "")}`)
      .join("<br>")}</p>`;
  }

  return "";
}

export function renderReport({ question, spec, at, cost, fx, note, from }) {
  const title = String(spec?.title || "Diagnóstico").slice(0, 140);
  const subjects = [];
  if (note) subjects.push(String(note).replace(/[\r\n]+/g, " ").slice(0, 90));
  subjects.push(title);
  const subject = subjects.join(" · ").slice(0, 160);

  const body = [];
  body.push(`<p style="${css.story}">${esc(spec?.story || "")}</p>`);

  const layout = Array.isArray(spec?.layout) ? spec.layout : [];
  for (const b of layout) {
    if (b?.type === "controls") continue;
    body.push(block(b));
  }

  const fecha = at
    ? new Date(at).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })
    : "";

  const money =
    cost && Number(cost.usd) > 0
      ? `Costo de esta consulta: US$${Number(cost.usd).toFixed(4).replace(".", ",")}${
          fx && fx.usdToCop ? ` · $${Math.round(cost.usd * fx.usdToCop).toLocaleString("es-CO")} COP` : ""
        }.`
      : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="${css.body}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css.wrap}"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css.card}">
      <tr><td style="${css.head}">
        <p style="${css.brand}">steel and glass · diagnóstico agéntico</p>
        <h1 style="${css.title}">${esc(title)}</h1>
        ${question ? `<p style="${css.question}">“${esc(question)}”</p>` : ""}
      </td></tr>
      <tr><td style="${css.pad}">${body.filter(Boolean).join("")}</td></tr>
      <tr><td style="${css.foot}">
        ${fecha ? `Generado el ${esc(fecha)}.<br>` : ""}
        ${money ? `${esc(money)}<br>` : ""}
        Las cifras provienen del grafo de diagnóstico y de las métricas reales de ejecución.
        ${from ? `<br>Enviado desde ${esc(from)}.` : ""}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    title,
    question ? `"${question}"` : "",
    "",
    String(spec?.story || ""),
    "",
    ...layout
      .filter((b) => b?.type !== "controls")
      .map((b) => plainBlock(b))
      .filter(Boolean),
    "",
    fecha ? `Generado el ${fecha}.` : "",
    money,
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");

  return { subject, html, text };
}

function plainBlock(b) {
  const p = b?.props || {};
  if (b?.type === "heading") return `\n${p.text}\n${"-".repeat(Math.min(60, String(p.text || "").length))}`;
  if (b?.type === "story") return p.text || "";
  if (Array.isArray(p.items)) {
    return p.items
      .map((i) => `• ${i.title ? i.title + (i.text ? ": " + i.text : "") : i.text || i}`)
      .join("\n");
  }
  if (Array.isArray(p.rows)) {
    const head = Array.isArray(p.columns) ? p.columns.join(" | ") : "";
    const rows = p.rows.map((r) => (Array.isArray(r) ? r.join(" | ") : `${r.label} | ${(r.cells || []).join(" | ")}`));
    return [head, ...rows].filter(Boolean).join("\n");
  }
  if (p.text) return p.text;
  if (Array.isArray(p.steps)) return p.steps.map((s, i) => `${i + 1}. ${s.label || s.title || s.text || ""}`).join("\n");
  return "";
}
