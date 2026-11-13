# TODO — Refactor de presentación agéntica

Seguimiento del plan por fases. Una fase se cierra sólo si cumple las tres condiciones:

1. `node --test tests/` verde
2. un caso demo concreto que se pueda mostrar
3. rollback de un solo archivo

---

## Estado

| Fase | Alcance | Estado | Fecha |
|---|---|---|---|
| 0 | Red de seguridad | **completa** | 2026-11-11 |
| 1 | Event bus + SSE | **completa** | 2026-11-11 |
| 2 | Run trace | **completa** | 2026-11-11 |
| 3 | Streaming de texto | **completa** | 2026-11-11 |
| 4 | View Transitions + skeleton | **completa** | 2026-11-11 |
| 5 | Registro de componentes | **completa** | 2026-11-11 |
| 6 | Stepper animado | **completa** | 2026-11-11 |
| 7 | Flowanim (Mermaid) | **completa** | 2026-11-11 |
| 8 | Inputs y controles (faceta) | **completa** | 2026-11-11 |
| 9 | Endurecimiento + costo | **completa** | 2026-11-11 |

---

## Fase 0 — Red de seguridad

- [x] Extraer la orquestación a `pipeline.mjs` con `runPipeline({ question, graph, emit, deps })`
- [x] Mover clientes de modelo a `models.mjs` (DeepSeek, Jev, fallback determinista)
- [x] Dejar `server.mjs` como adaptador HTTP (~120 líneas)
- [x] Contrato de evento versionado (`{v, seq, t, type, data}`) emitido por el pipeline
- [x] `emit` ya se llama en cada hito (hoy sólo loguea con `DEBUG_PIPE=1`)
- [x] `tests/pipeline.test.mjs` — 11 casos con modelos mockeados, sin red
- [x] `scripts/capture-golden.mjs` — 10 respuestas reales congeladas en `tests/golden/`
- [x] `tests/golden.test.mjs` — contrato de salida + 2 invariantes
- [x] Mover `scope.test.mjs` a `tests/` para un comando único
- [x] Verificar paridad de comportamiento con el sistema previo

**Regresión encontrada y corregida en esta fase:** el compositor recibía `graph = undefined` y le mandaba `"GRAFO: undefined"` a DeepSeek. Los tests unitarios no la vieron (inyectaban `compose`); la vio el golden capture contra el servidor real. Es exactamente para lo que existe la fase.

**Deuda conocida capturada en los goldens** (no es un bug del refactor, es calidad del modelo):
- `04-esperado` devuelve `gaps` donde se esperaba `scope` o `compare`
- `10-mixta` compone `scope` y la auditoría descarta la narrativa (`rejected`)

Se resuelven en Fase 5 (registro + prompt), y el diff de goldens va a mostrar la mejora.

---

## Fase 1 — Event bus + SSE

- [x] `POST /api/ask` responde `text/event-stream`
- [x] Escribir `data: <json>\n\n` por evento + heartbeat cada 15 s
- [x] `POST /api/ask?mode=json` mantiene la respuesta vieja (compatibilidad)
- [x] Cliente: `fetch` + `getReader()` + parser de frames SSE
- [x] `dispatch(event)` central en el front (`state.events` acumula; Fase 2 lo pinta)
- [x] Timeout por etapa (`STAGE_TIMEOUT_MS`, 20 s por defecto) → `stage.failed` con la etapa
- [x] Verificado que el stream llega incremental (primer evento a 2 ms de 6 s totales)

**Gotcha resuelto:** la señal fiable de desconexión es `res.on("close")`, no `req.on("close")`. Sobre `IncomingMessage`, `close` puede dispararse al terminar de leer el body y dejar el stream mudo.

**Contrato:** los eventos del pipeline viajan como `data:` sin nombre; el resultado final llega como `event: result` con `{spec}`; un fallo total como `event: error`.

**Demo de cierre:** `node scripts/smoke-sse.mjs` → 8 eventos en orden, resultado idéntico al modo JSON.

---

## Fase 2 — Run trace

- [x] Componente `trace` colapsable debajo del mensaje del usuario
- [x] Estados `pending` / `done` / `failed` / `warn` con ms reales del evento
- [x] Detalle expandible con payload crudo (scores, tokens, modelo)
- [x] Chips de intención con dentro/fuera de alcance
- [x] Autoscroll sólo si el usuario está abajo; si subió, botón "hay novedades ↓"
- [x] Una traza expandida a la vez: al preguntar de nuevo se colapsa la anterior
- [x] `prefers-reduced-motion` desactiva el pulso

**Nota de alcance:** los chips de intención llegan juntos en `scope.resolved` (el pipeline las resuelve en un solo request a Jev), así que aparecen a la vez con pop-in, no una por una. Hacerlas progresivas requeriría un evento por intención.

**Arquitectura:** el render de la fila es una función pura (`traceRowHtml`) en `public/trace-labels.mjs`, compartida con los tests. `app.js` pasó a `<script type="module">`.

**Tests nuevos:** `tests/trace-labels.test.mjs` (cobertura de etiquetas contra los eventos reales del pipeline) y `tests/trace-render.test.mjs` (HTML, chips, escapado de XSS). Total: **40 tests**.

**Demo de cierre:** preguntar y ver la traza llenarse en vivo con `interpretada → alcance verificado (0.96) → componiendo → auditoría (0.92 / 0.82 / 0.97) → fin`, y el botón "datos" mostrando el payload de cada paso.

---

## Fase 3 — Streaming de texto

- [x] Revelado progresivo de la narrativa (~28 ms por palabra)
- [x] Buffer con `requestAnimationFrame`: un paint por frame, no por palabra
- [x] Cursor `▍` latiendo, se apaga al terminar
- [x] Entrada del mensaje: `opacity` + `translateY(6px)` en 160 ms vía `appendChild`
- [x] Cancelación con `AbortController`: cortar deja el texto parcial marcado " · interrumpido"
- [x] `prefers-reduced-motion` muestra el texto completo sin animación

**Desvío consciente del plan:** no se emiten eventos `text.start/chunk/end` desde el servidor. El revelado es **local sobre la narrativa ya recibida**. Emitirlos obligaría a que el servidor duerma ~28 ms por palabra manteniendo el request abierto, y además el `run.finished` del pipeline llegaría antes que el texto, ensuciando la traza. El efecto visual es idéntico y la traza queda coherente.

