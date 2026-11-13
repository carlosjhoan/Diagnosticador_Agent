# Prompt de ajuste: vista gerencial al grano

Pega esto en la sesión de OpenCode que ya construyó el dashboard. Este ajuste **tiene prioridad** sobre las secciones 6.2 (vista de proyecto) y 6.3 (modal de detalle) del prompt original; todo lo demás (datos, veredictos, apertura con ventana corredera, voz, chat) se mantiene.

---

## PROMPT

### 1. Qué está fallando (feedback de uso real)

Probé la versión actual y, pensando en presentarla a la gerencia, encuentro tres problemas:

1. **Demasiadas etapas y nodos a la vez.** Al abrir un proyecto aparece una pared de tarjetas.
2. **Las líneas se cruzan.** Los conectores dibujan todas las dependencias y no siguen una secuencia clara, así que el flujo no se lee.
3. **El detalle es demasiado técnico.** "Ver ficha" abre pestañas de resumen, implementación, calidad, riesgos, evidencia, ejes e hipótesis. A la gerencia no le sirve eso como primera lectura.

**Lo que necesita la gerencia:** ir de lo general a lo particular, en pocas palabras. Entender de un vistazo cómo está el proyecto y, si algo no está bien, saber **por qué** y **qué falta**, sin ruido técnico. El detalle técnico debe existir, pero escondido detrás de una acción explícita.

### 2. Principio de diseño: tres niveles, de a poco

Cada pantalla responde **una sola pregunta** y permite bajar al siguiente nivel con un clic.

| Nivel | Pregunta que responde | Qué muestra |
|---|---|---|
| **1. Proyecto** | ¿Cómo está esto en general? | Veredicto en una frase, 3 cifras, flujo en 4-6 etapas, "lo que más pesa" |
| **2. Etapa** | ¿Qué pasos tiene y cuáles están flojos? | Lista corta de pasos con estado y el motivo en una frase |
| **3. Paso** | ¿Por qué está así y qué falta? | Qué hace hoy, qué falta, qué se gana al mejorarlo |
| *(Opcional)* **Detalle técnico** | ¿Con qué evidencia? | Lo que hoy está en las pestañas (evidencia, ejes, hipótesis...) |

Regla general: **nada se muestra en un nivel si no responde la pregunta de ese nivel.**

### 3. Nivel 1: Vista de proyecto

```
Cotizador (comercial)                         Diagnóstico: 12 nov · commit a1b2c3
"Funciona en el caso ideal, pero se cae si algo falla y no está listo para varios usuarios."

  [ 7 implementados ]   [ 3 parciales ]   [ 2 sin implementar ]

  Captura ───▶ Pre-cotización ───▶ Onboarding ───▶ Plataforma
   ✓ Sólido     ⚠ Atención          ⚠ Atención       ✗ Crítico
   "Funciona"   "Sin reintentos"    "Prioridades     "Sin cola ni
                                     no cambian       trazas"
                                     el precio"

  Lo que más pesa (3)
   1. Si una llamada falla, se cae todo el proceso
   2. Cada pre-cotización repite todo el trabajo
   3. Las prioridades del cliente no llegan al precio

  [ Proponer versión robusta ]
```

Reglas:
- **Veredicto en una frase** (máximo 20 palabras), generada a partir del diagnóstico, no inventada.
- **Agrupa los nodos en 4 a 6 etapas macro** (una por cada etapa del flujo de negocio). Los nodos individuales **no se dibujan** en este nivel.
- **Una sola línea recta**, en un solo sentido (izquierda a derecha en escritorio, arriba a abajo en móvil), que conecta **solo etapas consecutivas**. **Prohibido dibujar dependencias cruzadas** en esta vista.
- Cada etapa es un bloque con: nombre, **semáforo (ícono + texto)**, y **una frase de motivo** de máximo 8 palabras. Las etapas en verde llevan "Funciona"; las demás, el problema principal.
- Las etapas `Futuro` se dibujan atenuadas al final de la línea, con la etiqueta "Visión a futuro".
- **"Lo que más pesa":** máximo 3 hallazgos, ordenados por severidad y efecto de negocio, escritos en lenguaje de negocio.
- Sin IDs de nodos, sin códigos (I3, Q1, E4...), sin jerga.

