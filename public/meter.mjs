// Nivel real del micrófono para animar el indicador. Si falla, el CSS alcanza.

export async function startMeter(onLevel) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    src.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let level = 0;
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      const raw = Math.min(1, sum / data.length / 70);
      level = level * 0.7 + raw * 0.3;
      try {
        onLevel(level);
      } catch {
        /* el callback no debe cortar el loop */
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch?.(() => {});
      },
    };
  } catch {
    return null;
  }
}