**Upgrade path:** streaming real de tokens requiere `stream: true` en DeepSeek y parsear JSON parcial. Se hace si la latencia inicial (hoy ~5 s hasta el primer carácter) molesta en la reunión. Anotado con `ponytail:` en `app.js`.

**Extra:** `parseFrame` se movió a `public/sse.mjs` y se testea aparte (7 casos: heartbeats, multilínea, sin espacio tras los dos puntos, payload con saltos).

**Tests: 47.**

---

## Fase 4 — View Transitions, skeleton y stagger

- [x] `document.startViewTransition()` con fallback a fade (`swap`)
- [x] 8 esqueletos con el layout final de cada vista
- [x] Skeleton/atenuado sólo si la espera supera 300 ms
- [x] Stagger por índice, 40 ms por hijo, tope 400 ms acumulados
- [x] `?instant=1` y `prefers-reduced-motion` desactivan todo
- [x] Barra de progreso indeterminada sobre el canvas

**Decisión de UX:** no se reemplaza la vista anterior por un esqueleto. En una reunión el jefe está mirando la vista; borrarla pierde contexto. Se **atenúa** (opacity .45 + desaturación) y se muestra la barra de progreso. El esqueleto sólo aparece si el canvas está vacío. Cuando llega el resultado, la transición va de la vista atenuada a la nueva.

**View Transitions con nombre:** `#canvas` tiene `view-transition-name: canvas`, así se anima sólo el canvas (fade + rise 8px) y no la página entera. Las transiciones del `root` se desactivan explícitamente.

**Tests: 50.** `tests/skeleton.test.mjs` verifica que toda vista tenga esqueleto, que una vista desconocida caiga al default y que el esqueleto no filtre contenido real.

**Demo de cierre:** preguntar dos veces seguidas. La primera vista se atenúa, aparece la barra, y la nueva entra con cross-fade y sus bloques escalonados. Comparar con `?instant=1`.

---

## Fase 5 — Registro de componentes

- [x] Contrato `viewSpec` v2: `{ v:2, title, story, layout:[{type, props}] }`
- [x] `public/components/registry.mjs` con **13 primitivas** (`heading`, `story`, `kpi-row`, `table`, `matrix`, `list`, `pills`, `stepper`, `flow`, `two-col`, `timeline`, `callout`, `evidence`)
- [x] `sanitizeLayout` en servidor y cliente: tipo desconocido o props inválidas → se descarta, nunca lanza
- [x] Prompt con el catálogo de bloques y reglas de composición
- [x] `app.js` partido en módulos ESM: `esc.mjs`, `sse.mjs`, `skeleton.mjs`, `trace-labels.mjs`, `components/registry.mjs`
- [x] Fallback en cascada: layout válido → vista curada → router determinista
- [x] 70 tests (nuevos: `tests/registry.test.mjs`, 12 casos)

**Desvío consciente:** las 7 vistas curadas **no** se migraron a árbol de bloques. Quedan como fallback determinista probado. Migrarlas no aporta hasta que se necesite combinarlas, y el riesgo de regresión visual es alto. El renderer soporta ambos caminos.

**Tres bugs que costó esta fase:**
1. **`max_tokens: 1200` truncaba el layout** → DeepSeek devolvía contenido vacío → todo caía a degradado. Subido a 4000. El razonamiento consume tokens dentro del mismo presupuesto.
2. **El rubric de Jev hablaba de `view`** cuando la salida ya era `layout`, generando falsos rechazos (60% de las respuestas). Reformulado a "la composición (bloques de layout o, si no hay, su view)".
3. **`capture-golden.mjs` pegaba a `/api/ask` sin `?mode=json`** y recibía SSE. Corregido.

**Resultado medido** (goldens v2, 10 preguntas): 3 usan vistas curadas, 5 componen layout propio, 2 quedan fuera de alcance. **10/10 verificadas ok** por Jev.

**Brecha detectada para Fase 6/7:** el grafo no tiene los pasos del proceso de cotización; el modelo los deriva de las costuras. Para el stepper conviene agregar una sección `process` al grafo con los 8 pasos reales del diagnóstico del Comercial.

---

## Fase 6 — Stepper animado

- [x] Sección `process` en el grafo: 8 pasos reales de la pre-cotización, con `status` y `finding` vinculado
- [x] `selfcheck.mjs` valida el proceso y que cada paso apunte a un hallazgo existente
- [x] Estados `ok` / `warn` / `run` / `fail` / `blocked` / `skip`
- [x] Check dibujado con `stroke-dasharray` + `dashoffset` (260 ms), X para las fallas
- [x] Stagger de 90 ms por paso; el conector se rellena con `scaleY`
- [x] El paso `fail` se sacude 160 ms y el conector cae a rojo; los posteriores se atenúan
- [x] Anclado a hallazgos reales: `C-P0-1` (refresh), `C-P0-2` (sin reintentos), `C-P0-5` (corpus vacío)
- [x] Fallback determinista en `localSpec`: si el modelo falla, el stepper sale del grafo igual

**Resultado real** (`11-pasos`): 8 pasos · 2 ok · 1 run · 3 fail · 2 blocked · Jev 0.91 / 0.90 / 0.85.

**Detalle:** el modelo reescribió el paso 2 como `run` en lugar de `warn`. El router determinista sí conserva `warn`. Ambas lecturas son defendibles; el estado no cambia la conclusión.

**Tests: 79.** Nuevos: `tests/localspec.test.mjs` (el router arma el stepper, conserva estados, no secuestra preguntas de conexión ni de riesgo, no inventa pasos sin `process`) y 4 casos de stepper en `registry.test.mjs` (`--i`, trazo por estado, `warn`, escapado).

---

## Fase 7 — Flowanim con Mermaid

- [x] Primitiva `flowanim` (14ª del registro) con fallback estático incluido en el HTML puro
- [x] `public/flowmodel.mjs`: construye la definición Mermaid con `edge@-->`, `@{ step: N }`, `classDef` y `linkStyle`
- [x] Los pasos se asignan en orden **hasta el primer corte**: la arista rota no recibe paso, así el punto no la cruza
- [x] `public/flowanim.mjs`: carga Mermaid por `<script>` sólo cuando hay un flowanim, y reemplaza el fallback
- [x] Mermaid 12.3.0 vendorizado en `public/vendor/mermaid.min.js` (5,5 MB, UMD, sin CDN)
- [x] Controles: repetir y velocidad 1x / 0.5x / 2x (re-render con otro `stepDuration`)
- [x] `prefers-reduced-motion` y `?instant=1` activan `stepNumbers` y apagan el punto
- [x] Nodos tipados por `kind` con su `classDef` (humano, sistema, IA, dato, riesgo)
- [x] Router determinista: "diagrama / mapa / esquema" arma el flowanim desde `process`