### 4. Nivel 2: Vista de etapa

Al hacer clic en una etapa, se abre un **panel lateral** (o la misma pantalla con transición de enfoque; el resto queda atenuado) con una lista **vertical y corta**:

```
Pre-cotización                                      ⚠ Atención
 ✓ Lectura de planos y fotos           Sólido
 ⚠ Comparación con cotizaciones         Atención   "Cada vez repite el análisis completo"
 ✗ Reintentos si falla una llamada      Falta      "Si una llamada falla, se cae todo"
 ✓ Cálculo del rango de precios         Sólido
```

Reglas:
- Una fila por paso: **estado (check, parcial o X) + nombre en lenguaje claro + badge de robustez + motivo en una frase** (solo si no está en verde).
- Los pasos con problema van **primero**; los que funcionan, después, más discretos.
- Sin conectores en este nivel; el orden de la lista ya es la secuencia.
- Clic en un paso: va al nivel 3.

### 5. Nivel 3: Detalle del paso (centrado en la gerencia)

Reemplaza las siete pestañas por **tres bloques**, en este orden y sin pestañas:

1. **¿Qué hace hoy?** 2 a 3 frases.
2. **¿Qué le falta?** Lista corta (máximo 4 puntos), cada punto con su **efecto en el negocio** ("Sin reintentos: si Gemini falla, el comercial no recibe rango y pierde tiempo con el cliente").
3. **¿Qué se gana al mejorarlo?** Mejora concreta + esfuerzo (Bajo, Medio o Alto) + qué hallazgo cierra.

Debajo, un enlace discreto: **"Ver detalle técnico"**, que abre (en el mismo panel, como sección expandible o como modal secundario) lo que hoy están en las pestañas: evidencia por archivo y línea, ejes transversales, hipótesis y riesgos. **Cerrado por defecto.**

Además, un interruptor global **"Modo técnico"** (apagado por defecto) que, al activarse, muestra IDs, códigos de escala y evidencia en todos los niveles. Para la presentación a gerencia, el modo técnico queda apagado.

### 6. Cambios en el contrato de datos

Para soportar este modo, cada nodo necesita campos en lenguaje de negocio. **No los inventes en el front:**

```ts
interface NodoGerencial {
  nombreClaro: string;         // sin jerga ni códigos
  etapaMacro: string;          // una de 4-6 etapas del flujo de negocio
  motivoCorto?: string;        // máx. 8 palabras; obligatorio si no está en verde
  queHaceHoy: string;          // 2-3 frases
  queFalta: { punto: string; efectoNegocio: string }[];   // máx. 4
  queSeGana?: { mejora: string; esfuerzo: "Bajo"|"Medio"|"Alto"; cierraHallazgo?: string };
}
```

- Revisa el JSON actual: si estos campos no existen, **muéstrame la brecha** y propón extender el generador del diagnóstico (es la fuente correcta). Mientras tanto, como solución temporal, puedes derivar `queHaceHoy` de `l1_gerencial` y `queFalta` de `l2_implementacion`, **marcándolo internamente como "derivado"** para que lo reemplacemos.
- Define en un archivo de configuración el **mapeo de nodos a etapas macro** por proyecto, para poder ajustarlo sin tocar código.
- Define el **veredicto en una frase** y el **top 3 de "lo que más pesa"** como campos que el diagnóstico entrega, no como texto escrito a mano en el front.

### 7. Reglas de lenguaje (todo texto visible)

- Español neutro, frases cortas, voz activa, sin siglas técnicas sin explicar.
- Describir el **efecto en el negocio**, no el mecanismo ("el comercial no recibe rango", no "excepción no capturada en el cliente HTTP").
- Nada alarmista ni de culpas; hechos y consecuencias.
- Máximo ~12 palabras por motivo; máximo ~20 por veredicto.

### 8. Animaciones en este modo

