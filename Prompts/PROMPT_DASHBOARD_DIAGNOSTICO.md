# Prompt para OpenCode: Dashboard visual del agente de diagnóstico

Copia desde la sección "PROMPT" hasta el final y pégalo en la sesión donde trabajas el front del agente.

---

## PROMPT

### 1. Rol y objetivo

Actúa como un ingeniero de frontend senior con criterio de diseño de producto. Tu tarea es construir un **dashboard de inicio visual e interactivo** para el agente de diagnóstico que ya tenemos, sin romper lo que existe.

Este dashboard es la **carta de presentación ante la gerencia y los socios** de Steel & Glass: tiene que verse profesional, claro y dinámico, pero sobre todo tiene que ser **honesto**: todo lo que se muestre debe salir de diagnósticos reales, nunca de datos inventados.

### 2. Contexto

- Hoy el agente es un **chat con sesiones** donde se le pregunta por los diagnósticos. El agente consulta los diagnósticos, que se generan en **Markdown y JSON**.
- Hay **tres proyectos** diagnosticados con una rúbrica común (capas L1/L2/L3, nodos, aristas, ejes transversales, hipótesis):
  1. **Landing**: captura del lead (cuestionario de 37 preguntas, carga de archivo, ingesta).
  2. **Cotizador (comercial)**: pre-cotización con IA, comparación por similitud, rango por cuantiles, prioridades configurables en el onboarding.
  3. **Gerencial**: seguimiento del proyecto desde el "sí" del cliente (anticipo, medidas, ingeniería, producción) y, a futuro, dashboard de avance por área.
- Las rúbricas de referencia están en los archivos `RUBRICA_DIAGNOSTICO_PRECOTIZADOR.md` y `RUBRICA_DIAGNOSTICO_GERENCIAL.md` (búscalos en el repo o pídemelos). **Léelos antes de diseñar el contrato de datos.**

### 3. Primero explora, no escribas código todavía

Antes de implementar nada:
1. Revisa el repo y describe en pocas líneas: framework y versión, librería de UI, sistema de estilos, manejo de estado, cómo está hecho el chat y las sesiones, y cómo se leen hoy los diagnósticos (rutas, formato real del JSON).
2. **Usa el stack existente.** No introduzcas un framework nuevo. Si hace falta una librería (animación, gráficos, iconos), propónla con su justificación y espera mi aprobación.
3. Muéstrame el formato real de uno de los JSON de diagnóstico y dime **qué campos de la rúbrica ya están y cuáles faltan** (ver sección 4).
4. Entrégame un **plan por fases** (sección 11) y espera mi confirmación antes de codear.

### 4. Contrato de datos (fuente única de verdad)

El dashboard **solo renderiza lo que viene del diagnóstico**. Crea una capa adaptadora (`diagnosticAdapter` o similar) que convierta el JSON actual a este modelo interno. Si el JSON actual no trae algún campo, **no lo inventes**: muéstralo como `Sin verificar` y repórtame la brecha para que ajustemos el generador del diagnóstico.

```ts
type Integracion = "I0" | "I1" | "I2" | "I3";          // no existe / en rama / parcial / integrado
type Funcionamiento = "F0" | "F1" | "F2" | "F3" | "NV"; // NV = no verificado
type Calidad = "Q0" | "Q1" | "Q2" | "Q3" | "NV";
type Alcance = "Actual" | "Futuro" | "PorConfirmar";

interface Nodo {
  id: string;               // p. ej. "N08" o "G06"
  nombre: string;
  etapa: string;            // p. ej. "Captura", "Pre-cotización", "Onboarding", "Plataforma"
  alcance: Alcance;
  l1_gerencial: string;     // 2-3 frases sin jerga
  integracion: Integracion;
  funcionamiento: Funcionamiento;
  verificadoPor: "lectura" | "ejecucion" | "ninguno";
  calidad: Calidad;
  fueraDelSistema?: string; // si el paso ocurre fuera del sistema, dónde
  l2_implementacion: string;
  l3_calidad: string;       // cómo está resuelto vs. cómo debería
  ejes: Record<string, 0 | 1 | 2 | 3 | null>; // E1..E11, null = no aplica
  riesgos: { descripcion: string; prob: "B"|"M"|"A"; impacto: "B"|"M"|"A"; quienLoSufre: string }[];
  evidencia: { ruta: string; linea?: number; nota?: string }[];
  hipotesisRelacionadas: string[];
  dependeDe: string[];
  alimenta: string[];
}

interface Diagnostico {
  proyecto: "landing" | "cotizador" | "gerencial";
  commit: string;
  rama: string;
  fecha: string;
  nodos: Nodo[];
  aristas: { de: string; a: string; tipo: "alimenta"|"depende"|"cascada"|"acopla" }[];
  hipotesis: { id: string; texto: string; veredicto: "CONFIRMADA"|"REFUTADA"|"NO_CONCLUYENTE"; evidencia: string }[];
  hallazgos: { id: string; severidad: "P0"|"P1"|"P2"; esfuerzo: "S"|"M"|"L"; nodos: string[]; descripcion: string }[];
}
```