**Limitación honesta:** la animación de Mermaid no expone API de pausa. Los controles son repetir y velocidad. Pausar requeriría manipular el DOM interno del diagrama.

**Riesgo no verificable acá:** el render final de Mermaid sólo se confirma en el navegador. La definición generada respeta la sintaxis documentada y define todos los `classDef` usados, y hay tests sobre la cadena, pero la validación visual queda para la primera apertura.

### Refactor posterior (legibilidad y control)

El primer render quedaba ilegible en desktop: `useMaxWidth: true` encogía el SVG hasta 9px de texto, y la animación nativa de Mermaid no se puede pausar.

- [x] `useMaxWidth: false` + contenedor con scroll horizontal: el texto queda a tamaño natural
- [x] Se abandonó la animación nativa (`@{ step }`); ahora Mermaid sólo hace el **layout**
- [x] Secuenciador propio en JS: **play / pausa / paso anterior / paso siguiente / repetir / velocidad 1x-0.5x-2x**
- [x] Revelado progresivo: nodos y aristas arrancan atenuados y se encienden en orden
- [x] Caption con `n/total · paso — detalle`; en rojo cuando llega al corte
- [x] Una arista que entra a un nodo `kind: "risk"` cuenta como corte, aunque el modelo omita `status: "broken"`

**Cómo se enganchan los elementos:** Mermaid no expone ids estables, así que los nodos se etiquetan por texto (`g.node` → `data-idx`) y las aristas por orden en el SVG (`path.flowchart-link`). Es la parte más frágil: si Mermaid cambia el markup, hay que revisar `tagDiagram`.

**Tests: 91.** Nuevos: `tests/flowmodel.test.mjs` (8 casos: corte de pasos, `linkStyle`, frontmatter, escapado, aristas huérfanas, `classDef` por kind) y 2 en `localspec.test.mjs` (diagrama vs pasos).

---

## Fase 8 — Controles de faceta

Se implementó la **versión A**: los controles filtran, agrupan o cambian un estado que **ya existe en el grafo**. Cero proyecciones, cero números inventados. La versión B (simulación con supuestos) queda como deuda explícita.

- [x] `facets.mjs`: 4 facetas — `risks`, `seams`, `panorama`, `process`
- [x] `detectFacet()`: decide la faceta por pregunta, sin modelo
- [x] `buildFacet()`: arma el layout desde el grafo; normaliza parámetros contra las opciones declaradas
- [x] `facetSpec()`: antepone el bloque `controls` y marca `verification.status: "deterministic"`
- [x] Primitiva `controls` (15ª): pills con estado activo, `data-facet` y `data-params`
- [x] Recálculo **sin pasar por modelos**: 183 ms incluyendo arranque de curl
- [x] La vista fresca conserva la narrativa del modelo y reemplaza los bloques por la faceta
- [x] Parámetro inválido cae al default; nunca rompe ni se refleja en el DOM

**Por qué no hay formulario libre:** un input de texto abriría la puerta a la alucinación. Los controles son opciones cerradas contra datos reales.

### Corrección posterior (el proceso no se saltea)

La primera versión cortaba el pipeline en cuanto detectaba una faceta: 4 eventos, sin intérprete, sin verificación de alcance. La pregunta más común del recorrido no pasaba por el agente.

Ahora la faceta se resuelve **después** de razonar:

```
run.started
interpret.done      DeepSeek normaliza y extrae el parámetro
scope.resolved      Jev confirma que está en alcance
decompose.done      desglose real: total / visibles / por severidad
render.ready        layout con controles
run.finished
```

- [x] La faceta se aplica después de interpretar y verificar alcance
- [x] Evento `decompose.done` con los números del desglose
- [x] **Preguntar** pasa por el agente (~2,7 s, $0.0003) · **mover un filtro** sigue instantáneo (144 ms, $0)

**Qué NO se hizo (deuda consciente):** la versión B, donde el usuario mueve una variable que el grafo no contiene ("¿y si el corpus tuviera 500?"). Requiere declarar supuestos en un `callout` y marcar la vista como simulación.

**Tests: 107.** Nuevos: `tests/facets.test.mjs` (13 casos, incluido que **toda afirmación mostrada exista en el grafo**) y 3 de `controls` en `registry.test.mjs`.

---

## Fase 9 — Endurecimiento y costo

- [x] **Presupuesto total** por consulta (`TOTAL_BUDGET_MS`, 30 s): si se pasa, se omite la auditoría y se marca `budget`
- [x] **Toggle "modo instantáneo"** en el header, además de `?instant=1`
- [x] **Estados de error legibles**: sin conexión con el servidor vs error del pipeline, con el comando para levantarlo
- [x] **Modo avión con cache**: si DeepSeek falla, responde desde los 12 goldens y lo declara con badge "cacheado · sin red"
- [x] **Costo real por interacción**: `pricing.mjs` con tarifas verificadas; se acumulan tokens y USD por etapa
- [x] **Costo en la UI**: pie de la traza (costo y tokens) y contador de sesión en el header
- [x] **Métricas por etapa** en el payload del trace (ms, tokens, costo)
- [x] Regresión: 120 tests verdes + `selfcheck`

**Costo medido:** una pregunta con modelos cuesta **USD 0.0014** (14.7k tokens, 4 llamadas). Una faceta cuesta **$0** y tarda **120 ms**. Da ~700 preguntas por dólar.

**Pendiente honesto:**
- Revisión de accesibilidad con teclado y lector de pantalla
- Prueba en Chrome **y** Edge en un equipo sin caché
- La versión B de Fase 8 (simulación numérica con supuestos declarados)

---

## Refactor de layout A (command deck)

- [x] Estructura: rail de etapas de 236px + canvas + barra de comando a lo ancho
- [x] El rail arranca como **plan** (5 etapas en gris) y se vuelve **progreso** al ejecutar
- [x] Etapas reales: interpretar → alcance → desglosar/componer → auditar → presentar
- [x] Tiempo por etapa y detalle (intenciones, score de alcance, hallazgos visibles, estado de Jev)
- [x] Pie del rail con latencia y costo de la consulta
- [x] Pregunta actual citada arriba del rail; "entendí: …" debajo de las etapas
- [x] Input como barra de comando fija abajo, centrada, con foco visible
- [x] Se eliminó el hilo de chat: la narrativa vive en el canvas
- [x] Bienvenida animada (typewriter) con qué puede hacer y 4 preguntas de ejemplo
- [x] Los errores pasan al hint de la barra, no a una burbuja

