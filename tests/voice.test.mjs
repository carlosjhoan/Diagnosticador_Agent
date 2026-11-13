import test from "node:test";
import assert from "node:assert/strict";
import { appendText, createVoice } from "../public/voice.mjs";

test("el texto dictado se agrega al existente", () => {
  assert.equal(appendText("", "qué riesgos corro"), "qué riesgos corro");
  assert.equal(appendText("qué riesgos", "corro en el comercial"), "qué riesgos corro en el comercial");
});

test("no deja espacios duplicados ni colas vacías", () => {
  assert.equal(appendText("qué riesgos   ", "  corro  "), "qué riesgos corro");
  assert.equal(appendText("algo", ""), "algo");
  assert.equal(appendText("algo", "   "), "algo");
  assert.equal(appendText(null, "texto"), "texto");
});

test("createVoice devuelve null si el navegador no soporta STT", () => {
  const prev1 = globalThis.SpeechRecognition;
  const prev2 = globalThis.webkitSpeechRecognition;
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  assert.equal(createVoice({}), null);
  if (prev1) globalThis.SpeechRecognition = prev1;
  if (prev2) globalThis.webkitSpeechRecognition = prev2;
});

test("createVoice entrega el texto final y nunca lo envía solo", () => {
  class FakeRecognition {
    constructor() {
      this.continuous = true;
      this.interimResults = false;
      FakeRecognition.last = this;
    }
    start() {
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
  }

  const prev = globalThis.SpeechRecognition;
  globalThis.SpeechRecognition = FakeRecognition;

  const finals = [];
  const states = [];
  const voice = createVoice({ onFinal: (t) => finals.push(t), onState: (s) => states.push(s) });

  assert.ok(voice);
  assert.equal(FakeRecognition.last.continuous, true, "debe sobrevivir las pausas");
  assert.equal(FakeRecognition.last.interimResults, true);

  voice.start();
  assert.equal(states.at(-1), "listening");

  FakeRecognition.last.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "hola mundo" }], { isFinal: true })],
  });

  assert.deepEqual(finals, ["hola mundo"], "entrega el texto y no dispara envío");

  globalThis.SpeechRecognition = prev;
});

test("en continuo, un cierre inesperado reabre el micrófono solo", async () => {
  class FakeRecognition {
    constructor() {
      this.starts = 0;
      FakeRecognition.last = this;
    }
    start() {
      this.starts++;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
  }

  const prev = globalThis.SpeechRecognition;
  globalThis.SpeechRecognition = FakeRecognition;

  const states = [];
  const voice = createVoice({ onState: (s) => states.push(s), restartDelay: 10 });

  voice.start();
  assert.equal(FakeRecognition.last.starts, 1);

  FakeRecognition.last.onend(); // Chrome cierra por silencio
  assert.equal(states.at(-1), "reconnecting");

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(FakeRecognition.last.starts, 2, "debe reabrir solo");
  assert.equal(voice.active, true);

  voice.stop();
  assert.equal(voice.active, false);
  assert.equal(states.at(-1), "idle");

  globalThis.SpeechRecognition = prev;
});

test("no reabre si el usuario ya cortó", async () => {
  class FakeRecognition {
    constructor() {
      this.starts = 0;
      FakeRecognition.last = this;
    }
    start() {
      this.starts++;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
  }
  const prev = globalThis.SpeechRecognition;
  globalThis.SpeechRecognition = FakeRecognition;

  const voice = createVoice({ restartDelay: 10 });
  voice.start();
  voice.stop();
  FakeRecognition.last.onend();

  await new Promise((r) => setTimeout(r, 30));
  assert.equal(FakeRecognition.last.starts, 1, "no debe reabrir tras stop");

  globalThis.SpeechRecognition = prev;
});