**Reglas del dato:**
- Si un proyecto no tiene diagnóstico, su tarjeta dice "Sin diagnosticar" (no se muestran puntajes ni colores de veredicto).
- Si el commit del diagnóstico no coincide con el commit actual del repo (cuando se pueda saberlo), muestra la marca **"Diagnóstico desactualizado"** con el commit y la fecha.
- Los nodos con alcance `Futuro` **nunca** se muestran como fallo: se dibujan con borde punteado y la etiqueta "Visión a futuro".

### 5. Lenguaje visual de los veredictos

Se muestran **dos señales independientes** por nodo, porque "está implementado" y "qué tan robusto es" son preguntas distintas:

**Señal 1: ¿Está implementado?** (más que un sí/no: tres estados)
| Estado | Cuándo | Ícono |
|---|---|---|
| Implementado | `I3` | check |
| Parcial | `I1` o `I2` (indicar "en rama" si `I1`) | medio check o círculo parcial |
| No implementado | `I0` | X |
| Fuera del sistema | `fueraDelSistema` presente | ícono de enlace o externo |

**Señal 2: Robustez** (a partir de `calidad`)
| Veredicto | Calidad | Color |
|---|---|---|
| Sólido | `Q3` | verde |
| Aceptable | `Q2` | azul o verde claro |
| Atención (warning) | `Q1` | ámbar |
| Crítico | `Q0` | rojo |
| Sin verificar | `NV` | gris |

**Nunca dependas solo del color** (accesibilidad): cada veredicto lleva también ícono y texto.

**Veredicto global por proyecto** (visible en la tarjeta, con la fórmula en un tooltip para que sea auditable):
- *Cobertura:* nodos `Actual` con `I3` y funcionamiento `F2` o mejor, sobre el total de nodos `Actual`.
- *Robustez:* promedio de `Q0-Q3` de los nodos `Actual` verificados.
- Los nodos `NV` y `Futuro` **no entran** en los promedios; se muestra "X de Y nodos verificados" para que nadie lea un puntaje con más certeza de la que tiene.

### 6. Pantallas y comportamiento

#### 6.0 Apertura de sesión: la "ventana corredera" (storytelling)

Como Steel & Glass es una empresa de ventanería, cada **sesión nueva** abre con una secuencia corta que usa la ventana como metáfora: el diagnóstico se "abre" para mostrar el panorama. Esto es lo primero que verá la gerencia, así que debe sentirse cuidado, no recargado.

**Línea de tiempo (duración total máxima: 4.5 s; configurable):**

| Tiempo | Qué ocurre |
|---|---|
| 0.0 - 0.4 s | Pantalla con un marco de ventana de aluminio de líneas finas y dos hojas de vidrio cerradas. El vidrio es translúcido y esmerilado (`backdrop-filter: blur`), con el logo de steel and glass muy tenue. Detrás, ya montado pero desenfocado, el saludo y las tarjetas. |
| 0.4 - 1.6 s | La hoja corredera se desliza hacia un lado con una curva de inercia (arranque suave, frenado largo). Mientras se abre, el vidrio se va aclarando (el desenfoque baja de ~14 px a 0) y un reflejo de luz barre la superficie. Un leve *parallax*: el fondo se mueve menos que la hoja. |
| 1.4 - 3.0 s | **Efecto de máquina de escribir** (*typewriter*): "Hola, soy el diagnosticador de Carlos." y, tras una pausa de ~400 ms, "¿Qué proyecto quieres explorar?". Cursor parpadeante, ~35 ms por carácter, pausas ligeramente mayores en los signos de puntuación. |
| 2.8 - 4.2 s | Las tres tarjetas entran como **hojas de vidrio** que se deslizan en horizontal con desfase de 100 ms entre una y otra. Si hay diagnóstico, los anillos se llenan y los números suben (*count-up*). |
| 4.2 s | Aparecen debajo, con desvanecimiento suave, las sugerencias rápidas (por ejemplo, "¿Qué riesgos corro en el Comercial?") y la barra de entrada de texto y voz queda destacada. |