**Deuda:** quedó CSS muerto del layout anterior (panel, thread, msg, trace, newstuff). No afecta, pero conviene borrarlo.

---

## Cómo correr

```bash
# desarrollo: reinicia solo al editar el servidor y recarga el navegador
node --watch server.mjs    # http://localhost:4399

# producción / demo (sin watcher)
node server.mjs

# desactivar livereload
LIVERELOAD=0 node --watch server.mjs

# suite completa (pipeline + golden + scope + trace + skeleton + sse)
node --test tests/

# integridad del grafo
node selfcheck.mjs

# traza del pipeline en consola
DEBUG_PIPE=1 node --watch server.mjs

# regenerar referencias (con el servidor arriba)
node scripts/capture-golden.mjs

# contrato SSE contra el servidor real (con el servidor arriba)
node scripts/smoke-sse.mjs

# arranque del cliente (DOM falso): detecta pagina en blanco por error de modulo
node scripts/smoke-boot.mjs
```

**Hot reload en dos capas:**
- `node --watch` reinicia el proceso cuando cambia `server.mjs`, `pipeline.mjs`, `models.mjs` o `scope.mjs` (Node 20, sin dependencias).
- `public/livereload.js` abre un SSE contra `/api/livereload`; el servidor mira `public/` con `fs.watch` y manda `reload` al navegador. Equivale al HMR de Vite.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `server.mjs` | adaptador HTTP y estáticos |
| `pipeline.mjs` | orquestación + contrato de eventos |
| `models.mjs` | DeepSeek, Jev y fallback determinista |
| `scope.mjs` | detector de ruido y alcance léxico |
| `public/` | UI (app.js, styles.css, graph.json) |
| `public/trace-labels.mjs` | etiquetas + render puro de la traza |
| `public/sse.mjs` | parser de frames SSE |
| `public/skeleton.mjs` | esqueletos por vista |
| `public/components/registry.mjs` | 15 bloques: saneo + render |
| `facets.mjs` | vistas calculadas con filtros |
| `public/flowmodel.mjs` | definición Mermaid del flujo (puro) |
| `public/flowanim.mjs` | carga Mermaid y reemplaza el fallback |
| `public/vendor/mermaid.min.js` | Mermaid 12.3.0 vendorizado (5,5 MB) |
| `public/esc.mjs` | escapado HTML compartido |
| `public/livereload.js` | recarga del navegador por SSE |
| `tests/` | pipeline, golden, scope, trace |
| `scripts/capture-golden.mjs` | congelar respuestas reales |
| `scripts/smoke-sse.mjs` | contrato SSE + anti-buffering |
| `scripts/smoke-boot.mjs` | arranque del cliente contra DOM falso |

### Ajuste del composer

- [x] Botón de envío circular con ícono de flecha (SVG), sin texto
- [x] Se quitó el chip "enter"
- [x] Foco sin anillo: sólo un cambio de borde casi imperceptible (`#b9bdae`)
- [x] El estado lo comunica el botón: gris y deshabilitado sin texto, sólido oscuro con texto
- [x] `align-items: flex-end` para que el botón acompañe el crecimiento del textarea

Referencias: el patrón "calm composer" de ChatGPT/Claude (aiuxplayground), donde el anillo de foco se reemplaza por el estado del control de envío.

### Ícono y glassmorphism

- [x] Ícono de enviar: paper plane (avión de papel) en SVG, 16px, trazo 1.7
- [x] Composer con glassmorphism: `backdrop-filter: blur(16px) saturate(1.6)`, fondo `rgba(255,255,255,.55)`, borde blanco translúcido e inner highlight
- [x] Degradados radiales detrás de la barra (`::before` con `blur(24px)`) para que el vidrio tenga algo que difuminar
- [x] El botón deshabilitado también es translúcido, para no romper el vidrio

### Fix de especificidad + input integrado

- [x] Se borró el bloque legacy `.composer button` / `.composer textarea:focus` del primer prototipo: ganaba por especificidad (0,1,1 contra 0,1,0) y era la causa del "cuadrado" detrás del ícono y del borde oliva al enfocar
- [x] El composer dejó de flotar: vive dentro de la columna del canvas, separado por un divisor de 1px, con el mismo fondo paper. Sin vidrio, sin tarjeta, sin sombra
- [x] El botón es sólo el ícono: sin fondo, sin círculo, sin borde. Gris apagado sin texto, tinta cuando hay consulta, oliva en hover
- [x] La columna del canvas se renombró a `.viewport` porque `.stage` ya era la clase de las filas del rail
- [x] Se eliminaron los degradados y el `backdrop-filter`

### Voz (speech to text)

- [x] `public/voice.mjs` sobre la Web Speech API del navegador — sin claves ni backend
- [x] `continuous: false`: corta solo al pausar
- [x] El texto final se **agrega al input**; nunca se envía automáticamente
- [x] Botón de micrófono junto al de enviar, oculto si el navegador no soporta STT
- [x] Estado de escucha: ícono en rojo con pulso + interim visible en el hint
- [x] Errores claros: permiso denegado, sin micrófono
- [x] El micrófono se deshabilita mientras el agente trabaja

**Nota:** funciona en Chrome y Edge (localhost o HTTPS). En Firefox y Safari la Web Speech API no está disponible: el botón se oculta y el resto sigue igual.

### Voz continua + indicador en vivo

- [x] `continuous: true`: las pausas ya no cortan la sesión
- [x] Auto-reconexión cuando Chrome cierra por silencio (`onend` → reabre si el usuario sigue)
- [x] Tope de sesión de 2 minutos
- [x] Franja de escucha sobre el input: barras con nivel real del micrófono (`AnalyserNode`) + texto provisional
- [x] Fallback a animación CSS si `getUserMedia` falla
- [x] Botón "detener" en la propia franja
- [x] El texto final se acumula en el input mientras hablás

### Refactor del compositor (píldora + voz en el campo)

