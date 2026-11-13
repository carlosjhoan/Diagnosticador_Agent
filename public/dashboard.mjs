/**
 * Home del dashboard: secuencia en tres tiempos.
 *   1. el copy de arriba se escribe de arriba hacia abajo
 *   2. las tarjetas se posan como esqueletos
 *   3. aparece el contenido, se llena el anillo y corre el contador
 */

import { esc } from "./esc.mjs";

const ICON = {
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 6.5"/></svg>',
  half: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /></svg>',
  cross: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

/** Escribe texto carácter por carácter. Resuelve al terminar. */
function type(el, text, msPerChar = 22) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    el.textContent = "";
    let i = 0;
    const tick = () => {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(tick, msPerChar);
      else resolve();
    };
    tick();
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function cardHtml(p, i) {
  const v = p.veredicto || {};
  const negocio = (v.negocio && v.negocio.pct) || 0;
  const produccion = (v.cobertura && v.cobertura.pct) || 0;

  const barra = (clave, etiqueta, pct, detalle) => `
    <div class="pbar" data-k="${clave}">
      <span class="pbar-label">${etiqueta}</span>
      <span class="pbar-val"><b data-to="${pct}">0</b>%</span>
      <span class="pbar-track"><i data-to="${pct}"></i></span>
      <span class="pbar-count">${detalle}</span>
    </div>`;

  return `<article class="pcard is-skel" data-project="${esc(p.id)}" style="--i:${i}">
    <div class="pcard-inner">
      <header class="pcard-top">
        <h3 class="pcard-name" data-type="${esc(p.nombre)}"></h3>
        <span class="pcard-badge" data-state="${esc(v.estado || "sin-diagnostico")}">${esc(v.estadoTexto || v.etiqueta || "sin diagnosticar")}</span>
      </header>

      <p class="pcard-line" data-type="${esc(p.linea || "")}"></p>

      <div class="pcard-bars">
        ${barra(
          "negocio",
          "Cumple el negocio",
          negocio,
          `${v.negocio?.completos ?? 0} completos · ${v.negocio?.parciales ?? 0} parciales de ${v.negocio?.total ?? 0}`
        )}
        ${barra(
          "prod",
          "Listo para producción",
          produccion,
          `${v.cobertura?.incluidos ?? 0} de ${v.cobertura?.total ?? 0} aguantan fallos`
        )}
      </div>

      <footer class="pcard-foot">
        <button type="button" class="pcard-go" data-explore="${esc(p.id)}">Explorar →</button>
      </footer>
    </div>
  </article>`;
}

export function renderDashboard(host, projects, onExplore) {
  host.innerHTML = `<div class="home">
    <div class="home-head">
      <span class="b-eyebrow" id="home-kicker"></span>
      <h1 class="home-title" id="home-title"></h1>
      <p class="home-sub" id="home-sub"></p>
    </div>
    <div class="home-cards">
      ${projects.map(cardHtml).join("")}
    </div>
  </div>`;

  host.querySelectorAll("[data-explore]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onExplore?.(btn.dataset.explore);
    });
  });
}

/* ---------- secuencia ---------- */

const frase = {
  kicker: "diagnóstico · tres proyectos",
  title: "Soy el diagnosticador.",
  sub: "¿Qué proyecto quieres explorar?",
};

/** 1) copy de arriba hacia abajo · 2) tarjetas · 3) contenido, anillo y contador */
export async function reveal(host) {
  if (reduceMotion()) return finish(host);

  await type(host.querySelector("#home-kicker"), frase.kicker, 14);
  await wait(140);
  await type(host.querySelector("#home-title"), frase.title, 26);
  await wait(140);
  await type(host.querySelector("#home-sub"), frase.sub, 18);

  await wait(160);

  // Recién acá aparecen las tarjetas: primero el copy completo.
  host.querySelector(".home")?.classList.add("is-cards");

  const cards = [...host.querySelectorAll(".pcard")];
  cards.forEach((c, i) => {
    setTimeout(() => {
      c.classList.add("is-landing");
      c.classList.remove("is-skel");
    }, i * 110);
  });

  await wait(cards.length * 110 + 420);

  finish(host);
}

/** 3) contenido + anillo + contador. También sirve para saltar la animación. */
export function finish(host) {
  const kicker = host.querySelector("#home-kicker");
  const title = host.querySelector("#home-title");
  const sub = host.querySelector("#home-sub");
  if (kicker) kicker.textContent = frase.kicker;
  if (title) title.textContent = frase.title;
  if (sub) sub.textContent = frase.sub;

  host.querySelector(".home")?.classList.add("is-cards");

  const cards = [...host.querySelectorAll(".pcard")];
  cards.forEach((c) => {
    c.classList.remove("is-skel");
    c.classList.add("is-landing", "is-ready");
  });

  // el copy interno de cada tarjeta también se escribe
  const tipear = reduceMotion() ? null : host;
  host.querySelectorAll("[data-type]").forEach((el, i) => {
    const texto = el.dataset.type || "";
    if (!tipear) el.textContent = texto;
    else setTimeout(() => type(el, texto, 16), i * 40);
  });

  const barras = [...host.querySelectorAll(".pbar-track i")];
  const valores = [...host.querySelectorAll(".pbar-val b")];

  const llenar = () => {
    barras.forEach((bar, i) => {
      const to = Number(bar.dataset.to || 0);
      setTimeout(() => (bar.style.width = to + "%"), i * 110);
    });

    if (reduceMotion()) {
      valores.forEach((n) => (n.textContent = n.dataset.to || "0"));
      return;
    }

    const t0 = performance.now();
    const dur = 820;
    const paso = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      valores.forEach((n) => (n.textContent = String(Math.round(Number(n.dataset.to || 0) * e))));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  };

  setTimeout(llenar, reduceMotion() ? 0 : 260);

  // El compositor se despliega como una ventana, después del contenido.
  setTimeout(
    () => document.body.classList.add("composer-ready"),
    reduceMotion() ? 0 : 620
  );
}

/**
 * Cortina: dos hojas opacas. El home no se ve hasta que abren.
 * Al abrirse el 42% arranca la secuencia.
 */
export function playWindowOpen(host, { ms = 1700 } = {}) {
  if (reduceMotion()) {
    finish(host);
    return null;
  }

  const veil = document.createElement("div");
  veil.className = "wopen";
  veil.innerHTML = `
    <div class="wopen-pane" data-side="left"></div>
    <div class="wopen-pane" data-side="right"></div>
    <img class="wopen-mark" src="./assets/logo-mark.png" alt="" aria-hidden="true" />`;
  host.appendChild(veil);
  host.classList.add("is-veiled");

  let arrancado = false;
  const arrancar = () => {
    if (arrancado) return;
    arrancado = true;
    host.classList.add("is-opening");
    reveal(host);
  };

  const revealTimer = setTimeout(arrancar, Math.round(ms * 0.42));

  const done = () => {
    veil.classList.add("is-out");
    host.classList.remove("is-veiled");
    setTimeout(() => veil.remove(), 280);
    window.removeEventListener("keydown", skip);
    host.removeEventListener("pointerdown", skip);
  };
  const skip = () => {
    clearTimeout(revealTimer);
    host.classList.remove("is-veiled");
    finish(host);
    done();
  };
  window.addEventListener("keydown", skip, { once: true });
  host.addEventListener("pointerdown", skip, { once: true });

  requestAnimationFrame(() => veil.classList.add("is-open"));
  setTimeout(() => {
    clearTimeout(revealTimer);
    arrancar();
    done();
  }, ms);

  return veil;
}
