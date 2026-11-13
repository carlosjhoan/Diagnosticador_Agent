// Recarga el navegador cuando cambia un archivo de public/.
// Equivale al HMR de Vite, pero con node:fs + SSE, sin dependencias.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const es = new EventSource("./api/livereload");
  es.addEventListener("message", (e) => {
    if (e.data === "reload") location.reload();
  });
}