- [x] `border-radius: 999px`
- [x] Scroll vertical fantasma eliminado: `overflow-y` se activa sólo cuando el contenido supera 132px
- [x] Micrófono ↔ stop: en escucha el botón es un círculo rojo con cuadrado blanco; al detener vuelve el micrófono
- [x] `aria-label` cambia entre "Hablar" y "Detener dictado"
- [x] Se eliminó la franja sobre el input
- [x] Waveform de 5 barras **dentro del campo**, a la izquierda, alimentada por el nivel real del micrófono
- [x] El texto provisional se escribe en vivo en el textarea
- [x] El borde del campo pasa a rojo suave mientras escucha

**Tradeoff del radio 999px:** al crecer a varias líneas la forma sigue siendo cápsula. Si molesta, el híbrido es `999px` en una línea y `18px` cuando supera dos.

## Short-term memory: sesión persistida

- [x] `public/session.mjs`: modelo de sesión con `turns[]` — `{id, at, pregunta, spec, etapas, ms, costo}`
- [x] Persistencia en `localStorage` (`sng.diagnostico.session.v1`), tolerante a JSON roto
- [x] El canvas pasó a ser un **transcript**: un turno por pregunta, apilado
- [x] La pregunta forma parte del canvas (serif itálica, con raya), ya no vive sólo en el input
- [x] Pie de cada turno: `hora · duración · costo`
- [x] Al recargar se reconstruye la conversación completa, con las mismas vistas
- [x] Los cambios de filtro actualizan el último turno, no crean uno nuevo
- [x] Un turno interrumpido se muestra como "sin respuesta" en vez de quedar en esqueleto
- [x] Sin rail de historial en el costado (decisión del usuario)

**Pendiente de esta capa:** context assembly (mandar los últimos turnos al intérprete) y compacción.

### Recorrido con nombres propios + modal

- [x] Etapas con acción y objeto: "Leyendo la consulta", "Verificando si está en el diagnóstico", "Buscando en el grafo", "Auditando con Jev", "Componiendo la vista"
- [x] Cada etapa muestra su resultado: `2 intenciones`, `en alcance · 0.97`, `3 de 9`, `riesgos · 3 bloques`, `aprobada`
- [x] Estados reales: corriendo, hecho, aviso (timeout o respaldo), error, omitida
- [x] Retry real en DeepSeek (1 reintento con backoff ante 5xx/429/red) → evento `stage.retry`
- [x] Línea única bajo la pregunta que salta de etapa en etapa
- [x] Al cerrar: **"Listo! Ya tengo la información necesaria"** con el tiempo
- [x] La línea es un botón: abre el modal con la timeline vertical del turno
- [x] Modal nativo `<dialog>`: línea de progreso, glifo por estado, tiempo por etapa, pie con hora·duración·costo
- [x] El modal también funciona sobre turnos restaurados (`replay` de los eventos guardados)

### Pie del turno: hora, tiempo y costo desglosado

- [x] Pie alineado a la derecha con íconos outline (reloj, cronómetro, moneda)
- [x] El total del costo ya sumaba DeepSeek + Jev; ahora **se ve el desglose**
- [x] `run.finished` emite `by: { deepseek: {cost, tokens, calls, model}, jev: {...} }`
- [x] Cada proveedor muestra marca, modelo real (`deepseek-flash`, `jev-1.14.0`), costo, tokens y cantidad de llamadas
- [x] El desglose es expandible desde el pie y se persiste con el turno

### Precio clickeable con popover y barras

- [x] Sólo el precio es clickeable; hora y duración son texto plano
- [x] Popover anclado al precio (arriba si hay espacio, abajo si no), se cierra con Esc, click afuera o scroll
- [x] Filas por proveedor con marca, modelo real, costo, barra de porcentaje y meta (%, tokens, llamadas)
- [x] Barras animadas al abrir: `width 0 → pct` con transición de 550 ms
- [x] `public/usage.mjs`: reparto de porcentajes puro y testeado (suma 100, ordena, ignora proveedores sin llamadas)

### Pie horizontal, fecha y logos

- [x] Hora, duración y precio en una sola línea horizontal alineada a la derecha
- [x] Precio con forma de botón (borde, hover, caret y `aria-expanded`)
- [x] Ícono de duración: cronómetro outline
- [x] Fecha con "Hoy" / "Ayer" y fecha corta para el resto, seguida de la hora
- [x] Logos reales vendorizados: `public/brand/deepseek.svg` (Simple Icons) y `public/brand/typesafe.png` (favicon oficial)
- [x] Click en el precio abierto lo cierra (toggle) y refleja `aria-expanded`
- [x] Botón de cierre estilo Apple compartido por popover y modal

### Costo en pesos colombianos

- [x] `/api/fx` con TRM oficial (datos.gov.co) → respaldo mercado (open.er-api) → fallback configurable
- [x] Caché de 1 h en memoria; la app nunca se rompe por red
- [x] Precio en COP por defecto, con toggle COP/USD en el popover (preferencia persistida)
- [x] `public/money.mjs`: conversión y formato `es-CO` puro y testeado
- [x] El popover muestra la tasa usada, la fecha y la fuente
- [x] Al cambiar de moneda se repintan todos los pies del transcript

### TRM por fecha, no "la última"

- [x] `/api/fx?date=YYYY-MM-DD` resuelve la TRM **que cubre esa fecha** (`vigenciadesde <= fecha < vigenciahasta`)
- [x] Serie de 40 registros cacheada 6 h en el servidor: un solo request, consultas por fecha gratis
- [x] Fines de semana y festivos resuelven a la fila que los cubre (8 nov → fila del 7, que va del 7 al 9)
- [x] Si la TRM del día aún no se publicó, usa la última vigente y lo declara (`exact: false` → "aún no publicada")
- [x] La tasa se refresca antes de crear cada turno y se congela en él

### Tasa en vivo (como Google)

- [x] Fuente primaria: Yahoo Finance `USDCOP=X` intraday, con marca de tiempo del tick
- [x] Caché de 5 min en el servidor (no se pide por turno)
- [x] Para hoy → tasa en vivo; para fechas pasadas → TRM oficial de esa fecha
- [x] Se eliminó el texto "aún no publicada"
- [x] Respaldo en cadena: en vivo → TRM → configurado

### COP con dos decimales + total de sesión

- [x] `fmtCop` siempre con 2 decimales (`$3,30`, `$1.234,50`)
- [x] Botón de sesión en el header: `N interacciones · $X COP`
- [x] Popover de sesión con el mismo lenguaje visual: total, filas por proveedor, barras y toggle
- [x] **Sin reconversión**: `sessionTotals` suma el USD y el COP guardado en cada turno (cada uno con su tasa)
- [x] Muestra cuántas interacciones y desde cuándo; avisa si hay turnos sin costo
- [x] El toggle COP/USD repinta el pie de todos los turnos y el contador del header

