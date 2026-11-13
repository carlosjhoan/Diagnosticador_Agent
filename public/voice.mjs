// Speech-to-text continuo con la Web Speech API.
// El usuario decide cuándo termina; las pausas no cortan la sesión.

export function appendText(base, spoken) {
  const a = String(base || "").trimEnd();
  const b = String(spoken || "").trim();
  if (!b) return a;
  if (!a) return b;
  return a + " " + b;
}

export function createVoice({
  onPartial,
  onFinal,
  onState,
  onError,
  lang = "es-CO",
  maxMs = 120000,
  restartDelay = 160,
} = {}) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true; // hablar largo, sin cortar por pausa
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let want = false;
  let running = false;
  let startedAt = 0;
  let reconnect = null;

  const emit = (fn, arg) => {
    try {
      if (typeof fn === "function") fn(arg);
    } catch {
      /* un callback roto no corta el reconocimiento */
    }
  };

  const safeStart = () => {
    try {
      rec.start();
    } catch {
      /* start() dos veces seguidas lanza; se ignora */
    }
  };

  rec.onstart = () => {
    running = true;
    emit(onState, "listening");
  };

  // En continuo, Chrome cierra tras un silencio largo. Si el usuario sigue
  // queriendo hablar, se reabre sin que tenga que volver a tocar el micrófono.
  rec.onend = () => {
    running = false;
    if (want && Date.now() - startedAt < maxMs) {
      emit(onState, "reconnecting");
      reconnect = setTimeout(() => {
        if (want) safeStart();
      }, restartDelay);
      return;
    }
    want = false;
    emit(onState, "idle");
  };

  rec.onerror = (e) => {
    const code = e?.error || "unknown";
    if (code === "no-speech" || code === "aborted") return; // normales en continuo
    want = false;
    running = false;
    emit(onState, "idle");
    emit(onError, code);
  };

  rec.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final) emit(onFinal, final.trim());
    if (interim) emit(onPartial, interim.trim());
    else emit(onPartial, "");
  };

  return {
    get active() {
      return want;
    },
    get running() {
      return running;
    },
    start() {
      if (want) return;
      want = true;
      startedAt = Date.now();
      safeStart();
    },
    stop() {
      want = false;
      clearTimeout(reconnect);
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      emit(onState, "idle");
    },
    toggle() {
      if (this.active) this.stop();
      else this.start();
    },
  };
}