Mantén el dinamismo, pero **al servicio de la lectura**:
- Al abrir un proyecto, las etapas se encienden **una a una, de izquierda a derecha**, trazando la línea entre ellas (la secuencia comunica el orden del proceso). Máximo 1.5 s.
- Al entrar a una etapa, transición de enfoque: la etapa elegida sube de jerarquía y el resto se atenúa (200-300 ms).
- Al abrir el detalle de un paso, el panel se desliza desde el lado; no usar efectos que distraigan del texto.
- Respeta `prefers-reduced-motion`.

### 9. Vista "Versión robusta": mismo principio

Presentarla en **tres pasos cortos**, no como un documento largo:
1. **Hoy → Objetivo**: una línea por etapa ("Hoy: se cae si algo falla. Objetivo: reintenta y continúa").
2. **Qué se necesita**: infraestructura y herramientas, en lenguaje de negocio, ligadas al problema que resuelven.
3. **En qué orden**: 3 a 4 fases con esfuerzo y qué resuelve cada una. Los escenarios de escala (5 a 10 comerciales, roles de gerencia, jefes de área y socios) como selector que cambia solo lo necesario.

Siempre etiquetada como **propuesta**, anclada a hallazgos. Detalle técnico bajo demanda.

### 10. Cómo trabajar

1. **Primero, plan:** dime cómo vas a reorganizar la información actual en los tres niveles, qué mapeo de etapas macro propones para cada proyecto y qué campos faltan en el JSON. **Espera mi confirmación.**
2. Implementa por orden: contrato de datos y mapeo, nivel 1, nivel 2, nivel 3, modo técnico, animaciones, vista robusta.
3. Tras cada paso, muéstrame capturas o una descripción de lo que se ve.
4. **No elimines** el detalle técnico actual: reubícalo detrás de "Ver detalle técnico" y del modo técnico.

### 11. Criterios de aceptación

- En el nivel 1 se entiende el estado del proyecto en **menos de 10 segundos**, sin hacer clic.
- No hay **ninguna línea cruzada** en la vista de proyecto; el flujo se lee en un solo sentido.
- Para cualquier paso que no esté en verde puedo llegar en **dos clics** a "por qué" y "qué falta".
- La vista predeterminada no muestra IDs, códigos de escala ni jerga técnica.
- El detalle técnico completo sigue disponible detrás de una acción explícita.
- Ningún texto visible está inventado en el front: todo sale del diagnóstico (o está marcado como derivado).

### 12. Las dos preguntas de gerencia (esto manda sobre lo anterior si hay conflicto)

La gerencia hace dos preguntas, en este orden, para cada proyecto. La vista debe responderlas con **lenguaje coloquial**, como hablaría una persona, no un informe.

#### 12.1 Pregunta 1: "¿Qué tenemos hoy?"

Es la vista **por defecto** de cada proyecto (el nivel 1 descrito arriba). Responde: *"la Landing hoy nos permite..."*, y lista **todas sus etapas y secciones**, cada una en una frase de lo que hace y su estado.

Ejemplo de redacción (ilustrativo; el contenido real sale del diagnóstico):
- "La Landing hoy le permite al cliente conocer la empresa, contarnos su proyecto en 37 preguntas y subirnos su plano o foto."
- "Cada sección tiene su estado: funciona, funciona a medias, o falta."

#### 12.2 Pregunta 2: "¿Qué hace falta para que sea sólido?" (los 5 ejes)

Se activa con un selector visible en el encabezado del proyecto: **"Qué hace falta"**. Muestra **cinco ejes principales**, que son los que le importan a la gerencia:

| Eje | Pregunta en lenguaje de gerencia |
|---|---|
| **Mantenibilidad** | ¿Es fácil de cambiar y de mantener sin depender siempre de un desarrollador? |
| **Escalabilidad** | ¿Aguanta más usuarios, más proyectos y más áreas sin rehacerlo? |
| **Confiabilidad** | ¿Funciona siempre, y si algo falla, se recupera solo? |
| **Seguridad** | ¿Están protegidos los datos de los clientes y el acceso de cada persona? |
| **Costo-beneficio** | ¿Lo que gastamos (tiempo, dinero, llamadas de IA) vale lo que obtenemos? |