### Estado vivo: tooltip pill y estados extra

- [x] El `title` nativo no funcionaba: tooltip propio con `::after` + `content: attr(data-tip)`
- [x] Pill oscura con flecha, arriba del punto, con fade de 150 ms
- [x] Nuevos estados: **límite alcanzado** (429 del proveedor), **sin tasa** (tipo de cambio de respaldo), **modo avión** (respuesta desde cache)

### Español neutro de Colombia

- [x] Fuera el voseo de la interfaz: placeholder, ejemplos, voz, permisos
- [x] Prompts del compositor e intérprete reescritos en español neutro; el compositor ya no pide "rioplatense"
- [x] Copy del `out_of_scope` en neutro
- [x] Se eliminó el hint "Cada vista se compone y se audita antes de mostrarse"

### Sesiones: historial en el rail

- [x] Store v2 en localStorage: `{ currentId, sessions: [{ id, title, createdAt, updatedAt, turns[] }] }`
- [x] Migración automática de la sesión única anterior (`session.v1` → `store.v2`)
- [x] Rail izquierdo convertido en lista de conversaciones: título + n interacciones + fecha
- [x] Botón **Nuevo chat** fijo al pie del rail, con ícono de burbuja + plus
- [x] Al enviar la primera consulta de una sesión, el título se genera desde esa consulta
- [x] Click en una sesión la abre: transcript, estado, contador y pasos restaurados
- [x] La sesión activa se marca visualmente
- [x] El recorrido vertical salió del rail; vive en la línea de estado y el modal de cada turno

### Sesiones: acciones y archivo

- [x] Botón `⋯` por card (aparece al pasar el mouse o en la sesión activa)
- [x] Menú con **Archivar** y **Eliminar** (eliminar pide confirmación y avisa cuántas interacciones se pierden)
- [x] Pestañas **Activas / Archivadas** en el rail
- [x] Archivar la sesión abierta salta a la siguiente activa o crea una nueva
- [x] Sesión archivada se abre en **solo lectura**: campo, micrófono y envío deshabilitados, placeholder "Sesión archivada · solo lectura"
- [x] En archivadas el menú ofrece **Desarchivar** en lugar de Archivar

### Enviar por correo (POC)

- [x] Validación por capas: sintaxis, typo, descartable, rol y **MX real** (`dns.promises.resolveMx` con caché 10 min)
- [x] `POST /api/email/check` → veredicto por dirección
- [x] `POST /api/email/send` → valida destinatarios, arma el reporte y envía (o simula)
- [x] Reporte email-safe: tablas, estilos inline, sin flex/grid/variables ni JS
- [x] Mailer con drivers `dry` (escribe en `.mail/`) y `smtp` (Nodemailer, ACS/Gmail/M365)
- [x] Remitente atado al entorno; el cliente nunca elige el `from`
- [x] Rate limit 5 envíos/min y tope de 10 destinatarios
- [x] Botón **Enviar** en el pie de cada turno
- [x] Modal con chips: Enter/coma/pegar lista, sugerencia de typo, borrar con Backspace
- [ ] Tool call del modelo (`prepare_email` / `send_email`) — siguiente rebanada
- [ ] Verificar dominio propio en ACS para salir como @steelandglass

### Tool calls: el agente propone, el humano confirma

- [x] `server/tools.mjs`: registro de herramientas con nombre, descripción, parámetros y validador
- [x] El prompt del intérprete se arma **desde el registro** (`toolPrompt()`), no a mano
- [x] El modelo devuelve `accion: {tool, to, nota}` o `null`
- [x] `validateToolCall` normaliza, deduplica, corta en 10 y rechaza herramientas desconocidas
- [x] Tolerante a claves localizadas (`herramienta`/`argumentos`/`para`/`destinatarios`)
- [x] Eventos `tool.requested` y `tool.rejected` en la traza, con etiquetas
- [x] El cliente abre el modal de correo con los destinatarios ya cargados y validados
- [x] El pipeline NO ejecuta nada: el envío sigue pasando por la confirmación
- [ ] Segunda herramienta (Slack, PDF, WhatsApp) para probar la extensibilidad

### Correcciones tras la primera prueba real

- [x] **Bug**: el intérprete devolvía `intenciones: []` — `max_tokens: 700` se consumía en razonamiento. Subido a 1400.
- [x] **Detector determinístico** de envío: dirección escrita o verbo de envío + "correo". No depende de que el modelo se acuerde.
- [x] Una pregunta *sobre* correos no dispara el envío: con signos de interrogación y sin dirección, no propone nada.
- [x] El modal ya no se abre en medio del stream: se guarda la propuesta y se abre al cerrar el turno.
- [x] El botón dice **"Enviar por correo"**, no "Enviar".

- [x] **Bug crítico**: `saveSession` no existía (residuo de la sesión única). Lanzaba ReferenceError al cerrar cada turno: el turno no se persistía y todo lo que venía después no corría. Ahora usa `saveStore`.
- [x] El modal de correo se abre solo: el handler de `tool.requested` nunca se había insertado en `dispatch`.
- [x] El arnés ahora simula el stream SSE completo y verifica que el modal se abra.

### Fuente: diagnóstico del pre-cotizador

- [x] `scripts/sync-data.mjs` copia `Comercial/Docs/Diagnosticos/diagnostico_avanzado.json` a `public/data/precotizador.json` (con guardas de forma)
- [x] `precotizador.mjs` normaliza 22 nodos / 4 etapas / 16 hallazgos / 10 hipótesis
- [x] `readGraph` adjunta el pre-cotizador al grafo servo-side
- [x] Faceta `precotizador` con tres vistas: recorrido, por etapa, hallazgos
- [x] Sin modelo: la faceta se detecta por palabras clave y se arma del JSON
- [ ] Dashboard con cards por proyecto y diagrama de etapas (pendiente de diseño)

### Marca y paleta

- [x] `assets/logo-mark.png`: recorte del logo al contenido (390×56, sin el margen blanco) generado con `System.Drawing`
- [x] `/assets/*` servido desde la raíz del prototipo, con MIME `image/png` y sin permitir traversal
- [x] El header muestra el logo (22px, `mix-blend-mode: multiply` para fundir el blanco del PNG con el papel)
- [x] Paleta derivada del logo: navy `#19233e` + azul acero `#8b9ebe`
- [x] 76 literales cálidos migrados a la familia fría en `styles.css` y en el HTML del correo
- [x] Contrastes verificados sobre `--paper`: ink 14.6:1, stone 8.8:1, steel 5.1:1