**Reglas de la secuencia:**
- **Se reproduce completa solo al abrir una sesión nueva.** Al volver a una sesión existente se muestra directo el estado final, sin animación.
- **Nunca bloquea al usuario:** la barra de texto y el micrófono están activos desde el segundo 0. Cualquier clic, tecla o comando de voz **salta la animación** y lleva al estado final. Botón discreto "Saltar".
- Respeta `prefers-reduced-motion`: sin deslizamiento ni *typewriter*, aparece el estado final con un desvanecimiento simple.
- El texto del saludo viene de configuración (no está fijo en el código) y se puede cambiar.
- Sonido opcional (deslizamiento suave de vidrio), **apagado por defecto**.
- Una vez abierta, la ventana no desaparece: el marco queda como detalle sutil de la interfaz (esquinas o línea de contorno), para mantener la identidad visual.

**Metáfora por proyecto (opcional, si se ve bien):** cada tarjeta lleva una silueta de ventana distinta que cuenta algo del proyecto: la Landing es una vitrina fija (primer contacto, se mira hacia adentro), el Cotizador es una ventana corredera (medidas y precisión) y el Gerencial es un muro cortina (visión de conjunto). Las siluetas son vectoriales y se animan al pasar el cursor (la hoja se desliza un poco).

**Voz:**
- La entrada por voz ya existe: intégrala con la secuencia. Al activar el micrófono, un indicador de onda (a partir del nivel de audio) late en la barra, las tarjetas reaccionan con un brillo sutil y, al reconocer el nombre de un proyecto, esa tarjeta se resalta antes de abrirse.
- Un comando de voz como "vamos a explorar el cotizador" produce el mismo resultado que escribirlo (sección 6.5): se abre la vista del proyecto con la transición.
- Muestra siempre la transcripción de lo que se entendió antes de ejecutar la acción, para que sea corregible.

#### 6.1 Home (saludo del diagnosticador)
- El agente abre la sesión con un saludo y una pregunta, por ejemplo: **"Soy el diagnosticador de Carlos. ¿Qué proyecto quieres explorar?"** (texto editable en configuración).
- Debajo, **tres tarjetas** (Landing, Cotizador, Gerencial), cada una con:
  - nombre y una línea L1 de qué hace el proyecto;
  - anillo de progreso animado con la cobertura y un badge de veredicto global;
  - contadores: nodos implementados, parciales, no implementados;
  - fecha y commit del último diagnóstico (y la marca de desactualizado si aplica);
  - botón "Explorar".
- Las tarjetas son clicables **y** también responden al chat: si escribo "vamos a explorar el cotizador", el agente abre esa vista con transición.

#### 6.2 Vista de proyecto (pipeline por etapas)
- Una **línea de proceso horizontal** con las etapas del proyecto (en pantallas angostas pasa a vertical). Cada etapa agrupa sus nodos como tarjetas compactas.
- Cada nodo muestra: nombre, **señal de implementación**, **badge de robustez** y, si aplica, los íconos de riesgo alto.
- Los nodos se "encienden" en secuencia siguiendo el flujo del proceso (ver animaciones).
- Las **aristas** se dibujan como conectores entre nodos; en `cascada` se resaltan con un trazo distinto. Al pasar el cursor por un nodo, se resaltan sus dependencias y a quién alimenta.
- Filtros: por etapa, por veredicto, "solo con problemas", y interruptor para ocultar o mostrar lo `Futuro`.
- Encabezado fijo con: veredicto global, cobertura, robustez, commit, y el botón **"Proponer versión robusta"**.