Comportamiento:
- Cinco chips o tarjetas, cada una con un semáforo y una frase ("Escalabilidad: Atención. Hoy el contenido de la página vive dentro del código").
- Al elegir un eje, se listan sus **brechas**, ordenadas por **mayor beneficio con menor esfuerzo primero** (sección "Empecemos por esto").
- Cada brecha tiene el formato fijo: **Hoy** (cómo está), **Por qué importa** (efecto en el negocio), **Qué haría falta** (en una frase), **Esfuerzo** (Bajo, Medio o Alto), **Beneficio** (Bajo, Medio o Alto).
- Desde una brecha se puede entrar al paso o etapa afectados (nivel 2 o 3) y, si se desea, al detalle técnico.

Ejemplo de brecha (ilustrativo, a verificar en el código antes de mostrarlo):
- **Eje:** Mantenibilidad y Escalabilidad. **Proyecto:** Landing.
- **Hoy:** las fotos, los videos y el texto de cada sección están escritos dentro del código.
- **Por qué importa:** cada vez que queremos renovar fotos, agregar un video o cambiar una sección, hay que llamar a un desarrollador y publicar una nueva versión. No escala.
- **Qué haría falta:** un gestor de contenido donde el equipo de la empresa cambie textos, fotos y videos sin tocar el código, con un lugar propio para guardar los archivos multimedia.
- **Esfuerzo:** a estimar. **Beneficio:** alto.

#### 12.3 Cambios al contrato de datos

Agrega a cada hallazgo o mejora del diagnóstico:

```ts
type EjeGerencia = "mantenibilidad" | "escalabilidad" | "confiabilidad" | "seguridad" | "costoBeneficio";

interface BrechaGerencial {
  proyecto: "landing" | "cotizador" | "gerencial";
  ejes: EjeGerencia[];          // uno o varios
  nodos: string[];              // nodos afectados
  hoy: string;                  // cómo está, en lenguaje coloquial
  porQueImporta: string;        // efecto en el negocio
  queHariaFalta: string;        // una frase
  esfuerzo: "Bajo" | "Medio" | "Alto";
  beneficio: "Bajo" | "Medio" | "Alto";
  hallazgoOrigen: string;       // ID del hallazgo del que sale
}
```

- Los 11 ejes técnicos de la rúbrica **se conservan** para el modo técnico. Define en configuración la correspondencia hacia los 5 ejes de gerencia (por ejemplo: confiabilidad agrupa integridad del flujo y manejo de errores; mantenibilidad agrupa pruebas y organización del código; seguridad agrupa privacidad y control de acceso; escalabilidad agrupa concurrencia y capacidad de crecer; costo-beneficio agrupa costo y reutilización, más la relación esfuerzo-beneficio).
- Todo eje semáforo se calcula con la misma regla de siempre: lo no verificado queda como "Sin verificar" y no se pinta de verde.
- **No inventes brechas.** Si el diagnóstico no trae `BrechaGerencial`, muéstrame la brecha de datos y propón extender el generador. Los ejemplos de arriba son solo para mostrar el tono.

#### 12.4 Aplica a los tres proyectos

Landing, Cotizador y Gerencial usan exactamente la misma estructura: primero "qué tenemos hoy" y luego "qué hace falta" por los 5 ejes. Lo que cambia es el contenido, que sale de cada diagnóstico.

#### 12.5 Criterios de aceptación adicionales

- Desde la vista de cualquier proyecto puedo pasar, con un solo clic, de "qué tenemos hoy" a "qué hace falta" y ver los 5 ejes.
- Cada brecha se entiende sin saber programación y responde: cómo está, por qué importa, qué falta, cuánto cuesta y cuánto aporta.
- La lista de brechas empieza por lo que más aporta con menos esfuerzo.
- Un ejemplo como "el contenido de la landing vive dentro del código" aparece solo si el diagnóstico lo confirma.

Empieza por el plan del punto 10.1, e incluye en él cómo vas a representar los dos modos ("qué tenemos hoy" y "qué hace falta") y los 5 ejes.