### Fase 1 — Adaptador y veredictos

- [x] `scripts/sync-data.mjs` sincroniza los **tres** diagnósticos (landing, cotizador, gerencial)
- [x] `diagnostic.mjs`: adaptador al contrato del prompt + funciones puras de veredicto
- [x] Mapeo de escalas: TRUE→I3, PARTIAL→I2, FALSE→I0 · reliability 2/1/0 → F2/F1/F0 · solid/works/needs → Q3/Q2/Q1
- [x] `estadoNodo()` devuelve las **dos señales independientes** (implementación y robustez)
- [x] `cobertura()` exige I3 **y** F2+; `robustez()` excluye NV y Futuro
- [x] `veredictoGlobal()` informa "X de Y nodos verificados" y la fórmula auditable
- [x] Las brechas se reportan en `advertencias`, nunca se rellenan
- [x] `GET /api/diagnosticos` con los tres proyectos adaptados
- [x] 227 tests verdes (18 nuevos)
- [ ] Fase 2: Home con tarjetas y apertura de ventana

### Fase 2 — Home con tarjetas y apertura de ventana

- [x] `public/dashboard.mjs`: tarjetas con anillo de cobertura, badge de veredicto, contadores y commit
- [x] Anillo SVG animado (`stroke-dasharray`) y conteo ascendente de 620 ms
- [x] Entrada escalonada de 90 ms entre tarjetas
- [x] Apertura de ventana corredera: dos hojas de vidrio, blur que se aclara, logo al centro
- [x] Se salta con cualquier tecla o clic; `prefers-reduced-motion` la omite entera
- [x] Estado de carga con esqueleto y estado de error con reintento
- [x] "Explorar" lanza la consulta del proyecto al chat (la vista llega en la Fase 3)
- [x] 227 tests verdes; arnés con stream y home simulado

### Fase 3 — Vista de proyecto

- [x] `public/project.mjs`: pipeline por etapas en columnas con scroll horizontal
- [x] Cada nodo muestra las dos señales: implementación (borde + glifo) y robustez (badge con texto)
- [x] Conectores SVG entre nodos, medidos del DOM; `cascada` punteado y rojo, `acopla` ámbar
- [x] Hover sobre un nodo atenúa el resto y resalta sus aristas y vecinos
- [x] Filtros: solo con problemas, mostrar visión a futuro, contador visible/total
- [x] Encabezado con veredicto, cobertura, verificados, fecha y commit; pie con la fórmula
- [x] Volver al home
- [x] `diagnostic.mjs` movido a `public/` para poder importarse en el navegador
- [x] 235 tests verdes (8 nuevos sobre filtros y aristas)
- [ ] Fase 4: modal de detalle por nodo

### Fase 4 — Modal de detalle por nodo

- [x] `public/nodemodal.mjs` con siete pestañas: Resumen, Implementación, Calidad, Riesgos, Evidencia, Ejes, Hipótesis
- [x] Encabezado con id, nombre y las dos señales
- [x] Navegación ← → entre nodos, contador de posición y foco atrapado (`<dialog>` nativo)
- [x] Evidencia con botón de copiar
- [x] Ejes como barras 0-3; nulos con trama punteada
- [x] Riesgos: dice "sin verificar" y explica por qué, en lugar de mostrar una lista vacía
- [x] Hipótesis con veredicto y su enlace al nodo
- [x] "Preguntar al agente" deja la consulta en el composer
- [x] 244 tests verdes (9 nuevos)
- [ ] Fase 5: el chat conduce la interfaz

### Fase 5 — El chat conduce la interfaz

- [x] Cuatro herramientas nuevas: `abrir_proyecto`, `abrir_detalle`, `enfocar_nodo`, `filtrar`
- [x] `sideEffect: false`: se ejecutan sin confirmación, quedan en la traza
- [x] `public/uiactions.mjs` resuelve el proyecto y el nodo, incluso si no están abiertos
- [x] Si el nodo está en otro proyecto, abre ese proyecto antes de señalarlo
- [x] `focusNode` hace scroll, resalta vecinos y pulsa el nodo 1.6 s
- [x] El prompt genera **un ejemplo por herramienta** (antes reusaba la forma del correo y el modelo copiaba `to`/`nota`)
- [x] Verificado contra el modelo real: "vamos a explorar el cotizador" → `abrir_proyecto`
- [x] 249 tests verdes
- [ ] Fase 6: vista "versión robusta"

### Fase 6 — Versión robusta

- [x] `public/proposal.mjs`: catálogo por proyecto con objetivo, infraestructura, escenarios, fases y riesgos
- [x] Cada recomendación cita los hallazgos que resuelve; si el id no existe, se descarta
- [x] `buildProposal` cruza con el diagnóstico real y calcula P0 cubiertos y sueltos
- [x] `public/proposalview.mjs`: etiqueta PROPUESTA, cobertura, infra, escenarios con selector, fases y riesgos
- [x] Botón "Proponer versión robusta" en el encabezado del proyecto
- [x] Cotizador deja F02 suelto a propósito: es una decisión operativa, no infraestructura
- [x] 258 tests verdes (9 nuevos)
- [ ] Fase 7: animación de encendido, modo presentación, accesibilidad

### Fase 7 — Encendido, presentación y accesibilidad

- [x] `flowOrder()`: el recorrido declarado primero, el resto de nodos después (el flujo sólo cubre 14 de 22)
- [x] Encendido escalonado 70 ms por nodo, glifo con pop, aristas apareciendo
- [x] Botón ↻ Encendido para repetir la animación al presentar
- [x] Modo presentación: oculta rail, filtros y pies; agranda tipografía; se recuerda en localStorage
- [x] `prefers-reduced-motion` apaga encendido y entrada de tarjetas
- [x] Foco visible en todos los controles nuevos
- [x] `aria-label` completo en cada nodo del pipeline
- [x] 262 tests verdes

### Dashboard completo (fases 0-7)

### Unificación: el chat explora el mismo diagnóstico que el dashboard