#### 6.3 Modal de detalle por nodo
Se abre al hacer clic en cualquier nodo (y por chat: "muéstrame el detalle de la comparación por similitud"). Pestañas:
1. **Resumen (L1):** qué es, para qué importa, estado en una frase.
2. **Implementación (L2):** integración, funcionamiento, cómo se verificó (lectura o ejecución), qué hace hoy y qué falta.
3. **Calidad (L3):** cómo está resuelto vs. cómo debería, con el veredicto de robustez.
4. **Riesgos:** lista con probabilidad, impacto y quién lo sufre.
5. **Evidencia:** archivos y líneas (`ruta:línea`), con botón de copiar.
6. **Ejes:** mini-radar o barras de los ejes transversales (0-3).
7. **Hipótesis:** las que afectan este nodo, con su veredicto.
- Navegación con teclado (flechas para pasar al nodo anterior o siguiente, Esc para cerrar). Enfoque atrapado dentro del modal.

#### 6.4 Vista "Versión robusta" (propuesta de escalabilidad)
Se abre con el botón o por chat ("¿cuál sería la propuesta para que esto sea robusto y escalable?"). **Debe estar claramente etiquetada como PROPUESTA, separada de los hechos diagnosticados.**

Estructura:
1. **Estado actual vs. objetivo**, nodo por nodo o etapa por etapa (antes y después).
2. **Infraestructura y herramientas** necesarias, con el motivo de cada una (cola de trabajos, caché, reintentos, observabilidad de llamadas al modelo, almacenamiento de archivos, control de acceso, etc.), ligadas a los hallazgos que resuelven.
3. **Escenarios de escala**, con selector:
   - Cotizador: de 1 comercial a 5 y a 10 (concurrencia, colas, costo por pre-cotización, límites del proveedor de IA).
   - Gerencial: acceso por **roles** (gerencia, jefes de área, socios), permisos por etapa, auditoría.
   - Extensión a toda la compañía.
4. **Ruta por fases** con esfuerzo estimado (S/M/L), dependencias y qué hallazgo cierra cada fase.
5. **Riesgos de la propuesta** y supuestos que habría que validar.
- Las recomendaciones las genera el agente **a partir del diagnóstico** (hallazgos, hipótesis confirmadas y ejes bajos), citando de qué hallazgo sale cada una. Nada de recomendaciones genéricas sin ancla en el diagnóstico.

#### 6.5 Integración con el chat
- El chat vive en un **panel lateral acoplable** (o una barra inferior en pantallas pequeñas) y siempre está disponible.
- El agente puede **conducir la interfaz** mediante acciones estructuradas, por ejemplo: `abrir_proyecto(proyecto)`, `enfocar_nodo(id)`, `abrir_detalle(id, pestaña?)`, `mostrar_propuesta(proyecto, escenario?)`, `filtrar(criterio)`. El chat responde en texto **y** dispara la acción visual.
- Al revés también: hacer clic en un nodo puede insertar en el chat un atajo ("Explícame este nodo").
- Mantén las sesiones existentes; el dashboard no debe borrar ni alterar el historial.

#### 6.6 Modo presentación
- Un botón que oculta controles secundarios, agranda tipografías y deja los elementos legibles en proyector o pantalla compartida. Pensado para mostrarlo a gerencia.

### 7. Diseño y sistema visual

- Tema oscuro por defecto, con opción clara. Fondo sobrio, tarjetas con elevación sutil, bordes finos, esquinas redondeadas consistentes.
- Define **tokens** (colores, espaciados, radios, sombras, duraciones de animación) en un solo lugar. Paleta de veredictos de la sección 5, con contraste suficiente (mínimo WCAG AA).
- Tipografía: una familia sans moderna para interfaz y una monoespaciada para evidencia y rutas.
- Jerarquía clara: lo más importante de cada pantalla debe leerse en menos de 5 segundos.
- Nada de ornamento que reste claridad. El impacto debe venir de la claridad y el movimiento con propósito.

### 8. Animaciones y transiciones (con propósito)

Usa la librería de animación que ya exista en el repo; si no hay, propón una. Especificaciones:

- **Entrada del Home:** las tres tarjetas aparecen con *stagger* de 80-120 ms; el anillo de progreso se llena y los números suben con *count-up* (600-900 ms, ease-out).
- **Apertura de un proyecto:** transición compartida (la tarjeta se expande hacia la vista del proyecto, 300-450 ms).
- **Pipeline "encendiéndose":** los nodos se activan de izquierda a derecha siguiendo el flujo, con 60-100 ms de desfase; el check se **dibuja** (trazo animado) y la X aparece con un leve rebote; los conectores se trazan entre nodos. Duración total de la secuencia menor a 2.5 s.
- **Hover y foco:** elevación sutil, resaltado de dependencias, sin saltos de layout.
- **Modal:** entrada con escala y desvanecimiento (200-250 ms); el cambio de pestaña, un deslizamiento corto.
- **Vista "Versión robusta":** el paso de "actual" a "objetivo" se anima como una transformación (morph o barrido), para que se entienda qué cambia.
- Todas las animaciones respetan `prefers-reduced-motion` (versión sin movimiento, con aparición simple) y deben ir a 60 fps; anima `transform` y `opacity`, evita animar propiedades que provoquen reflujo.
- Botón para repetir la animación de la secuencia de "encendido" (útil al presentar).

### 9. Estados que deben estar diseñados

Carga (esqueletos, no spinners genéricos), vacío ("Sin diagnosticar" con indicación de cómo generarlo), error al leer el diagnóstico (mensaje claro y reintento), diagnóstico desactualizado, nodo `Futuro`, nodo `NV`, y proyecto con diagnóstico parcial.

### 10. Calidad, accesibilidad y responsive

- Componentes reutilizables y tipados; la lógica de veredictos (cálculo de cobertura, robustez y estados) en funciones puras con **pruebas unitarias** (casos: nodos `NV` y `Futuro` excluidos de promedios, proyecto sin diagnóstico, diagnóstico desactualizado).
- Teclado completo, roles ARIA correctos, contraste AA, textos alternativos, veredicto nunca solo por color.
- Responsive: escritorio como prioridad, funcional en tablet y móvil.
- Rendimiento: carga diferida de la vista de propuesta y del modal; no recalcular veredictos en cada render.

### 11. Entrega por fases (pausa y muéstrame tras cada una)

1. **Fase 0:** exploración del repo, formato real del JSON, brechas frente al contrato y plan. *(Sin código.)*
2. **Fase 1:** adaptador de datos + lógica de veredictos con pruebas unitarias.
3. **Fase 2:** Home con las tres tarjetas y el saludo.
4. **Fase 3:** vista de proyecto (pipeline, nodos, filtros, conectores).
5. **Fase 4:** modal de detalle con todas las pestañas.
6. **Fase 5:** integración con el chat (acciones estructuradas que conducen la UI).
7. **Fase 6:** vista "Versión robusta" y escenarios de escala.
8. **Fase 7:** animaciones finas, modo presentación y pulido de accesibilidad.

En cada fase, entrega capturas de pantalla o una descripción de lo que se ve, qué probaste y qué falta.

### 12. Qué NO hacer

- No inventar datos, puntajes ni estados para que se vea mejor. Si falta información, mostrar "Sin verificar".
- No marcar como fallo lo que es visión a futuro.
- No mezclar hechos diagnosticados con recomendaciones: las propuestas van etiquetadas y ancladas a hallazgos.
- No romper el chat, las sesiones ni el formato actual de los diagnósticos.
- No agregar dependencias sin explicarlas y recibir mi aprobación.
- No usar solo color para comunicar el estado.

### 13. Criterios de aceptación

- Puedo decir "vamos a explorar el cotizador" y la interfaz abre ese proyecto con la animación de proceso.
- Veo, etapa por etapa, si cada nodo está implementado y qué tan robusto es, y puedo abrir el detalle de cualquiera.
- Cada número del dashboard se puede rastrear hasta el diagnóstico (evidencia o fórmula visible).
- Puedo pedir la versión robusta y obtener una propuesta con infraestructura, escenarios de escala (5 a 10 comerciales, roles de gerencia, jefes de área y socios) y fases, anclada a los hallazgos.
- Todo se ve bien en el modo presentación y respeta `prefers-reduced-motion`.

Empieza por la Fase 0.