- [x] `public/explore.mjs`: seis vistas determinísticas sobre los diagnósticos nuevos (hallazgos, nodos, ejes, hipótesis, detalle de nodo, propuesta)
- [x] `readGraph` adjunta `diagnostics` (los tres proyectos adaptados)
- [x] `exploreQuestion` corre **antes** del gate de alcance: es determinístico, no hay nada que verificar
- [x] Resolución de proyecto por nombre, por etapa única o por id de nodo único
- [x] Preguntas sin proyecto miran los tres (hallazgos y ejes)
- [x] Veredictos de hipótesis traducidos al contrato (CONFIRMED → CONFIRMADA, etc.)
- [x] 277 tests verdes (15 nuevos)
- [ ] Retirar `graph.json` cuando las facetas viejas (costuras, panorama, proceso) se reescriban

### Exploración como entradas del hilo

- [x] Los turnos aceptan `vista: {tipo, proyectoId, nodoId}` y se persisten como cualquier turno
- [x] `abrir_proyecto` ya no reemplaza el canvas: agrega una entrada con el pipeline embebido
- [x] `abrir_detalle` agrega la ficha del nodo al hilo; "Ver ficha completa" abre el modal
- [x] La propuesta robusta también se embebe
- [x] `renderProject` y `renderProposal` aceptan `inline` (sin botón de volver)
- [x] Al recargar, las vistas se repintan desde el diagnóstico (no se guarda el HTML)
- [x] Los turnos de vista no muestran pie de costo
- [x] 277 tests verdes

### Apertura de vidrio, home y riel

- [x] Cortina con hojas **opacas**: el dashboard no se ve hasta que abren
- [x] Al 42% de la apertura arranca la entrada del home
- [x] Typewriter en el título y la pregunta; recién después corren anillos y conteos
- [x] El anillo se dibuja con `stroke-dasharray` animado, no salta lleno
- [x] Porcentaje pegado: `62%` con el signo pequeño y sin margen
- [x] Tarjetas más grandes: 22px de padding, anillo 76px, título 20px, texto 13.5px
- [x] Botón en la barra superior para plegar el riel; el canvas gana todo el ancho
- [x] El estado del riel se recuerda en localStorage
- [x] 277 tests verdes

### Correcciones de la apertura y el riel

- [x] El toggle vive en el encabezado del riel, a la altura de "conversaciones"
- [x] Riel colapsado a 44px: queda la franja con el botón, no desaparece
- [x] `estadoTexto` corto en el badge ("sólido", "aceptable") — ya no desborda la card
- [x] `min-width: 0` + ellipsis en la etiqueta
- [x] Secuencia: copy de arriba hacia abajo → tarjetas como esqueleto → contenido, anillo y contador
- [x] El copy interno de cada tarjeta también se escribe
- [x] 277 tests verdes

### Cobertura explicada y glassmorphism

- [x] La tarjeta muestra `N/total integrados` para separar "existe" de "aguanta bordes"
- [x] Glassmorphism: vidrio con `backdrop-filter`, borde de luz enmascarado y reflejo al hover
- [x] Fondo con radiales de color detrás del home: sin algo detrás, el vidrio no difumina nada

### Vidrio teñido y compositor de bienvenida

- [x] `data-tone` por cobertura: <55 rojo, <70 ámbar, <85 acero, ≥85 verde
- [x] El anillo y el borde de luz toman el mismo tono que el vidrio
- [x] Sesión sin turnos: compositor fijo abajo-centro, 840px, textarea de 68px y vidrio propio
- [x] Al enviar la primera consulta vuelve al dock normal

### Una consulta, una tarjeta

- [x] Si el modelo propone una acción de interfaz, el pipeline **no compone** una vista
- [x] `runUiAction` devuelve `vista` en vez de navegar por su cuenta
- [x] El cliente adhiere esa vista al turno en curso (`pendingView`), sin crear otra tarjeta
- [x] El correo sigue componiendo: necesita vista y confirmación
- [x] 285 tests verdes (6 nuevos de acciones, 2 de pipeline)

### Exploración al grano (misma fuente, menos ruido)

- [x] Nuevo `exploreToday`: etapas con estado en palabras + los 3 problemas que frenan
- [x] Hallazgos: máximo 5, ordenados por gravedad, con aviso de cuántos quedan
- [x] Nodos: una fila por etapa (4 filas) en vez de tabla de 22
- [x] Ejes: los 3 más flojos; y los 5 de gerencia derivados de los 11 técnicos
- [x] Hipótesis: máximo 4, las refutadas primero
- [x] Detalle de nodo sin códigos: "construido / a medias / falta"
- [x] Test que falla si un bloque muestra más de 6 filas
- [x] 289 tests verdes

### Pipeline compacto y detalle en modal

- [x] Sin códigos (N01, I3, F2) en las tarjetas del pipeline
- [x] Sin aristas SVG: el orden lo dan las columnas y el encendido
- [x] Tarjeta de paso compacta: una línea, nombre + glifo, 7px de padding
- [x] Encendido animado por defecto al abrir la exploración
- [x] `abrir_detalle` abre el **modal**, no una tarjeta más en el hilo
- [x] Modal en tres pestañas: Resumen · Qué falta · Técnico
- [x] 289 tests verdes

### Exploración con voz de asistente

- [x] Fuera los filtros "solo con problemas" y "mostrar visión a futuro"
- [x] Fuera la etiqueta "visión a futuro" del paso
- [x] Fuera la herramienta `filtrar` (ya no había nada que filtrar)
- [x] Cada vista abre con una frase del asistente: "Este es el esquema de lo planteado para el proyecto X"
- [x] Cierre accionable: "¿Deseas ver cómo se puede robustecer el proyecto?"
- [x] 286 tests verdes

### Explorar pasos por voz o texto

- [x] `abrir_detalle` acepta el **nombre** del paso, no sólo el id
- [x] Resolución tolerante: sin tildes, sin mayúsculas, por palabras
- [x] Prefiere el proyecto abierto; exige mayoría de palabras para evitar falsos positivos
- [x] El esquema ofrece tres pasos flojos como chips clickeables
- [x] Verificado con el modelo: "la comparación con cotizaciones" y "reintentos si falla una llamada" resuelven sin id
- [x] 289 tests verdes

### Uso real de DeepSeek y Jev

- [x] La exploración determinística corre **antes** del intérprete: las vistas del grafo ya no pagan una llamada a DeepSeek
- [x] Excepción: si hay intención de enviar por correo, el intérprete corre igual para proponer la herramienta
- [x] Medido: "¿qué riesgos en el cotizador?" → 0 llamadas a modelo
- [x] Jev sigue en el alcance y la auditoría de las respuestas compuestas
