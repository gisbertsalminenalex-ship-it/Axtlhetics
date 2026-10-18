# Axtlhetics — Registro de Decisiones V1

**Estado:** vivo — se amplía decisión a decisión.
**Última actualización:** 2026-10-17.

## Qué es este documento

Este es el registro de las **decisiones de producto explícitamente aprobadas por Alex** posteriores al Documento Maestro.

Según `CLAUDE.md` §4, estas decisiones son la **fuente de verdad de mayor prioridad** del proyecto, por encima del propio `CLAUDE.md`, del Design System y del código. Hasta ahora no existía un lugar donde vivieran; este archivo lo es.

### Cómo se usa

- Antes de tomar cualquier decisión de producto, arquitectura o diseño, este documento se lee **primero**.
- Si una decisión de aquí contradice el Documento Maestro, `CLAUDE.md`, el Design System, la ficha de Fase 0 o el código, **manda la decisión de aquí**, y el documento contradicho debe actualizarse para reflejarla.
- Una decisión solo se cierra cuando está escrita en este archivo. Un acuerdo en una conversación no cuenta hasta que se registra.
- Lo que sigue marcado como PENDIENTE **no debe inventarse**. Se pregunta.

### Cómo se lee cada entrada

Cada decisión tiene un identificador estable (`D-00X`) que puede citarse desde el código, los commits y el resto de la documentación. Las decisiones no se borran ni se reescriben: si una queda superada, se marca como tal y se añade la nueva.

---

## D-001 — AXIS decide el entrenamiento del día

**Fecha:** 2026-09-07 · **Estado:** aprobada

Axtlhetics **no se basará principalmente en que el usuario elija manualmente una rutina**.

La idea central es que AXIS actúe como el **sistema de decisión** que determina qué entrenamiento tiene sentido hacer ese día.

### Entradas que AXIS debe poder considerar

De forma progresiva, no todas desde el primer día:

- historial de entrenamientos
- entrenamientos recientes
- Recovery Score
- sueño
- hidratación
- energía
- fatiga muscular
- estrés / estado de ánimo
- objetivos del usuario
- grupos musculares trabajados recientemente
- tiempo desde el último entrenamiento
- disponibilidad / duración de la sesión
- progresión de ejercicios

### Salidas que AXIS debe poder producir

- qué entrenar
- qué tipo de sesión realizar
- una sesión más ligera o más exigente
- modificar una sesión
- recomendar recuperación o no entrenar, cuando los datos indiquen que es la mejor decisión

Toda recomendación debe incluir una **explicación breve del motivo**.

Ejemplo de referencia del tono y la longitud esperados:

> «Hoy evitaremos cargar más las piernas porque tu fatiga muscular es elevada y ayer hiciste una sesión intensa.»

### Restricción técnica

En Core v0.1 **no se utilizará IA generativa externa** para tomar estas decisiones. El motor de decisión inicial de AXIS será **determinista y basado en reglas explícitas**.

La arquitectura debe permitir sustituir o ampliar ese motor determinista con IA más adelante **sin rehacer la aplicación**: AXIS queda desacoplado de la interfaz y del proveedor concreto.

### Qué queda superado

- La ficha de Fase 0 §2.9 planteaba como gap abierto «¿rutinas predefinidas? ¿el usuario las crea? ¿entrenamiento libre?». La respuesta es **ninguna de las tres como mecanismo principal**: la sesión la propone AXIS.
- El punto 2 de «Decisiones que debemos resolver antes de diseñar las pantallas» (Fase 0, resumen global) queda cerrado por esta decisión.

### Qué NO decide esta entrada

Ver `P-001`, `P-002`, `P-003` y `P-004` en la sección de pendientes: el grado de control del usuario sobre la sesión propuesta, el catálogo de ejercicios, cómo se captura la duración disponible y de dónde salen los objetivos del usuario siguen abiertos. *(Cerrados después: `P-004` por D-008; `P-001`, `P-002`, `P-003` y `P-009` por D-010.)*

---

## D-002 — Recovery Score: naturaleza y pesos

**Fecha:** 2026-09-07 · **Estado:** aprobada

El Recovery Score es un **índice orientativo interno de 0 a 100**. No debe presentarse como una medición médica ni como un diagnóstico.

### Pesos definitivos

| Indicador | Peso |
|---|---:|
| Sueño | 35 % |
| Energía | 20 % |
| Fatiga muscular | 20 % |
| Estrés | 15 % |
| Hidratación | 10 % |
| **Total** | **100 %** |

### Reglas asociadas

- Los pesos deben estar **centralizados en un único lugar del código** cuando llegue el momento de implementarlos, para poder modificarlos sin rehacer la lógica.
- El valor que muestra hoy el prototipo (82) es **solo un valor visual de mock** y no representa el resultado de esta fórmula.
- Si faltan datos suficientes para calcular el score, **el sistema no debe inventar un resultado**. Se usa el estado «datos insuficientes» que ya define el Design System §17.
- AXIS debe poder **explicar el resultado** de forma breve y comprensible.

### Qué queda superado

- El Design System §17 y §26 marcaban «fórmula, pesos y regla funcional definitiva del Recovery Score» como PENDIENTE. Los **pesos** dejan de estarlo. La normalización de cada indicador a 0–100 sigue pendiente (`P-005`).
- El punto 4 de la lista de decisiones abiertas de Fase 0 queda parcialmente cerrado.

---

## D-003 — El gráfico de rendimiento del Historial queda aprobado

**Fecha:** 2026-09-07 · **Estado:** aprobada

El bloque «Rendimiento +12 % vs. semana pasada» con su gráfico de líneas simple queda **aprobado para Core v0.1**.

Se considera una **estadística simple**, no un gráfico avanzado, y por tanto no entra en conflicto con la exclusión de «gráficos avanzados / análisis histórico profundo» de Fase 0 §5.2 ni con la ausencia de Progreso como pantalla de Core v0.1.

### Límite

El gráfico debe **seguir siendo sencillo** y no convertirse en un dashboard analítico. Esta aprobación cubre este gráfico y no autoriza añadir otros.

### Requisitos para cuando se implemente de verdad

- El +12 % debe **calcularse a partir de datos reales**.
- No debe quedarse hardcodeado.
- El gráfico debe funcionar correctamente **también cuando los valores sean iguales o no exista variación**.
- No debe producir `NaN` ni desaparecer por una división entre cero.

> Nota de auditoría: el defecto de división entre cero ya existe hoy en `components/screens/historial.tsx` (`LineChart`, cálculo `(p - min) / (max - min)`). Esta decisión lo convierte en un requisito explícito, no solo en un hallazgo.

---

## D-004 — Jerarquía de fuentes de verdad visual

**Fecha:** 2026-09-07 · **Estado:** aprobada

**El Design System es la fuente de verdad visual.**

La jerarquía es:

1. **Decisiones de producto aprobadas** (este documento)
2. **Design System** (`docs/design/DESIGN_SYSTEM_AXTHLETICS.md`)
3. **Código**

El código **no debe introducir valores visuales arbitrarios** que contradigan el Design System.

### Regla de conflicto

Si el Design System y la **referencia visual aprobada** (`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`) entran en conflicto:

1. primero se **actualiza el Design System** para reflejar la referencia visual aprobada;
2. después el **código sigue al Design System**.

Nunca al revés: un valor que esté en el código no queda aprobado por el hecho de estar en el código.

---

## D-005 — Radios, neutros, sombras y colores semánticos

**Fecha:** 2026-09-07 · **Estado:** aprobada

### Radios

**No** se fuerza que todos los elementos pasen a 8 px. La referencia visual aprobada utiliza radios distintos según el tipo de superficie o componente, y el Design System debe **distinguir los radios por tipo de componente** cuando sea necesario.

Principios:

- **8 px** puede utilizarse para controles, botones y elementos pequeños.
- Las **superficies y cards pueden utilizar un radio mayor** cuando así lo establezca la referencia visual aprobada.
- **No debe haber radios arbitrarios escritos directamente en los componentes** sin justificación: cada radio sale de un token con nombre.

El valor concreto del radio de superficie sigue pendiente (`P-006`).

### Neutros

Los colores neutros deben **centralizarse** y seguir los tokens aprobados del Design System. La referencia vigente es:

| Token | Valor |
|---|---|
| Texto primario | `#111111` |
| Texto secundario | `#6B6B6B` |
| Superficie | `#F7F7F7` |
| Borde | `#D6D6D6` |
| Azul primario | `#0A61F8` |
| Azul secundario suave | `#DCE8FF` |
| Track de progreso | `#EAEAEA` |
| Muted non-text | `#9A9A9A` |

**No deben aparecer grises arbitrarios** repartidos por los componentes (`#71757e`, `#6f737c`, y similares).

> Nota de auditoría: `app/globals.css` usa hoy `#71757e`, `#ececef`, `#f7f8fa` y `#0a0a0b` en lugar de los cuatro neutros de la tabla. La migración corresponde a la fase 2 (saneamiento). El delta visual es sutil y **no constituye un rediseño**, por lo que es compatible con `D-006`.

### Colores semánticos

Los colores semánticos que siguen marcados como PENDIENTES **no están aprobados**.

En concreto, **no** quedan fijados:

- `#1ba672` como success definitivo
- `#f2a516` como warning definitivo

Ambos permanecen como **valores provisionales del prototipo** hasta que exista una decisión explícita (`P-007`). Deben mantenerse centralizados en tokens para poder sustituirlos sin rehacer componentes.

### Sombras

Sin decisión nueva: sigue vigente el Design System §10 («sin sombras por defecto»). La discrepancia con las sombras sutiles que existen hoy en el código queda registrada como `P-008`.

---

## D-006 — El diseño visual aprobado no se rediseña

**Fecha:** 2026-09-07 · **Estado:** aprobada

El prototipo visual actual ha sido revisado y aprobado. **Ninguna de las decisiones anteriores debe provocar un rediseño.**

Se conservan, sin discusión:

- exactamente **4 tabs principales**: Inicio, Entrenamiento, Recuperación e Historial
- **Workout Summary como flujo interno**, no como tab
- **AXIS** como identidad y sistema de orientación
- **hidratación con exactamente 8 vasos**
- **Circular Metric** reutilizable
- estética **editorial + premium + tecnológica + limpia + informativa**
- azul primario **`#0A61F8`**
- tipografía y jerarquía visual aprobadas
- ausencia de sidebar de escritorio
- ausencia de dashboard denso
- ausencia de **Progreso y Perfil** como tabs de Core v0.1

### Cómo se concilia con D-005

`D-005` corrige **valores de token** (un gris por otro casi idéntico, un radio nombrado en lugar de un número suelto). `D-006` prohíbe **cambiar el diseño**: composición, jerarquía, densidad, navegación y lenguaje visual.

Sustituir `#71757e` por `#6B6B6B` es lo primero. Rehacer una pantalla es lo segundo. Solo lo primero está autorizado.

---

## D-007 — Decisiones mínimas tomadas durante la implementación

**Fecha:** 2026-09-08 · **Estado:** aplicadas, revisables

Ninguna es una decisión de producto: son la opción más pequeña que permitía avanzar sin inventar nada. Se registran para que puedan revertirse a conciencia.

### Dominio

- ~~**Catálogo de ejercicios semilla**: 13 ejercicios genéricos de gimnasio.~~ **Superado por D-008**: el catálogo se ha rehecho para peso corporal y una pesa de 5 kg.
- **Escalas de entrada** (`recovery/scales.ts`): energía, fatiga y estrés en 1–5; sueño en horas. Sueño normalizado por banda de edad (13–18 → 8–10 h; 19+ → 7–9 h; <13 → 9–11 h), con 0 puntos por debajo de 4 h y una penalización muy suave por encima de la banda que **nunca baja de 80**. Cubre lo pedido en `P-005`.
- **Política de datos suficientes** (`recovery/weights.ts`): el sueño es obligatorio y hacen falta al menos 3 factores registrados. Conservadora y centralizada en una constante. Cubre `P-010`.
- **La edad se guarda como número**, no como fecha de nacimiento. Es lo que pide el perfil y lo único que necesita la lógica de sueño; envejecerá y habrá que actualizarla a mano.
- ~~**La sesión en curso vive en memoria.** Si se cierra la aplicación a media sesión, se pierde (`P-014`).~~ **Superado el 2026-09-15**: se persiste en cada cambio (IndexedDB v6, almacén `activeWorkout`, una única fila) y se reanuda al arrancar. La sesión terminada se persiste siempre.

### Interfaz

- ~~La métrica «Carga» muestra siempre `—`.~~ **Superado por D-008**: ya se calcula, y solo muestra `—` cuando no hay sesiones recientes.
- ~~La banda baja se pinta con el token de aviso.~~ **Superado por D-008**: ya existe `--error` y la banda baja es roja.
- **El icono de campana de Inicio pasa a ser un icono de ajustes** que abre la pantalla interna de perfil. Era un control inerte y no había ninguna otra entrada al perfil. Notificaciones no está en el alcance de Core v0.1.
- **El icono de compartir del resumen desaparece.** Compartir sigue pendiente (Fase 0 §3.9) y era un control inerte.
- **El «···» del entrenamiento activo pasa a ser «saltar ejercicio»**, con su etiqueta accesible.
- **La X que descartaba la tarjeta de AXIS desaparece.** Descartarla dejaba Inicio sin ninguna acción principal, en contra del Documento Maestro 4.1. Su sitio lo ocupa «Cambiar entrenamiento», que sí está en D-001.
- **Se añade el `Set Stepper`** a las tarjetas de carga y repeticiones. Ya estaba previsto en el Design System §23 y es lo que permite registrar lo que se hace de verdad.

### Técnicas

- **`@vercel/analytics` deja de montarse.** El hosting aprobado es Netlify y CLAUDE.md §8 prohíbe enviar datos a servicios externos no aprobados. El paquete sigue en `package.json` hasta la siguiente instalación.
- **`typescript.ignoreBuildErrors` retirado** de `next.config.mjs`. El build vuelve a comprobar tipos.
- **`userScalable: false` retirado** del viewport: bloqueaba el zoom e incumplía WCAG 1.4.4.
- **Tests sin dependencias nuevas**: `node:test` con el *type stripping* nativo de Node 24, más un resolvedor de 20 líneas en `scripts/ts-resolver.mjs`. No se ha añadido ningún paquete.

---

## D-008 — Equipamiento real, catálogo y métrica de Carga

**Fecha:** 2026-09-08 · **Estado:** aprobada

### Equipamiento disponible

El equipamiento real es **peso corporal y una única pesa de 5 kg**. No hay gimnasio, barra, banco, máquina ni un segundo par de mancuernas.

Consecuencias, todas obligatorias:

- **No se proponen ejercicios que necesiten material inexistente.** Es un filtro, no una preferencia.
- Todo ejercicio que carga peso se modela como **unilateral**, porque solo hay una pesa. La única excepción razonable es la sentadilla sujetando la pesa con las dos manos. *(Ampliado por D-020: la excepción es una lista cerrada y testeada, `SINGLE_WEIGHT_BILATERAL_IDS`, con la sentadilla con pesa, el pullover con pesa y el hip thrust con pesa.)*
- La carga **no puede subir indefinidamente**: `MAX_AVAILABLE_LOAD_KG = 5`. Una vez ahí, la progresión pasa a repeticiones y, cuando el ejercicio se domina, a una **variante más exigente**.

El equipamiento vive en una constante (`AVAILABLE_EQUIPMENT`): cambiarla cambia lo que AXIS puede proponer sin tocar el motor.

### Catálogo

Cierra `P-004`. Son 23 ejercicios con metadatos completos: categoría (empuje / tirón / piernas / core), músculos principales y secundarios, equipamiento, unilateral o no, dificultad 1–5, progresión, regresión, tipo de estímulo, instrucciones y parámetros de trabajo. *(Ampliado por D-020: 39 ejercicios y una quinta categoría, movilidad; por D-020.1 a 43 y por D-025 a 44.)*

Sigue siendo **dato reemplazable**: añadir o quitar ejercicios no obliga a tocar la lógica, solo a rellenar los metadatos.

Las cadenas de progresión permiten que AXIS responda a «hoy toca una variante más ligera de empuje» con un ejercicio concreto, no con menos series.

### Carga / Training Load

Cierra `P-013`. Índice **orientativo interno** de 0 a 100 sobre los últimos 7 días, nunca una medición médica.

```
unidades de sesión = minutos × factor de intensidad × factor de esfuerzo
                     + volumen kg / 100
carga = suma de unidades / 420 × 100      (recortada a 0–100)
```

La frecuencia entra sola: más sesiones en la ventana, más unidades. Bandas: 0–39 baja, 40–74 moderada, 75–100 alta.

**Sin ninguna sesión completada en la ventana no se calcula nada**: la interfaz muestra «—». Toda la fórmula vive en `lib/domain/workouts/load.ts` y no se reparte por componentes.

> El volumen aporta poco con una pesa de 5 kg, y así debe ser: la carga de estas sesiones viene del tiempo y la intensidad. La constante existe para que el volumen cuente de verdad si algún día hay más material.

### Colores semánticos

Cierra `P-007`. Quedan aprobados como tokens:

| Banda | Rango | Token | Valor |
|---|---|---|---|
| Verde | 75–100 | `--success` | `#1ba672` |
| Naranja | 50–74 | `--warning` | `#f2a516` |
| Rojo | 0–49 | `--error` | `#d93b3b` |

Ningún componente escribe un color de estado suelto: todos pasan por `components/recovery-band.ts` y por los tonos de `CircularMetric`.

La Carga usa una semántica distinta a propósito, porque en ella «más» no es «mejor»: baja neutra, moderada en verde, alta en naranja.

### Icono de perfil

El acceso al perfil de Inicio usa un icono de **usuario**, no una campana. Misma posición y mismo tamaño: no hay cambio de composición.

---

## D-009 — Escalas de recuperación, datos suficientes y radios

**Fecha:** 2026-09-08 · **Estado:** aprobada

Cierra `P-005`, `P-006` y `P-010`. Las tres estaban implementadas y descritas en `D-007`, pero seguían listadas como pendientes en el Design System y en `CLAUDE.md`. Esta entrada las cierra formalmente y deja la documentación coherente con el código.

### Escalas de entrada (`P-005`)

Viven en `lib/domain/recovery/scales.ts`, cada una en su propia función pura y testeable.

| Indicador | Entrada | Normalización a 0–100 |
|---|---|---|
| Sueño | horas | Por banda de edad. Dentro de banda → 100 |
| Energía | 1–5 | `(n − 1) / 4 × 100`. Más es mejor |
| Fatiga muscular | 1–5 | `(5 − n) / 4 × 100`. Invertida |
| Estrés | 1–5 | `(5 − n) / 4 × 100`. Invertida |
| Hidratación | 0–8 vasos | `n / 8 × 100` |

Bandas de sueño de referencia: **13–18 años → 8–10 h**, 19+ → 7–9 h, menores de 13 → 9–11 h. Por debajo de la banda la puntuación cae de forma lineal hasta 0 en 4 h. Por encima baja muy despacio y **nunca por debajo de 80**: dormir de más no se trata como un problema.

De los tres componentes de sueño del Documento Maestro (horas, calidad, sensación al despertar) **solo se usan las horas**. Añadir los otros dos es una ampliación posterior que no rompe nada: entrarían como factores propios con su peso.

### Datos suficientes (`P-010`)

En `lib/domain/recovery/weights.ts`, deliberadamente conservadora y en un solo sitio:

- el **sueño es obligatorio** — pesa un 35 %, sin él el resultado sería una suposición;
- hacen falta al menos **3 factores registrados** en total.

Si no se cumple, no se calcula nada: la interfaz muestra «—» y explica qué falta. Los factores ausentes **no arrastran el resultado**: el peso se renormaliza sobre los que sí existen.

### Radios (`P-006`)

Se cierra siguiendo la regla de D-004: **el Design System se actualiza para reflejar la referencia visual aprobada**, y el código no cambia.

| Token | Valor | Uso real en la interfaz |
|---|---|---|
| `--radius-surface-lg` | `32px` | superficie protagonista: tarjeta de AXIS, tarjeta de sesión, tarjeta del Recovery Score |
| `--radius-surface` | `24px` | superficies y controles: botones, accesos rápidos, filas de lista, campos |
| `--radius-full` | `999px` | pills, chips, selectores circulares y controles redondos |

**Corrección respecto a D-005:** aquella entrada decía que 8 px «puede utilizarse para controles, botones y elementos pequeños». El prototipo aprobado **no usa 8 px en ninguna parte**: sus controles usan 24 px. Se retira `--radius-control: 8px` del Design System porque describía algo que no existe. Si en el futuro se quiere un radio pequeño, se añade aquí primero.

---

## D-010 — Cierre formal de los puntos derivados de D-001

**Fecha:** 2026-09-15 · **Estado:** aprobada

Cierra `P-001`, `P-002`, `P-003` y `P-009`. Los cuatro se fueron resolviendo en el código entre el 8 y el 13 de septiembre, cada uno con su commit y sus tests, pero seguían listados como pendientes. Esta entrada registra **cómo** quedaron resueltos para que la resolución sea una decisión y no un accidente de implementación. No cambia nada del comportamiento actual.

### Control del usuario sobre la sesión (`P-001`)

El usuario **no elige** una rutina, pero **negocia** la sesión propuesta y controla su ejecución:

- **Antes de empezar**, «Cambiar entrenamiento» abre una conversación acotada con AXIS (`lib/domain/axis/conversation/negotiation.ts`). AXIS pide el motivo y cede **por evidencia, no por insistencia**: acepta con un dato registrado o una carga que el usuario acaba de contar; sin evidencia se niega, explica y ofrece un punto intermedio. Puede pedir menos tiempo (`shorter`), otra zona, algo más suave o más exigente, o entrenar cuando AXIS frenaba (`train_anyway`, con criterio propio según el motivo del freno).
- Todo cambio termina en una **propuesta de acción tipada** que el usuario confirma con un botón (`lib/domain/axis/actions.ts`). Nada cambia porque haya escrito «sí» en el chat. La acción se valida contra la decisión **vigente** al confirmarla.
- **Durante la sesión**, el usuario ajusta carga y repeticiones serie a serie, salta ejercicios y puede abandonar. Todas esas diferencias quedan registradas como `modifications`.
- AXIS no inventa sesiones: elige entre las alternativas que el motor ya generó.

### «Rutina utilizada» (`P-002`)

Cada `WorkoutSession` guarda una **instantánea de la propuesta** que la originó (`ProposalSnapshot`: id, tipo, titular, motivo, foco e intensidad) y la lista de **modificaciones** respecto a ella (`proposal_changed`, `exercise_skipped`, `session_shortened`, `session_abandoned`). Es una copia, no una referencia: si la lógica de AXIS cambia mañana, el historial sigue contando qué se recomendó aquel día y qué se hizo de verdad. Vive en `lib/domain/workouts/types.ts`.

### Objetivos y duración disponible (`P-003`)

Salen del **perfil**, que existe como pantalla interna (D-007), no como pestaña:

- `goals` — entre 1 y 3 objetivos de entrenamiento; AXIS los usa para el rango de repeticiones y el estímulo de cada ejercicio (`session-builder.ts`).
- `typicalSessionMinutes` — duración habitual; AXIS la usa como disponibilidad base (`facts.ts`) y la recorta cuando el calendario del día lo exige (`MODIFIED_TRAINING`).
- `availableWeekdays` — días en los que el usuario suele entrenar.

La **duración disponible hoy**, cuando difiere de la habitual, no tiene un control propio: se comunica a AXIS en la conversación («solo tengo 20 minutos») y entra como petición `shorter`, que se acomoda porque el tiempo es un límite real y no una preferencia. No se añade ningún control nuevo a las pantallas aprobadas. *(Ampliado por D-017: también se puede pedir más tiempo, como petición `longer`.)*

### Día sin entrenar (`P-009`)

Cuando AXIS recomienda `RECOVERY` o `REST`:

- **Inicio** muestra el titular del estado («Día de recuperar.» / «Día de descanso.»), la explicación de AXIS y, como acción principal, **«Ver recuperación»** en lugar de «Empezar entrenamiento».
- **Entrenamiento** muestra «Hoy toca recuperar», sin lista de ejercicios, con la misma acción principal.

La composición y la jerarquía de ambas pantallas no cambian: cambia el contenido de la tarjeta protagonista y el destino del botón. Es coherente con D-006.

---

## D-011 — Memoria de AXIS: un registro por día

**Fecha:** 2026-09-17 · **Estado:** aprobada

Todo lo que AXIS recuerda de un día y no se deduce de los datos vive en **un solo registro por `dayKey`** (`AxisDayMemory`, `lib/domain/axis/memory.ts`), persistido en IndexedDB v7 (almacén `axisMemory`). Sustituye a `dayPlan` y `conversation`, que se funden en la migración v6→v7 y se eliminan en la misma transacción una vez copiados.

### Qué contiene

- la sesión confirmada hoy (`override`) y las actividades que hoy no ocurren;
- las cargas que el usuario ha contado y no están registradas (`reportedLoads`);
- el hilo de mensajes y el estado de cada propuesta de acción;
- dónde estaba la conversación: última intención, modo cambio y última petición.

### Reglas

- **«Cambiar entrenamiento» no borra el hilo.** Añade el mensaje de apertura y activa el modo cambio; si ya estaba activo, no se abre dos veces.
- **El modo cambio termina** al confirmar una acción, al cancelarla o al pulsar «Volver». Sobrevive a una recarga mientras dure.
- **Lo contado cuenta después.** Una carga contada en un mensaje sigue siendo evidencia para las peticiones posteriores del mismo día. Solo en la conversación: el motor, `deriveFacts` y las reglas no la leen. Se sigue diciendo que no consta registrada.
- **Terminar de entrenar retira solo la elección.** Cancelaciones, cargas, hilo y acciones se conservan.
- **La memoria de ayer no se aplica hoy.** Cada día empieza vacío; los registros de días anteriores se conservan sin límite, y por ahora nadie los lee. *(Enmendado por D-022: se lee un único campo del registro de ayer, `movedTo`, para saber si el entrenamiento de ayer se movió a hoy. Nada más de ayer se aplica.)*
- Ninguna inteligencia nueva: es memoria, no decisión.

---

## D-012 — AxisActionEngine: el ciclo de vida de una acción

**Fecha:** 2026-09-17 · **Estado:** aprobada

La ejecución de las acciones que AXIS propone vive en un módulo de dominio, `lib/domain/axis/action-engine.ts`, con una sola responsabilidad:

```
propuesta → comprobación → confirmación del usuario → aplicación → memoria guardada
```

**No es otro cerebro.** No decide qué entrenar (`AxisEngine`), no juzga si un cambio conviene (negociación) y no interpreta al modelo de lenguaje (`reconcileTarget`). Ejecuta de forma segura lo que el dominio ya permitió. No importa `rules`, `facts` ni `session-builder`; no conoce React, IndexedDB, el hosting ni el proveedor.

### Reglas

- **Solo la decisión vigente.** Al confirmar, la opción se vuelve a buscar en la decisión de ahora (`findProposal`). Se retira la «huella del contexto» (`contextFingerprint`/`recomputed`): revalidar es la protección, no una comparación de hashes.
- **Sin efecto contra la selección actual.** Una acción cuyo destino ya es la sesión seleccionada se rechaza como `sin_efecto`, aunque su origen fuera otro.
- **Nada queda aplicado antes de guardarse.** `executeAction` comprueba, aplica en memoria y guarda; devuelve la memoria guardada. Si guardar falla, el override no se aplica y la acción queda en error reintentable, sin ocultar el motivo.
- **Una vez.** Aplicada, cancelada o superada, una acción no vuelve a ejecutarse aunque se llame al dominio directamente. Dos confirmaciones casi simultáneas producen el mismo resultado.
- **Superseded.** Al aplicar una acción, las demás pendientes del día (incluidas las que estaban en error) pasan a `superseded` y pierden el botón. Las aplicadas y canceladas no se tocan.
- **Lo leído de disco se comprueba.** Una acción con forma desconocida se queda sin botón.
- `isSessionValid` usa el catálogo del contexto, el mismo con el que decidió el motor.

Sigue habiendo un único tipo de acción, `change_training`. Añadir otro exige extender la unión discriminada y pasar por el mismo ciclo.

---

## D-013 — Proveedor de lenguaje de AXIS: Groq, a coste cero

**Fecha:** 2026-09-19 · **Estado:** aprobada · **superada en parte por D-016**: Groq deja de ser el proveedor principal y pasa a ser el respaldo de Cloudflare Workers AI. El resto (coste objetivo 0 €, credencial solo en servidor, dominio independiente del proveedor, fallback determinista) sigue vigente.

La capa de lenguaje de AXIS (`lib/domain/axis/conversation/ai.ts` + el endpoint de servidor, hoy `app/api/axis-ai/route.ts` por D-014) usa **Groq** como proveedor, con el modelo `openai/gpt-oss-120b` (plan gratuito, producción). Sustituye a Gemini. Es un cambio de proveedor, no de arquitectura: el modelo sigue redactando y nada más; AXIS decide, `reconcileTarget` y `safety.ts` validan, `AxisActionEngine` ejecuta, el usuario confirma.

### Reglas

- **Coste objetivo: 0 €.** Solo el acceso gratuito de Groq. Si el plan gratuito deja de cubrir el uso, AXIS sigue funcionando con el determinista.
- La credencial es `GROQ_API_KEY`, solo en el endpoint de servidor. `GROQ_MODEL` permite cambiar de modelo desde el entorno.
- El dominio (`lib/domain/axis`) no importa ni nombra al proveedor; un test lo vigila.
- Fallback determinista intacto ante error, timeout, respuesta inválida, límite de uso o clave ausente.

---

## D-014 — Hosting: de Netlify a Vercel

**Fecha:** 2026-09-20 · **Estado:** aprobada

AXTHLETICS se despliega en **Vercel** en lugar de Netlify. Es un cambio de hosting, no de producto ni de arquitectura: la app sigue siendo local-first, con todo el estado en IndexedDB, y AXIS sigue decidiendo en el navegador.

### Qué cambia

- El único código de servidor —la capa de lenguaje de AXIS— pasa de una función de Netlify (`netlify/functions/axis-ai.mts`) a un route handler de Next (`app/api/axis-ai/route.ts`, runtime Node.js, `maxDuration = 10`). El contrato del endpoint es el mismo: `{ system, question, briefing, domain }` → `{ text, action }`, con los mismos códigos de error.
- El cliente llama a `/api/axis-ai`. Los guardarraíles (`reconcileTarget`, `safety.ts`), `AxisActionEngine`, la memoria y el dominio no se tocan.
- Deja de haber export estático (`output: 'export'`): un route handler POST no cabe en él. La página sigue prerrenderizada como HTML estático; el service worker y la PWA siguen igual.
- Las cabeceras de seguridad que vivían en `netlify.toml` las pone `next.config.mjs`.
- La comprobación de origen lee `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` y `VERCEL_BRANCH_URL` (sin esquema) más el host de la propia petición; `localhost` solo en desarrollo.
- El límite de tasa ya no se declara en código: es una regla del **Firewall** de Vercel sobre `/api/axis-ai` (por IP, ventana fija, 429), disponible en el plan Hobby. Los valores de referencia siguen en `RATE_LIMIT` (20 peticiones / 60 s). Hay que crearla a mano después del primer deploy.
- `GROQ_API_KEY` se configura en Vercel (Project → Settings → Environment Variables, entorno Production, Sensitive).
- **`@vercel/analytics` sigue sin montarse.** Estar en Vercel no aprueba la analítica: CLAUDE.md §8 sigue prohibiendo enviar datos a servicios no aprobados (D-007 se mantiene).

### Coste asumido

Al cambiar de origen (`axthletics.netlify.app` → `*.vercel.app`) **los datos actuales de IndexedDB no se conservan**: IndexedDB está atada al origen y la app no tiene exportación/importación. Se acepta explícitamente por ser una app en desarrollo.

---

## D-015 — Copia de seguridad local: exportar e importar

**Fecha:** 2026-09-22 · **Estado:** aprobada

AXTHLETICS incorpora **exportación e importación de todos los datos del dispositivo** como archivo JSON. Cierra el coste que D-014 había asumido explícitamente («la app no tiene exportación/importación») y cubre un riesgo que hasta ahora no tenía ninguna mitigación.

### Por qué

Core v0.1 es local-first: no hay cuenta, no hay servidor y no hay copia en ningún otro sitio. La consecuencia es que **el historial entero puede desaparecer sin que nadie lo borre**: iOS desaloja el almacenamiento de una PWA tras unos días sin abrirla, el usuario puede cambiar de teléfono, o limpiar los datos del navegador. Un archivo que el usuario guarda donde quiera es la única red posible sin introducir infraestructura que Core v0.1 no necesita.

Esto **no** abre la puerta a la nube, a cuentas ni a sincronización. Sigue sin haber servidor: el archivo no sale del dispositivo salvo que el usuario lo mueva.

### Qué se exporta

Perfil, actividades del calendario, recuperación de todos los días, sesiones de entrenamiento y memoria de AXIS (incluidas las conversaciones).

**Queda fuera la sesión en curso** (`activeWorkout`): es transitoria por diseño y restaurar media sesión de otro día no significa nada. Al restaurar se descarta también la que hubiera en el dispositivo, porque pertenecía a los datos que se acaban de sustituir.

### Formato

- Archivo JSON con envoltura: `kind: 'axtlhetics.backup'`, `schema` (versión **del archivo**, hoy 1), `exportedAt` y `appSchema` (versión del esquema de IndexedDB, informativa).
- `schema` y la versión de IndexedDB son **independientes**: la base puede subir de versión sin que el archivo cambie de forma, y al revés.
- Nombre: `axtlhetics-AAAA-MM-DD.json`.
- Una copia con `schema` mayor que el conocido **se rechaza**: puede tener campos que esta versión no sabría conservar.

### Importar reemplaza

Importar **sustituye** todo lo que haya en el dispositivo. No fusiona. Es lo que significa restaurar una copia, es predecible y evita tener que decidir quién gana en cada choque.

Reglas asociadas:

- Es destructivo, así que pasa por una **confirmación que dice con números qué se va a perder**, igual que el borrado de datos (D-007).
- La escritura es **atómica**: los seis almacenes se sustituyen en una única transacción. Una restauración a medias —perfil nuevo e historial viejo— sería peor que no restaurar.
- Una copia válida pero **vacía se rechaza** en vez de dejar el dispositivo en blanco.
- Los registros se validan **uno a uno**. Los que no se entienden se descartan, el resto se importa y **se dice cuántos se han descartado**. Que una sesión antigua esté corrupta no es razón para no devolver las demás.
- Tras restaurar, la aplicación **se recarga**. Cambia todo a la vez —perfil, historial, recuperación, memoria— y de ahí cuelgan la decisión del día, el briefing y la Carga; rehidratar eso pieza a pieza es la forma segura de que algo se quede apuntando a los datos anteriores.

### Dónde vive

En **Perfil → Copia de seguridad**, encima del borrado de datos, y además en el **primer paso del onboarding** («Ya tengo una copia de seguridad»). Lo segundo no es opcional: el dispositivo vacío es justo cuando hace falta restaurar, y sin ese acceso habría que completar el onboarding entero para llegar a Perfil y que la restauración lo borrase acto seguido.

### Privacidad

El archivo contiene datos personales y las conversaciones con AXIS. La interfaz lo dice donde se descarga: es para el usuario, no para compartir. No se envía a ningún sitio: la descarga la hace el navegador y la lectura es local.

---

## D-016 — Proveedores de lenguaje de AXIS: Cloudflare Workers AI, con Groq de respaldo

**Fecha:** 2026-09-29 · **Estado:** aprobada · Supera en parte a D-013.

La capa de lenguaje de AXIS pasa a usar **Cloudflare Workers AI** como proveedor principal, con el modelo `@cf/google/gemma-4-26b-a4b-it`. **Groq** (`openai/gpt-oss-120b`) queda como respaldo, y el **motor determinista** sigue siendo el último escalón. Es un cambio de proveedor, no de arquitectura: el modelo sigue redactando y nada más.

```
AXIS (motor determinista) → /api/axis-ai → Cloudflare Workers AI
                                         ↓ si falla
                                         Groq
                                         ↓ si falla
                                         el navegador responde con el determinista
```

### Qué no cambia

- El motor determinista es la autoridad sobre el estado del usuario, el entrenamiento, la recuperación, las recomendaciones, los cambios, las acciones, las confirmaciones, las cifras, la memoria y la seguridad. La IA solo redacta, explica y conversa sobre lo que el dominio ya ha decidido.
- El contrato del endpoint: `{ system, question, briefing, domain }` → `{ text, action }` o un código propio. El navegador no sabe qué proveedor ha contestado.
- `reconcileTarget`, `safety.ts`, `validateAction`, `AxisActionEngine` y la confirmación del usuario. El modelo no tiene herramientas, no ejecuta acciones y no modifica datos.
- El dominio (`lib/domain`) no importa ni nombra a ningún proveedor; un test lo vigila.
- Coste objetivo **0 €**: la cuenta de Cloudflare debe estar en el **plan gratuito de Workers**, donde agotar la asignación diaria de neurons produce un error (y responde Groq) en lugar de una factura.

### Nuevo destino de datos

Cloudflare pasa a ser un **destino aprobado** de datos personales, igual que Groq. Recibe lo mismo: el briefing recortado **sin el nombre** del usuario, la pregunta y la respuesta del dominio. Groq solo los recibe si Cloudflare falla. Ninguno de los dos se guarda en el servidor de AXTHLETICS.

### Cuándo se pasa de Cloudflare a Groq

Con cualquier fallo del proveedor: 429 (cuota o neurons), 5xx, 401/403 (credencial), otro 4xx, timeout, red caída, respuesta vacía, `finish_reason` distinto de `stop`, o texto que no es el JSON `{"message", "action"}`. Las mismas condiciones hacen que Groq caiga al determinista. Un proveedor sin configurar se salta sin contar como fallo.

**No** provocan fallback, porque se cortan antes de llamar a nadie o no son fallos del proveedor:

- una petición inválida del navegador (400/413) o de otro origen (403);
- un texto que la puerta de `safety.ts` rechaza, o una acción que `reconcileTarget` descarta: responde directamente el determinista, sin gastar una segunda llamada;
- que el navegador cierre la petición: se deja de gastar.

### Tiempo

Toda la cadena cabe en **7 s** (el navegador espera 8 s y la función corta a 10 s). Cloudflare tiene como mucho **4 s**; Groq, lo que quede, y no se le llama con menos de 1 s.

### Parámetros de Cloudflare

Endpoint compatible con OpenAI (`/client/v4/accounts/{account_id}/ai/v1/chat/completions`), `temperature: 0.3`, `max_completion_tokens: 400`, `response_format: json_object` y `chat_template_kwargs: { enable_thinking: false }`. `CF_MODEL` permite cambiar de modelo desde el entorno, como `GROQ_MODEL`.

### Credenciales

`CF_ACCOUNT_ID` y `CF_API_TOKEN` (un token personalizado limitado a Workers AI y a esa cuenta), junto a `GROQ_API_KEY`: solo en `.env.local` (ignorado por git) y en las variables de entorno de Vercel marcadas como Sensitive. Nunca con prefijo `NEXT_PUBLIC_`. Solo las lee la ruta `app/api/axis-ai/route.ts`, y los tests de límites fallan si otro archivo lo hace, si aparecen en el bundle del navegador o si el dominio las nombra. El token va siempre en la cabecera, nunca en la URL.

### Registro de uso

Para controlar consumo y rendimiento, la ruta deja **una línea de log por intento** en Vercel con metadatos: proveedor, modelo, estado HTTP, resultado, `finish_reason`, duración y `usage` (tokens y neurons, si la respuesta los trae). **Nunca** se registran prompts, briefing, preguntas, respuestas del modelo, cabeceras, credenciales, URLs completas ni cuerpos de error. Un test lo comprueba.

### Cifras inventadas

`safety.ts` añade la comprobación `invented_number`: **toda cifra del texto del modelo tiene que estar respaldada por la respuesta del dominio o por el briefing** que recibió. Si no, la respuesta se rechaza y contesta el determinista. Solo se admiten equivalencias explicables: un decimal redondeado a entero, una duración en segundos dicha en minutos, el signo de un porcentaje y la coma decimal. Las referencias de escala «/100» y «/8 vasos» (o «de 100», «de 8 vasos») no cuentan como dato; un 100 o un 8 sueltos, sí. Los ids y las marcas de tiempo del briefing no respaldan cifras.

### Afirmaciones sobre el usuario (añadido 2026-09-29)

**La ausencia de datos nunca se presenta como un hecho.** Revisando producción, AXIS dijo «esa zona no la has tocado estos días» sin historial registrado: la frase era del propio motor determinista (`evaluateWant`), que deducía de una lista vacía que la zona estaba libre.

- **Motor determinista:** al pedir una zona, el texto dice lo que registran los datos. Con sesiones registradas en los últimos 3 días: «En tus sesiones registradas de los últimos 3 días no aparece esa zona». Sin ellas: «No tengo registrada ninguna sesión estos días que haya cargado esa zona». Si el usuario ha contado una carga que afecta a esa zona, se reconoce sin darla por comprobada («lo que me cuentas que hiciste no está registrado, así que decido solo con lo que tengo»). **El veredicto y el destino de la acción no cambian**: lo contado por el usuario todavía no es motivo de rechazo al pedir una zona.
- **Modelo:** `safety.ts` añade `unsupported_claim`. Una afirmación sobre el usuario —historial, sueño, estado de recuperación, molestias o preferencias— solo se admite si la respuesta del dominio ya afirma algo de esa familia; el sueño, la última sesión y la comparación semanal también si el briefing los tiene registrados. Las afirmaciones de que algo **no** ha ocurrido («no la has tocado», «no has entrenado», «está libre») solo las puede hacer el dominio. Si no, responde el determinista. El prompt lo pide además explícitamente.
- Es una lista literal y explicable, no comprensión del texto: una paráfrasis fuera de la lista pasaría.

---

## D-017 — Pedir más tiempo en la negociación (`longer`)

**Fecha:** 2026-10-01 · **Estado:** aprobada · Amplía D-010 (`P-001`, `P-003`).

AXIS admite peticiones **explícitas** de aumentar la duración de la sesión del día. Hasta ahora la negociación solo contemplaba pedir menos tiempo (`shorter`), y las peticiones de más tiempo se leían mal: «quiero poner 15 minutos más de ejercicios» contenía «15 minutos» y entraba como `shorter`, y un «más larga» posterior heredaba ese `shorter`. En producción, AXIS contestaba a quien pedía más que no tenía una versión más corta.

### Qué cuenta como pedir más tiempo

- «Más larga», «más largo», «más tiempo», «más rato», «alargar»; «+15 min»; «15 minutos más», «10 minutos extra»; «añade 10 minutos».
- Se mira **antes** que acortar. Una cifra de duración sola sigue siendo `shorter` («solo tengo 15 minutos», «quiero algo de 20 minutos»); solo es `longer` con «más», «extra» o «+».
- «Más» a secas no basta: «más intensidad» y «más volumen» siguen siendo `harder`.
- Negado en el mismo tramo de frase no cuenta: «no tengo más tiempo» no es pedir más.

### Preguntas y peticiones

- Desde cualquier estado, una petición de más tiempo abre la negociación, igual que las demás peticiones con nombre propio. «+15 min» y «10 minutos extra» cuentan como petición aunque no lleven verbo de pedir.
- **Una pregunta no modifica la sesión**: «¿es mejor una sesión más larga?», «¿+15 min?» o «¿sería mejor añadir 10 minutos?» se responden como preguntas, sin veredicto ni acción.
- En modo cambio, una petición de más tiempo **no hereda** la petición anterior (`lastChangeRequest`): la corrige.

### Veredicto

Más minutos son más volumen, así que se juzga con los **mismos frenos deterministas que pedir más exigencia** (`harder`):

1. Recuperación baja → **rechazo**: no se alarga el entrenamiento, toca priorizar la recuperación.
2. Carga acumulada alta → **rechazo**.
3. Recuperación sin registrar → **pide datos** antes de decidir.
4. Recuperación suficiente y el motor **ya preparó** una alternativa de entrenamiento más larga que la sesión actual → **acepta** y la propone como acción, que el usuario confirma (D-010).
5. Recuperación suficiente sin esa alternativa → **compromiso**: la sesión se queda como está, sin propuesta ni acción.

AXIS **no inventa ejercicios, series, volumen, duración adicional ni una sesión nueva**. Solo elige entre las alternativas que el motor generó; si ninguna es más larga, lo dice. Hoy el motor no genera alternativas más largas que la principal (que ya usa `typicalSessionMinutes`), así que la respuesta habitual será el compromiso.

Al aceptar, la carga solo se cita como permiso si se conoce: con la carga sin datos, el texto no dice que «la carga acumulada lo permite». Se aplica igual al aceptar una petición `harder`.

No añade pantallas, controles, tipos de acción ni cambios en el motor de sesiones. Las respuestas son deterministas; la capa de lenguaje no interviene en ellas.

---

## D-018 — Partidos por fecha: actividades de un día concreto

**Fecha:** 2026-10-02 · **Estado:** aprobada · Amplía el modelo de deportes de D-007.

El partido **no es una propiedad fija de ningún día**. Puede ser sábado una semana, domingo la siguiente, entre semana, o no haberlo. Hasta ahora toda actividad del calendario era recurrente («cada sábado»): para mover un partido había que borrar el deporte y volver a crearlo, y el cambio valía para todas las semanas.

### Modelo

`ScheduledActivity` gana un campo opcional `date: DayKey | null`.

- **Sin `date`** (ausente o `null`): **recurrente**, cada semana en su `weekday`. Es el caso de los entrenamientos de un deporte, y el de todos los registros anteriores a esta decisión, que no cambian.
- **Con `date`**: **de un día concreto**, solo ese día. `weekday` se mantiene igual al día de la semana de la fecha, pero quien manda es la fecha.
- La fecha es un `DayKey` **local** (`YYYY-MM-DD`), igual que el resto del dominio. Nunca UTC.
- Los entrenamientos normales **no** se convierten en eventos con fecha.

### Comportamiento

- `activityOccursOn(activity, dayKey)` decide si una actividad ocurre un día. Los hechos de AXIS la usan para hoy y para mañana; las reglas (`demanding_activity_today`, `demanding_activity_tomorrow`) no cambian.
- Un partido con fecha **solo cuenta ese día**: no se repite la semana siguiente, y uno que **ya pasó deja de afectar** a AXIS sin que nadie lo borre.
- Una **semana sin partido** es simplemente una semana sin ningún evento de un día.
- Si el mismo día hay una actividad recurrente y un partido, cuentan las dos y decide la más exigente, como ya pasaba con varios deportes el mismo día.
- La cancelación de hoy por conversación («hoy no hay partido») funciona igual con un partido con fecha.
- Los **deportes** que AXIS conoce (`sportsFromActivities`) son solo los recurrentes: un partido de un día no es «un deporte que juegas los sábados».
- El briefing incluye además `upcomingDatedActivities`: las actividades de un día concreto **posteriores a hoy** (nombre, fecha e intensidad), por fecha. No deciden nada; sirven para que «¿Tengo partido hoy?» responda «Hoy no tienes deporte. Lo próximo con fecha: Partido el sábado 12 de septiembre» en vez de «No tienes ningún deporte registrado» cuando el único deporte es un partido futuro. Como el resto del briefing, también lo recibe la capa de lenguaje (sin el nombre del usuario), aunque esa pregunta la responde siempre el determinista.
- La decisión sigue siendo **determinista**. La capa de lenguaje no cambia y solo redacta.

### Perfil

- Al añadir una actividad se elige **«Cada semana»** (días de la semana, como hasta ahora) o **«Un día concreto»** (una fecha de los próximos 28 días).
- La fecha de un partido **se cambia en el sitio** (`updateActivity`), sin borrar ni recrear la actividad: conserva su id y su fecha de alta.
- El onboarding no cambia: registra deportes recurrentes.

### Datos

- **Sin migración de IndexedDB**: no cambia ningún almacén ni índice. Un registro sin `date` se lee como recurrente.
- La copia de seguridad acepta las actividades sin `date` (copias anteriores) y conserva la fecha en las nuevas. Una `date` que no es un día local descarta solo ese registro.

### Fuera de esta decisión

Cancelar por conversación un partido de **mañana**, una regla de recuperación para el día después del partido, una planificación semanal completa y un calendario visual. Siguen sin existir.

---

## D-019 — Flujo de entrenamiento: esfuerzo, objetivo, descanso y cierre

**Fecha:** 2026-10-02 · **Estado:** aprobada · Corrige el uso de `perceivedEffort` por la Carga (D-008).

La auditoría del flujo Entrenamiento → Ejercicio activo → Resumen encontró dos errores de datos que afectaban a lo que AXIS decide, y huecos frente a la Fase 0 (§2 y §3). Durante el entrenamiento manda una pregunta: **qué tengo que hacer ahora**.

### Esfuerzo, no sensación

El resumen preguntaba «¿Cómo te has sentido?» (1 = muy mal, 5 = excelente) y la Carga leía ese número como **esfuerzo** (1 = ×0,7, 5 = ×1,3). Quien acababa hundido bajaba su Carga, y la Carga alta es la que frena `harder` y `longer` (D-017).

- El resumen pregunta **«¿Cuánto te ha costado?»**: 1 Muy fácil … 5 Al límite, con números y no con caras.
- Se guarda en un campo nuevo, `WorkoutSession.effort`, que es el que lee la Carga.
- `perceivedEffort` se **conserva** en lo ya guardado, pero no se reinterpreta: la Carga deja de leerlo y las sesiones nuevas lo guardan a `null`. Las sesiones antiguas cuentan como sin valorar (factor 1).

### Objetivo junto a lo hecho

`PerformedExercise` guarda `targetSets` y `targetReps`. La progresión de AXIS solo da un ejercicio por hecho si se completaron **todas las series previstas y ninguna por debajo del objetivo** (`metTarget`). Antes, como toda serie registrada se marca completada, hacer 2 de 3 series o bajar las repeticiones contaba como hecho y AXIS subía la carga la sesión siguiente. Las sesiones sin objetivo (anteriores) se juzgan como antes.

### Descanso

Arranca **solo** al completar una serie, con los segundos del ejercicio. Cuenta atrás en una Circular Metric, lo que viene después, «Saltar descanso» y «+15 s». Al llegar a cero vuelve a la serie. Se guarda con la sesión en curso, así que sobrevive a una recarga. No hay descanso tras la última serie de la sesión. Especificado en el Design System §23 («Rest Timer»).

### Errores de toque

- **Deshacer última serie**: quita la serie recién registrada y vuelve a ella aunque hubiera hecho pasar de ejercicio, con sus reps y su carga. Solo la última: no es un historial.
- **Saltar ejercicio** pide confirmación en la propia pantalla, como salir.

### La última vez y los récords

- En el ejercicio activo, una línea discreta: «La última vez: 3 × 10 · 5 kg», de la sesión **completada** más reciente que lo tenga. Sin dato no se dice nada.
- En el resumen, **récords personales** solo frente a algo registrado antes: más peso o, con el mismo peso (o sin carga), más repeticiones. La primera vez no es récord. Las sesiones interrumpidas no fijan marcas ni las baten. Sin insignias.
- Un récord **cuenta aunque el ejercicio quedara sin completar**, pero se dice claramente: en la lista lleva «Ejercicio sin completar», y AXIS lo anuncia aparte («…también superaste tu mejor marca, aunque sin completar lo previsto»). Superar una marca no se confunde con haber hecho todo lo previsto.

### Estadísticas durante la sesión

Ejercicios, Duración estimada y Volumen **se mantienen**, pero en segundo plano: cifras pequeñas en gris y «Ver detalles» sin azul. El protagonismo es del ejercicio, la serie y «Completar serie». La composición aprobada (D-006) no cambia: solo baja el peso visual de esa fila.

### Resumen

- El texto de AXIS es un **mensaje de cierre determinista** (`closingMessage`), no el motivo con el que se propuso la sesión: veredicto primero, sin cumplidos ni exclamaciones, y solo lo que el sistema hace de verdad.
- **Abandonar también pasa por el resumen**: se ve lo hecho y se puede valorar el esfuerzo. Sin el check verde de éxito.
- Cada ejercicio dice sus series reales (`3 × 10 · 5 kg`, o `10, 8, 6` si fueron distintas; segundos en los isométricos). Sin «0 kg» en los de peso corporal.

### Datos

Sin migración: `effort`, `targetSets`, `targetReps`, el descanso y el deshacer son campos **opcionales**. Las sesiones, copias de seguridad y sesiones en curso anteriores se siguen leyendo; un valor imposible descarta solo ese registro.

### Fuera de esta decisión

Previsto para una **versión futura**, decidido por Alex y fuera de D-019:

- vibración o sonido al terminar el descanso;
- consejos de AXIS durante el descanso;
- conservar el resumen si se recarga la app en él.

Tampoco existe deshacer tras la última serie de la sesión: la sesión se cierra sola.

---

## D-020 — Catálogo ampliado y rotación de ejercicios

**Fecha:** 2026-10-03 · **Estado:** aprobada · Amplía D-008 (catálogo y excepción bilateral).

La app se sentía limitada por dos motivos, y los dos se corrigen aquí: el catálogo era corto (23 ejercicios, cero de movilidad) y, sobre todo, **la selección no rotaba**: con el mismo foco y la misma dificultad salían siempre los mismos ejercicios, y algunos (curl, extensión de tríceps, peso muerto, puente, gemelos) no salían nunca.

### Equipamiento

**Exactamente el de D-008**: peso corporal, una única pesa de 5 kg y una silla o superficie elevada cuando corresponda. No se añade barra, poleas, máquinas, bandas, kettlebells, barra de dominadas, dos mancuernas ni ningún otro material.

### Catálogo: 39 ejercicios

Se conservan los 23 de D-008 **con sus ids**: el historial, la progresión y los récords dependen de ellos. Se añaden 16:

| Ejercicio | Grupo | Material | Nota |
|---|---|---|---|
| Press de suelo unilateral con pesa | pecho | pesa | Único pecho con carga; el suelo limita el recorrido del hombro |
| Flexiones declinadas | pecho | silla | Silla contra la pared; dificultad 4 |
| Flexión pica | hombros | — | Hombro sin material |
| Patada de tríceps unilateral | brazos (tríceps) | pesa | Sustituye a los fondos en silla |
| Y-T-W boca abajo | espalda | — | Espalda sin material |
| Pullover con pesa | espalda | pesa (dos manos) | En el suelo, zona lumbar apoyada |
| Curl martillo unilateral | brazos (bíceps) | pesa | Agarre neutro |
| Elevación de gemelos a una pierna | piernas (gemelos) | — | Progresión de la elevación de gemelos |
| Sentadilla isométrica en pared | piernas (cuádriceps) | — | Isométrico, 30 s de base |
| Subida al escalón | piernas | escalón firme | Nunca un sofá |
| Puente con talones en silla | piernas (isquios) | silla | Sustituye al puente a una pierna |
| Hip thrust con pesa | glúteos | silla + pesa (dos manos) | Espalda en sofá o silla contra la pared |
| Plancha con toque de hombro | core | — | Antirrotación |
| Gato-camello | movilidad | — | |
| Rotación torácica a cuatro patas | movilidad | — | |
| Estiramiento de flexor de cadera | movilidad | — | Isométrico, 30 s de base |

Sustituciones de la propuesta inicial: **los fondos en silla**, por la carga del hombro en extensión y el riesgo de que la silla vuelque; **el puente de glúteos a una pierna**, porque con el hip thrust habría tres variantes del mismo puente e isquios seguía con un solo ejercicio. Pospuestas: la elevación lateral (5 kg fijos son demasiado para un principiante), el remo invertido bajo una mesa (seguridad), el cardio (burpees, mountain climbers) y el russian twist.

No hay campo de agarre: una variante de agarre es un ejercicio propio con su id, como ya pasaba con las flexiones.

### Movilidad

Quinta categoría, `movilidad`, con exactamente esos tres ejercicios. El foco «Core y movilidad» toma de `core` y de `movilidad`. Dificultad 2, en el centro de la escala. **No cuentan como grupos cargados** de la sesión: un estiramiento de cadera no es haber trabajado piernas, y AXIS no debe evitar piernas al día siguiente por él.

### Bilateral con una sola pesa

Lista **cerrada y testeada** (`SINGLE_WEIGHT_BILATERAL_IDS`): sentadilla con pesa, pullover con pesa e hip thrust con pesa. Todo lo demás que carga peso sigue siendo unilateral. No es una regla general: añadir uno es una decisión.

### Rotación

Determinista, sin IA, con el historial que el motor ya recibe (`recentSessions`). Dentro de cada categoría, los candidatos se ordenan por:

1. dificultad a ±1 del objetivo antes que más lejos;
2. **el que lleva más tiempo sin usarse** (nunca usado, el primero), mirando la variante que de verdad se hará;
3. a igual antigüedad, el usado menos veces;
4. el más cercano a la dificultad objetivo;
5. el orden del catálogo.

Las categorías también rotan: empieza la que lleva más tiempo sin usarse, para que en una sesión corta de cuerpo completo no se quede fuera siempre la misma (antes, el core). **Sin historial, la selección es exactamente la de antes.** Un ejercicio fuera del margen de dificultad no está excluido para siempre: no toca para el nivel actual y entra cuando el nivel cambia.

«Usado» es tener al menos una serie en cualquier sesión, completada o interrumpida. Los grupos que hay que evitar se filtran antes de rotar, como siempre.

### Ejercicios saltados

Saltar un ejercicio (confirmado) es una señal de rechazo, no de que se hizo:

- Para la rotación cuenta como usado ese día durante **14 días** (`SKIP_PENALTY_DAYS`). AXIS no lo vuelve a proponer de inmediato; pasado ese tiempo, la señal caduca y compite como cualquier otro.
- **No toca la progresión ni los récords**, que solo miran series hechas.
- La sesión no guarda el id del saltado, solo la frase «<nombre> sin completar.» que ya escribía la app; los nombres del catálogo son únicos (test), así que el nombre identifica al ejercicio. Un test de contrato usa el texto real de `skipExercise`. Funciona también con las sesiones guardadas antes de D-020. Si un día se renombra un ejercicio, sus saltos antiguos dejan de reconocerse (solo afecta a la rotación, y caducan en 14 días de todos modos).

### Conversación

Al preguntar por la primera palabra de un ejercicio («¿cómo hago el puente?»), AXIS responde por el **básico** y no por su variante más larga: con el catálogo ampliado, varios comparten la primera palabra.

### Lo que no cambia

Training, ejercicio activo, resumen, persistencia, copias de seguridad, D-016, D-017 y D-018. La progresión por `exerciseId` es la misma. Consecuencia aceptada, no corregida aquí: como cada ejercicio aparece menos a menudo, su progresión es más lenta.

---

## D-020.1 — Catálogo / variedad y familias

**Fecha:** 2026-10-04 · **Estado:** aprobada · Extiende D-020. (D-021 sigue reservado al test mensual de evolución física.)

La auditoría posterior a D-020 concluyó que **el catálogo ya no es el cuello de botella**: con la rotación, los 39 ejercicios aparecen (entre 9 y 45 veces en 240 sesiones simuladas, ninguno excluido). Quedaban tres huecos reales y un problema de variedad dentro de la sesión. Se resuelven con lo mínimo.

### Cuatro ejercicios, no más (39 → 43)

| Ejercicio | Categoría | Hueco que cubre |
|---|---|---|
| Zancada lateral | piernas, dificultad 2, regresión: Sentadilla | Todo el trabajo de piernas era adelante-atrás; faltaba el plano frontal (aductores, glúteo medio) |
| Estiramiento de isquiotibiales | movilidad, ~30 s | Movilidad de la cadena posterior, que no existía |
| Tobillo a la pared | movilidad | Dorsiflexión de tobillo, útil para sentadillas y zancadas |
| Ángeles en la pared | movilidad | Movilidad de hombro y torácica, de pie. No equivale a Y-T-W, que es fuerza boca abajo |

La movilidad era el grupo más concentrado: el foco «Core y movilidad» toma 2 de sus 4 ejercicios de movilidad, y con solo 3 opciones cada una salía 2 de cada 3 sesiones. Con 6, sale 1 de cada 3.

Los nombres evitan una primera palabra genérica («Tobillo a la pared», no «Movilidad de tobillo…»), para que la resolución de ejercicios no confunda «¿qué hago de movilidad?» con un ejercicio.

**No se añade la sentadilla a una pierna a la silla**: es válida, pero para Core v0.1 no compensa su complejidad frente a lo que ya cubren la zancada búlgara, la subida al escalón y el peso muerto unilateral. Se reconsiderará si el nivel avanzado de piernas demuestra un hueco real. No se añade nada más: ni variantes casi idénticas, ni material fuera de D-008.

### Familias

La rotación evitaba repetir el **mismo ejercicio**, pero no dos variantes casi equivalentes en la **misma sesión**: en la simulación, 30 de 240 sesiones (12,5 %) juntaban, por ejemplo, Zancadas y Zancada atrás, dos flexiones o dos puentes.

`Exercise.family` es un campo **opcional** del catálogo, solo donde agrupa variantes del mismo patrón. Nueve familias: `flexion`, `triceps`, `remo`, `curl`, `sentadilla`, `zancada`, `puente`, `gemelos`, `plancha`. Se quedan **sin familia** los que se diferencian de verdad: la flexión pica (empuje vertical), los dos press (vertical y horizontal), la plancha lateral, la zancada lateral (otro plano), la subida al escalón y toda la movilidad. Un ejercicio sin familia no comparte nada con nadie y se comporta exactamente como antes.

La familia **no se guarda** en las sesiones: el historial, las copias de seguridad y la progresión no cambian.

### Prioridad de selección

1. **No repetir ejercicio**: la rotación de D-020 (el que lleva más tiempo sin usarse) y nunca el mismo id dos veces en una sesión.
2. **No repetir familia en la sesión** si hay alternativas válidas.
3. **Fallback**: si evitando familias no se completa la sesión, una segunda pasada por el mismo orden permite repetir familia. Variedad preferida, no restricción: la sesión nunca sale más corta que antes.

La primera pasada es la selección de siempre, solo que aparta un candidato cuya familia ya está; sin conflictos de familia, el resultado es idéntico al de D-020. Sigue siendo determinista.

### Resultado (240 sesiones simuladas: 5 niveles × 4 focos × 12 semanas)

- Sesiones con familia repetida: **30 → 0**.
- Sesiones incompletas: 0 antes y después; 4 ejercicios por sesión.
- Ningún ejercicio excluido. Los cuatro nuevos aparecen (zancada lateral 12; movilidad 20 cada uno).
- Cada ejercicio de movilidad: de 40 apariciones a 20.

### Lo que no cambia

Training, la progresión, las regresiones, la persistencia, las copias de seguridad, la resolución de ejercicios, D-016, D-017 y D-018. No se renombra ni se elimina ningún ejercicio.

---

## D-021 — Test de evolución

**Fecha:** 2026-10-04 · **Estado:** aprobada · **diseño UX/UI aprobado** (2026-10-04): lista para implementar.

El usuario mide periódicamente su rendimiento en cuatro pruebas fijas y lo compara **consigo mismo**. No mide «la forma física»: registra cómo rindió en estas pruebas respecto a su test anterior. Forma parte de Core v0.1 como **flujo interno de Entrenamiento**, sin pestaña nueva ni pantalla de progreso.

Ningún documento anterior lo definía; el Documento Maestro solo pide «comparar la evolución» y que AXIS detecte «mejoras o estancamientos». Los retos mensuales del Documento Maestro son gamificación y siguen fuera.

### Principios

Medir, no puntuar. Compararse con uno mismo. Sin métrica global, sin gamificación, sin métricas corporales, sin percentiles ni comparación con población, sin carga inventada. No altera la progresión ni los récords del entrenamiento. Técnica antes que agotamiento. La interfaz transmite *medir → registrar → comparar → entender*, no *competir → superar → ganar*: el usuario objetivo es adolescente.

### Protocolo v1

Orden fijo, `protocolVersion = 1`:

| # | Prueba | `exerciseId` | Medida | Carga |
|---|---|---|---|---|
| 1 | Flexiones (variante del usuario) | familia `flexion` | repeticiones | — |
| 2 | Plancha | `plancha` | segundos | — |
| 3 | Sentadilla isométrica en pared | `sentadilla-isometrica-pared` | segundos | — |
| 4 | Remo unilateral con pesa | `remo-unilateral` | repeticiones, izquierdo y derecho | 5 kg |

«Máximo» es **rendimiento con técnica válida**, no agotamiento: «haz tantas como puedas manteniendo una técnica correcta; para cuando ya no puedas» y «mantén la posición mientras la técnica sea válida».

**Variante de flexiones.** En el primer test AXIS recomienda una según el nivel —**principiante → inclinadas; intermedio y avanzado → estándar**— y el usuario puede elegir otra («Para tu primer test recomendamos flexiones inclinadas. Si prefieres, puedes elegir otra variante»). Una vez elegida queda **fijada** para los tests siguientes; AXIS no la cambia. Si el usuario cambia de variante, empieza una **línea base nueva** para ella: no se calcula una diferencia entre variantes.

### Disponibilidad y quién lo inicia

Disponible solo si se cumplen todas:

- han pasado **28 días o más desde el último test completado** (un test interrumpido no cuenta);
- el usuario **no ha entrenado hoy** ni ha hecho o interrumpido un test hoy;
- la recuperación de hoy es **conocida y no está en la banda baja** (0–49). Con «datos insuficientes» **no** está disponible: es un esfuerzo máximo y sin datos no se sabe si la recuperación es baja;
- **no hay un deporte de intensidad alta hoy ni mañana**. El de hoy cuenta aunque ya haya terminado;
- el veredicto de AXIS para hoy **no es descansar**: ofrecer un esfuerzo máximo el día que AXIS recomienda descanso contradice su recomendación.

Antes de los 28 días no se muestra; sin contador.

**Lo inicia el usuario.** El motor no sustituye la sesión del día por el test. AXIS avisa de que está disponible en la **tarjeta de Entrenamiento** (opción secundaria, «Hacer test», sin competir con el entrenamiento del día) y en la **conversación** cuando tenga sentido. Inicio no cambia.

### Flujo

Introducción (4 pruebas, 10–15 min, qué se mide, fecha del test anterior) → prueba activa (solo la prueba y su resultado) → resultado → descanso (temporizador de D-019, saltable) → siguiente prueba → resumen.

- **Resultados**: control propio, **sin el límite de 50** del selector de entrenamiento. Las pruebas de segundos usan un **cronómetro integrado** (empezar / parar) y el resultado se puede **editar** al terminar. El remo registra izquierdo y derecho por separado; se muestra «12 / 11 reps» y no se promedia.
- **Variantes de flexiones elegibles**: inclinadas, estándar, declinadas y diamante. Las **negativas quedan fuera**: son solo la bajada controlada y sus repeticiones no son comparables con las de repeticiones máximas.
- **Descanso entre pruebas**: **2 minutos**, con el temporizador de D-019: «+15 s» y «Saltar descanso». Sin «−15 s»: para eso está saltar.
- **Recarga o cierre**: se reanuda el mismo día; al cambiar de día se descarta.
- **Salir a mitad**: pide confirmación, como abandonar un entrenamiento. Si se confirma, el test queda **interrumpido**.
- **Interrupción**: un test sin las cuatro pruebas **no está completado** y no entra en ninguna comparación ni marca. Sí cuenta como actividad del día para AXIS: hubo esfuerzo real.

### Comparación y lenguaje

Solo con el **test completado anterior compatible** (mismo protocolo, ejercicio, variante, medida y carga).

- «+3 reps», «−8 s»: la diferencia exacta. Signo menos siempre «−».
- «No cambio» solo con el resultado **exactamente** igual. No hay margen de tolerancia. *(Antes «Sin cambio»; cambiado por Alex el 2026-10-05.)*
- «Línea base» si no hay anterior compatible.
- Remo: cuenta como mejora solo si mejoran **los dos lados** y ninguno empeora; si uno mejora y otro empeora es **mixto**, con los dos datos («+2 / −1»).
- Nunca porcentajes de forma física, «más fuerte», niveles ni interpretaciones más allá de los datos.

**AXIS al terminar**: mensaje determinista que resume los datos («Has mejorado en 3 de 4 pruebas respecto a tu test anterior»; «Este es tu primer test. A partir de ahora tendremos una línea base para comparar tu evolución»). No afirma que el usuario esté más en forma, más fuerte en general, ni atribuye causas.

### Mejores marcas del test

Cada test guarda sus propias mejores marcas por prueba y variante («Mejor resultado en test: 17 flexiones»), visibles en el **resumen** y en el **detalle del historial**. Son independientes de los récords de entrenamiento: un test nunca modifica `personalRecords`, la progresión, `lastPerformanceOf`, los objetivos de series ni la rotación.

### Historial

Sección «Tests de evolución» dentro de Historial, sin pantalla nueva: cada test con su fecha; al abrirlo, los cuatro resultados, la comparación con el anterior compatible, las mejores marcas y el protocolo. Sin gráficas, curvas, puntuación, ranking ni medallas.

### Relación con AXIS y Training

El test **no** es una sesión de entrenamiento: no consume rotación, no modifica la progresión, no genera Carga, no cambia objetivos ni genera récords de entrenamiento.

Un test completado **o interrumpido** genera un hecho de AXIS: ya hubo actividad física relevante hoy. AXIS lo trata como la regla existente de «ya has entrenado hoy», con su propia explicación («Has completado un test de evolución hoy, así que no necesitas otro entrenamiento»). Es el único cambio en el motor.

Los resultados no se envían a la capa de lenguaje en v1.

### Datos

- Entidad propia `Assessment`, separada de `WorkoutSession`, para no contaminar a sus consumidores. Guarda `protocolVersion` y, por prueba, ejercicio, variante, medida, valor, carga y lado cuando corresponda, y la fecha.
- Estados: disponible, no disponible, en progreso, completado, interrumpido. Solo **completado** entra en comparaciones y marcas.
- Almacén `assessments` con **IndexedDB v7 → v8**. La migración solo crea el almacén; no toca datos existentes.
- Copia de seguridad **schema 2**, que incluye los tests y sigue aceptando las copias de schema 1 (sin tests).

### Fuera de D-021 v1

Test de movilidad, otros protocolos, composición corporal, estimaciones fisiológicas, puntuación global, comparación con población, objetivos automáticos, el test como sesión elegida por el motor, una fórmula de carga del test, análisis avanzado con IA y cambios en Inicio.

### Diseño

Diseño aprobado el 2026-10-04 (bocetos: https://claude.ai/artifact/LqMXoZQMQ39y9G4RwvWMPM): entrada desde Entrenamiento, introducción con elección de variante, prueba de repeticiones, prueba con cronómetro, remo por lados, confirmación de salida, descanso, resumen, Historial → Tests de evolución y detalle de un test. Las diferencias se muestran en texto neutro, no en colores de estado, y durante la prueba no se muestra el resultado anterior.

### Decisiones de implementación aprobadas

Aprobadas por Alex el 2026-10-04, después del dominio (`1c49337`):

1. **Remo con un lado que mejora y el otro igual** (por ejemplo «+2 / 0»): el resultado es **mixto**, no mejora.
2. **Salir antes de registrar ningún resultado** no deja rastro y no cuenta como actividad del día.
3. **Un test a medias que se intenta continuar otro día** se considera **interrumpido**: no se reanuda y no entra en ninguna comparación oficial.
4. **Límites de entrada**: máximo **500 repeticiones** y **3600 segundos**. No son métricas: solo impiden guardar un valor imposible.
5. Si hay un **test en curso del mismo día**, la tarjeta de Entrenamiento muestra **«Continuar test»** en lugar de «Hacer test».

Aprobadas por Alex el 2026-10-05, antes de conectar el test a la aplicación:

6. **«AXIS recomienda descansar»** es la **decisión del motor**, no la elección manual del usuario: si el usuario eligió descansar sobre una propuesta de entrenar, esa condición no bloquea el test.
7. AXIS **solo menciona el test en la conversación cuando el usuario pregunta por él**. No lo anuncia por su cuenta.
8. La migración de **IndexedDB v7 → v8 es solo hacia delante**: no se vuelve a una versión con v7. Antes de publicarla se hace una copia de seguridad real y cualquier problema se corrige con una versión nueva. La migración solo crea el almacén `assessments` y elimina, si están vacíos, los almacenes antiguos `dayPlan` y `conversation` que la v7 dejaba en las instalaciones nuevas.
9. **Copia de seguridad schema 2**: incluye los tests. Una copia de schema 1 se sigue importando, sin tests; como importar reemplaza (D-015), importar una copia antigua deja el dispositivo sin tests.

---

## D-022 — Reorganización flexible del entrenamiento

**Fecha:** 2026-10-04 · **Estado:** aprobada · Amplía D-010 (negociación) y D-012 (acciones). Enmienda D-011.

AXTHLETICS **sigue decidiendo el entrenamiento día a día**. No hay plan semanal y D-022 no lo crea: reorganizar es cambiar la elección de hoy o dar a AXIS un dato que no tenía, y dejar que el motor vuelva a decidir. **Nunca se copia una sesión entre días.**

### Los siete casos

1. **«Hoy no puedo entrenar».** No poder es un límite real, como el tiempo, no una preferencia: AXIS lo acepta y propone recuperación para hoy (acción `change_training`). Solo cambia la elección de hoy. Si ya entrenó hoy, o hoy ya no tocaba entrenar, no hay nada que cambiar. «No quiero entrenar» sigue siendo `rest`, con sus frenos de siempre; «no puedo más» sigue siendo cansancio.
2. **«Mover el entrenamiento de hoy a mañana».** Hoy pasa a recuperación y **mañana queda marcado como disponible para entrenar**, aunque no sea un día marcado en el perfil. **No se copia la sesión**: mañana el motor decide con el contexto de mañana, y si mañana la recuperación es baja, propondrá descansar. Se rechaza, con una alternativa, si ya entrenó hoy, si hoy no tocaba entrenar, si **mañana hay un deporte de intensidad alta** o si el entrenamiento de hoy **ya venía movido de ayer**: como máximo un aplazamiento desde el día de origen. La tarjeta de Entrenamiento muestra «Movido a mañana» como contexto; Inicio puede decirlo brevemente. Sin cards, pestañas ni composiciones nuevas.
3. **«Ayer no pude entrenar».** Respuesta informativa: no se recupera acumulando, no hay sesión doble, y el foco de hoy ya prioriza lo que más tiempo lleva sin trabajarse. No modifica nada.
4. **Minutos concretos** («solo tengo 20 minutos», «media hora»). El número se usa de verdad: con confirmación (acción `set_available_minutes`) pasa a ser el tiempo disponible de hoy y el motor vuelve a decidir con él. Solo baja el tiempo, nunca lo sube. **Por debajo del mínimo de sesión (20 min) no se genera una sesión estructurada**: AXIS propone descansar o hacer movilidad libre, que no cuenta como sesión de entrenamiento. Fijar minutos retira la elección anterior de hoy, porque con otro tiempo puede no existir; «Deshacer» la restaura.
5. **Fatiga expresada en la conversación.** Si la fatiga no está registrada, AXIS pide registrarla en Recuperación. **No inventa ni guarda ese dato desde la conversación.** Si está registrada, las reglas ya la tienen en cuenta y AXIS lo explica.
6. **«Mañana tengo un partido».** Si ya está registrado, AXIS lo confirma y explica su efecto en el día de hoy. Si no, propone **registrarlo como actividad de un día concreto** (D-018) para mañana, con confirmación (acción `add_dated_activity`). Si no se sabe la intensidad, la pregunta antes de proponer nada. Nombre: si el usuario tiene **un único deporte habitual**, «Partido de <deporte>» con los grupos musculares de ese deporte; con varios o ninguno, «Partido» sin grupos musculares. No se inventa deporte ni grupos musculares. Es la única reorganización que crea un dato fuera de la memoria del día.
7. **«No puedo hacer el entrenamiento previsto».** AXIS pregunta el motivo antes de decidir: tiempo (se trata como el caso 4), zona (como evitar una zona), material o lugar, u otro motivo. Para material o lugar no hay filtro por material en v1: AXIS lo dice y sugiere hacer lo que se pueda y saltar lo demás, o tratarlo como «hoy no puedo».

**Molestias y dolor** siguen la respuesta segura existente y **nunca** generan una modificación automática del entrenamiento.

### Deshacer cambio

- Solo la **última acción aplicada del día**, solo desde su tarjeta aplicada en el chat.
- Solo mientras el entrenamiento de ese día **no ha empezado ni terminado**. Empezar a entrenar cierra la posibilidad de deshacer.
- Restaura exactamente lo que la acción cambió: la elección de hoy, los minutos, el movimiento a mañana. Si creó la actividad del partido, la retira.
- La acción queda **deshecha** y no se vuelve a ejecutar (D-012). Las acciones superadas no resucitan. Nada queda deshecho antes de guardarse.

### Datos

- La memoria del día (D-011) gana tres campos **opcionales**: `availableMinutes`, `movedTo` y `lastApplied` (lo necesario para deshacer). Los registros anteriores siguen siendo válidos. **Sin migración de IndexedDB.**
- **Enmienda a D-011:** el registro de ayer se lee solo para un campo, `movedTo`. Nada más de ayer se aplica.
- No se modifican el perfil, el catálogo, las sesiones guardadas, la progresión ni la Carga. La única excepción es la actividad con fecha del partido, creada tras confirmar.
- Las respuestas de D-022 son deterministas. La capa de lenguaje solo puede reescribir el texto (D-016).

### Fuera de D-022 v1

Planificación semanal, copiar sesiones entre días, filtro inteligente por material, pestañas o dashboards nuevos, gamificación, scores nuevos y cambios en la progresión o la Carga.

---

## D-023 — Escáner corporal: índice de equilibrio

**Fecha:** 2026-10-08 · **Estado:** aprobada e implementada en la app (2026-10-09) · `P-016` y `P-017` cerrados; `P-015` abierto: los umbrales son provisionales hasta validarlos con datos reales.

El usuario hace un escaneo guiado de su cuerpo con la cámara del móvil y obtiene un **índice de equilibrio corporal de 0 a 100** con su desglose, un resumen de AXIS (puntos fuertes, áreas de mejora, pasos de acción) y entrenamientos que AXIS adapta con lo medido. Ningún documento anterior lo definía.

### Principios

- **Todo en el dispositivo.** Las fotos se analizan en el móvil con un modelo de pose local. **Ninguna imagen sale del dispositivo** ni llega a la capa de lenguaje (D-016) ni a ningún servidor. Las fotos se guardan solo en el dispositivo, para que el usuario compare mes a mes.
- **Medir, no opinar.** Solo entra lo que se puede medir con la cámara con una fiabilidad razonable. Lo que no se puede medir se pregunta al usuario, como en el onboarding.
- **Compararse con uno mismo**, mes a mes y con el mismo montaje. Sin percentiles, sin normas de población y sin comparación con otras personas.
- **Orientación, no diagnóstico.** Como el Recovery Score (D-002): nunca se presenta como medida médica. Nada de «tienes valgo» o «tienes escoliosis»; sí «tu rodilla derecha se desplaza hacia dentro más que la izquierda (12° frente a 5°)».
- **Si no hay datos fiables, no hay resultado.** Un componente con encuadre malo, cuerpo cortado o mala luz sale como «datos insuficientes». No se inventa.

### Qué se mide (v1)

- **Proporciones:** relación de anchura hombros/cintura (la «V», a partir de la silueta y los puntos del cuerpo) y proporción piernas/tronco.
- **Simetría:** izquierda frente a derecha en hombros, brazos y piernas. Solo se señala una diferencia que supere el margen de error medido.
- **Postura:** posición de la cabeza respecto al hombro (de perfil) y alineación de pie.
- **Movimiento:** sentadilla (profundidad, rodillas, inclinación del tronco) y brazos por encima de la cabeza (rango por lado).
- **Prioridades del usuario**, preguntadas paso a paso: qué zonas quiere desarrollar y cómo se ve cada una. Cubren lo que una foto no puede medir.

**Fuera, porque no se mide con fiabilidad desde una foto:** grasa corporal, composición corporal, «definición» o desarrollo muscular, medidas en centímetros, atractivo, escoliosis, inclinación pélvica y lordosis.

### Índice de equilibrio corporal (0–100)

| Componente | Peso |
|---|---|
| Simetría | 35 % |
| Postura | 25 % |
| Movimiento | 25 % |
| Proporción respecto al objetivo declarado por el usuario | 15 % |

Los pesos viven en un único sitio del código, como los del Recovery Score. La nota se muestra **siempre con su desglose**. No es una valoración de lo bueno que es un físico: resume equilibrio, postura y movimiento medidos. Un componente sin datos suficientes no se rellena; cómo se calcula el índice en ese caso queda en `P-015`.

### Dónde vive

- Entrada secundaria **junto al test de evolución** (D-021), en Entrenamiento. Sin pestaña nueva.
- Los resultados se pueden abrir desde ahí y quedan en **Historial**.
- La app lo pide de nuevo **cada mes, junto con el test de evolución**. El escaneo es un flujo aparte: el test sigue sin nota.

### AXIS

- AXIS conoce los resultados y los explica componente a componente cuando se le pregunta.
- **El motor adapta los entrenamientos** con lo medido: por ejemplo, prioriza un grupo muscular cuando la proporción queda por debajo del objetivo declarado, o añade trabajo unilateral ante una asimetría real. Siempre explica por qué. Las reglas concretas quedan en `P-017`.
- El escaneo y sus fotos **nunca** entran en el briefing que se envía a la capa de lenguaje. Lo que AXIS cuente sobre el escaneo es determinista, como las respuestas sobre el test (D-021).

### Relación con D-021

D-021 dice «medir, no puntuar», «sin métrica global» y «sin métricas corporales» **para el test de evolución**. D-023 no cambia el test: el índice vive en su propio flujo, con su propio almacén, y no se mezcla con los resultados del test ni con la Carga, la progresión o los récords.

### Datos y técnica

- Modelo de pose en el dispositivo: `@mediapipe/tasks-vision` (Apache-2.0). El modelo se sirve desde la propia app para funcionar sin conexión. Es una dependencia nueva, aprobada con esta decisión.
- Un almacén nuevo en IndexedDB (v9, migración que solo añade). Las copias de seguridad incluyen los resultados medidos. Si incluyen o no las fotos queda en `P-016`.
- **Antes de construir pantallas, un prototipo de medición** en el móvil real comprueba que cada medida es estable al repetirla con el mismo montaje. Lo que no sea estable no entra en v1.

### Enmienda (2026-10-08): el resumen conjunto y sus categorías

Aprobada por Alex. El resultado no es una tabla de medidas sino **un resumen de todas las fotos juntas**: índice, categorías, puntos fuertes, áreas de mejora y pasos de acción con ejercicios del catálogo, que AXIS recuerda.

| Categoría | De dónde sale | ¿Cuenta en el índice? |
|---|---|---|
| Simetría | Fotos: hombros, caderas, rango de cada brazo y rodillas, izquierda frente a derecha | Sí (35 %) |
| Proporciones | Fotos: hombros/cintura y piernas/tronco. Se puntúa frente al objetivo que declare el usuario; hasta entonces se mide y se compara consigo mismo | Sí (15 %) |
| Postura y movilidad | Fotos: cabeza, sentadilla (profundidad, tronco, rodillas) y brazos arriba | Sí (50 %: las antiguas postura 25 % y movimiento 25 %, presentadas juntas) |
| Desarrollo muscular | **Rendimiento real**: los tests de evolución (D-021) y su tendencia. La cámara no ve cuánto músculo hay | No |
| Composición corporal | **No se mide con fotos.** Solo aparece si el usuario da un dato real (báscula de composición o medición profesional) | No |

- Cada medida es la **mediana de todas las fotos** de su pose. Si varía demasiado entre fotos, no entra y se avisa de repetir las fotos.
- La **diferencia de longitud de brazos o piernas no se puntúa**: la longitud de los huesos no se entrena y, en una foto, una diferencia grande indica casi siempre un cuerpo girado. Se usa solo para avisar de la foto.
- Sin simetría ni postura no hay índice. Los umbrales viven en `lib/domain/scanner/scales.ts` y son **provisionales hasta cerrar `P-015`**.

### Enmienda (2026-10-08): cómo se ve el usuario

Aprobada por Alex. Lo que la foto no puede medir se pregunta, como en el onboarding, y es opcional: **complexión** (más bien delgada / media / más bien ancha), **zonas con más y con menos músculo** (pecho, espalda, hombros, brazos, piernas, core) y **prioridad** (ganar músculo / que se note más el músculo / ganar fuerza / equilibrar el cuerpo).

- Se presenta siempre como respuesta del usuario («te ves con menos espalda»), nunca como medido.
- **Desarrollo muscular** combina esas respuestas con el entrenamiento real: si la zona que el usuario ve más floja es la que menos entrena, «tu historial lo confirma»; si la entrena a menudo, el consejo es progresar en carga. Las zonas flojas se convierten en un paso de acción con ejercicios del catálogo.
- **Composición corporal** dice la complexión que describe el usuario y qué implica para su entrenamiento según su prioridad. **Nunca se deduce de la foto** y AXIS no habla de dietas, peso ni calorías: con la prioridad «que se note más el músculo» dice expresamente que la alimentación queda fuera de lo que valora.
- Ningún paso promete que el motor cambie solo (`P-017`, cerrado): los pasos dicen qué hacer y que AXIS ofrece la opción cuando se le pregunta.

### Enmienda (2026-10-09): comparación con el escaneo anterior

Aprobada por Alex, a partir de lo que hacen apps como Critique AI.

- Se comparan **medidas, no fotos**: cada medida estable del escaneo frente a la del escaneo anterior, el índice y las categorías.
- Un cambio solo cuenta si supera el **margen de esa medida** (el mismo con el que se descarta una medida inestable entre fotos). Por debajo, «sin cambio».
- Lo que tiene una dirección clara se dice como mejora o retroceso. La proporción hombros/cintura se dice tal cual, sin juzgarla ni interpretarla como grasa o músculo.
- Aparece al terminar el escaneo (frente al último guardado), en el detalle del historial (frente al anterior a ese) y en lo que responde AXIS. Siempre con el recordatorio de que solo es fiable con el mismo montaje.

### Enmienda (2026-10-10): medidas por zona en la foto

Aprobada por Alex. En la foto de frente se mide la **anchura de la silueta de cada zona respecto a su propio hueso** (hombros respecto al tronco, brazo, muslo y pantorrilla): su «volumen relativo» en la foto. Normalizar por el propio esqueleto elimina la distancia a la cámara.

- La anchura se mide en perpendicular al hueso, en su punto medio. Una zona pegada a otra (brazo contra el tronco, piernas juntas) **no se mide**: se descarta en lugar de dar un valor falso. Por eso la foto de frente pide brazos y piernas separados y ropa ajustada.
- Es la **forma en la foto, no lo que hay dentro**. «Desarrollo muscular» solo dice «coherente con más músculo» cuando la zona crece más que su margen **y** la fuerza de esa zona sube en los tests de evolución. Si no hay test que lo respalde, lo dice. Nunca se habla de grasa.
- Los márgenes de estas medidas son provisionales (`P-015`).

**Descartado por no ser medible:** estimar el porcentaje de grasa por la textura, la suavidad del contorno o las sombras. Requiere un modelo entrenado con escáneres DEXA que no existe para usarlo en el dispositivo; sin él, cualquier cifra sería inventada.

**Considerado y descartado por ahora (decisión de Alex):** la captura guiada en vivo con la cámara (silueta superpuesta, sensor de inclinación del móvil y disparo automático al estar bien colocado). La app sigue bloqueando la cámara en vivo (`Permissions-Policy: camera=()`) y las fotos se suben desde la galería. Retomarla exige cambiar esa cabecera y es una decisión de privacidad.

**Descartado por no ser medible:** clasificar los cambios como «pérdida de grasa» o «ganancia de músculo» con nubes de puntos o profundidad estimada desde una foto. El S21 no tiene sensor de profundidad y una sola cámara no da volúmenes fiables.

### Enmienda (2026-10-13): área y contorno de cada zona

Aprobada por Alex. Sustituye el «en su punto medio» de la enmienda anterior.

- **Área media:** cada zona se corta en perpendicular al hueso muchas veces a lo largo de su parte central (del 25 % al 75 % del hueso) y se toma la anchura media: el área del segmento dividida por la longitud del hueso. Un solo corte saltaba con un pliegue de ropa o un brazo algo doblado.
- **Contorno máximo («bulto»):** de esos mismos cortes, la anchura mayor respecto al hueso (el pico del bíceps o de la pantorrilla).
- **Zonas:** hombros, brazo, **antebrazo**, muslo y pantorrilla. La parte de la silueta que corresponde a cada zona sale del esqueleto, no de un segundo modelo de segmentación por partes.
- **Cintura respecto a la cadera:** la anchura de la cintura en la silueta frente a la de la cadera, junto a la relación hombros/cintura ya existente. Se dice tal cual, como forma, nunca como grasa.
- Si menos de la mitad de los cortes de una zona son válidos (zona pegada a otra), la zona no se mide.
- Las medidas por zona tienen nombres nuevos: los escaneos anteriores no se comparan con ellas. El primer escaneo con este método es la referencia. Los escaneos de prueba se borran desde su detalle en Historial.
- Lo demás no cambia: es la forma en la foto, «coherente con más músculo» solo si la fuerza de esa zona sube en los tests, y nunca se habla de grasa. El porcentaje de grasa por textura o sombras sigue descartado (enmienda del 2026-10-10). Márgenes provisionales (`P-015`).

### Enmienda (2026-10-14): core, brazos, grasa estimada y alimentación

Aprobada por Alex, tras consultar al creador de otro escáner cómo mide core, brazos y grasa. **Supera** a las enmiendas anteriores en dos puntos: la composición corporal deja de quedar fuera y AXIS puede dar una guía general de alimentación.

- **Brazos.** Además del área y el contorno de cada zona, la **relación brazo/antebrazo** (anchura media del brazo frente a la del antebrazo). Una pose nueva y **opcional**, **bíceps flexionado** de frente, mide el contorno del brazo en tensión, donde el pico se ve de verdad.
- **Core.** Las costillas flotantes y la cresta ilíaca no tienen punto en el modelo de pose: se sitúan por **proporción** sobre la línea hombros–caderas, como hace el otro escáner. Se mide cuánto sale la silueta de la recta que las une: de **perfil**, el abdomen; de **frente**, los flancos. Convexo, recto o cóncavo. Es forma: puede ser músculo o grasa, y se dice así. La respiración la mueve mucho: necesita fotos estables.
- **Porcentaje de grasa estimado: fórmula de la Marina de EE. UU.** (Hodgdon y Beckett). Usa los perímetros de cuello y cintura (y cadera en mujeres) y la altura del perfil. Cada perímetro se estima como una **elipse** con la anchura de frente y la profundidad de perfil; la altura del perfil da la escala en centímetros. Todo en el dispositivo. Pide **sexo** (para elegir la fórmula), preguntado en el escaneo y guardado solo con él. Siempre se presenta como **estimación con su margen (±4 %)**, nunca como medida médica, y con su límite: no ve la grasa interna.
- **Descartado:** el porcentaje por textura, sombras o una IA que mire la foto. El otro escáner usa un **modelo propio entrenado con fotos medidas por DEXA**, que AXTHLETICS no tiene; sin él, el número sería inventado. Tampoco se envían fotos a una IA externa.
- **Fotos.** Se recomienda hacerlas **sin camiseta** (la ropa, incluso ajustada, falsea el contorno) y se comprueba la luz: con sombras laterales fuertes o poca luz se avisa en vez de medir. Siguen sin salir del dispositivo.
- **Alimentación.** Con la prioridad y la grasa estimada, AXIS da una **guía general**: proteína suficiente y, según el objetivo, un ligero superávit o un ligero déficit. **Menores de 18 años** (edad del perfil): nunca déficit ni cifras de calorías; sí «come algo más de lo habitual» si quieren ganar músculo, y comer suficiente para entrenar y crecer. No sustituye a un profesional y se dice.
- **Resumen.** Tono de entrenador, con las cuatro categorías con contenido real y tres pasos de acción según la prioridad, siempre con ejercicios del catálogo (D-008).
- Constantes de proporción, márgenes y umbrales: en `lib/domain/scanner/scales.ts`, provisionales (`P-015`).

### Fuera de D-023 v1

Análisis por IA externa de las fotos, nota de atractivo o de «físico», composición corporal medida a partir de la foto por textura o sombras (la estimación por perímetros de la enmienda del 2026-10-14 sí entra), comparación con otras personas, gamificación y vídeo continuo durante el entrenamiento.

---

## D-024 — Figura animada de cada ejercicio

**Fecha:** 2026-10-14 · **Estado:** aprobada e implementada.

Cada ejercicio se enseña con una **figura animada**: un maniquí que va de la pose inicial a la final y vuelve, en bucle, con los músculos que trabaja marcados en azul. Sirve para saber cómo se hace sin leer las instrucciones.

### Por qué una figura dibujada y no imágenes

Alex comparó las dos opciones (boceto: https://claude.ai/artifact/JwJbXnmU3vvWzqaL3mGFEs) y eligió la figura dibujada. Las imágenes realistas generadas con IA, en el estilo de `anatomy-upper.png`, cambiaban el cuerpo y la cámara entre la pose inicial y la final, no siempre hacían la pose pedida, pedían unas 86 imágenes que revisar y pesaban 10–15 MB.

### Reglas

- **Una figura por ejercicio del catálogo**, como datos (`lib/exercise-figure/poses.ts`): dos poses, o una sola para los ejercicios de mantener una posición. Un test falla si un ejercicio del catálogo no tiene figura o si una pose se sale del lienzo.
- **Los músculos salen del catálogo**, nunca de una lista aparte: principales en azul, secundarios en azul suave. Los ejercicios de gemelos y de tobillo se marcan en la pantorrilla.
- **Colores del Design System**, sin grises nuevos: cuerpo `--muted-nontext` (el lado lejano, a media opacidad), músculos `--primary` (los secundarios, a media opacidad), objetos `--track`, suelo `--border`.
- Vista de lado salvo dos ejercicios que solo se entienden de frente (zancada lateral y ángeles en la pared); de frente, la espalda y los glúteos no se marcan porque no se ven.
- Respeta «reducir movimiento»: con él, la figura se queda en la pose inicial.
- Funciona sin conexión y sin descargar nada: se dibuja en el dispositivo.

### Dónde

En los huecos de imagen que ya tenía el diseño aprobado (D-006), sin cambiar composición:

- **Ejercicio activo:** junto al nombre, animada.
- **Siguiente ejercicio** y **resumen del entrenamiento:** en miniatura, quieta.

### Fuera de D-024 v1

Animación en la respuesta de AXIS («¿cómo se hace…?»), vistas desde varios ángulos, figura con el sexo o la complexión del usuario y vídeo.

---

## D-025 — Flexiones con rodillas

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Amplía D-020.1 (catálogo: 43 → 44).

Alex pide añadir las **flexiones con rodillas** al catálogo, con su figura animada. D-020.1 cerró el catálogo en 43 («no se añade nada más»); esta decisión lo amplía en uno.

### El ejercicio

| Campo | Valor |
|---|---|
| id | `flexiones-rodillas` |
| Categoría / familia | empuje / `flexion` |
| Músculos | pecho; secundarios hombros y brazos |
| Material | ninguno |
| Dificultad | 1 |
| Trabajo | 3 × 10, 75 s de descanso |
| Progresión / regresión | → Flexiones negativas / ninguna |

- Es la flexión de iniciación **sin material**: hermana de las inclinadas (que necesitan una superficie elevada), no su sustituta. Por ser de la familia `flexion`, nunca coincide con otra flexión en la misma sesión (D-020.1).
- **Las relaciones de los demás ejercicios no cambian**: las negativas siguen regresando a las inclinadas y «una variante más ligera» de las flexiones sigue siendo las negativas. Las de rodillas entran por la rotación del nivel principiante.
- **Es variante elegible del test de evolución** (amplía D-021, aprobado por Alex el 2026-10-17): inclinadas, con rodillas, estándar, declinadas y diamante. Son repeticiones completas, comparables entre tests como las demás; las negativas siguen fuera. La recomendación del primer test no cambia (principiante → inclinadas) y, como cualquier variante, elegirla empieza una línea base propia.

### Figura (D-024)

De lado, con rodillas y espinillas apoyadas en el suelo y el cuerpo en línea de la rodilla a la cabeza; las manos fijas bajo los hombros y el pecho baja hasta cerca del suelo.

### AXIS reconoce el nombre

«Rodilla» está entre las palabras que llevan a la respuesta médica segura. Para que «¿cómo hago las flexiones con rodillas?» se responda como pregunta de ejercicio, la regla médica **ignora una parte del cuerpo solo cuando forma parte del nombre completo de un ejercicio**, escrito seguido (admite singular/plural y «con»/«de»/«con las»). Todo lo demás sigue siendo médico: «me duele la rodilla», «tengo un problema con las rodillas», «las rodillas me molestan con las flexiones» o «me duele hacer flexiones con rodillas». Un test fija los dos lados.

### «Me molesta» es una molestia

Aprobado por Alex el 2026-10-17. La respuesta médica segura reconocía «molestia» pero no «me molesta», «me molestan» ni «molestias en…»: «me molesta el hombro» no llegaba a ella. Ahora cualquier forma de «molestar» lleva a la respuesta segura, que, como siempre (D-022), nunca modifica el entrenamiento por sí sola.

---

## D-026 — AXIS entiende las faltas de ortografía

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 1 de la propuesta de Alex de que AXIS use su IA «como Finax».

### El problema

Los detectores de AXIS reconocen palabras clave exactas, y **la capa de lenguaje solo se llama cuando el determinista ya reconoció la intención** (D-016). Con una falta, el mensaje no se reconocía y la pregunta ni llegaba al modelo, que sí entiende las faltas: «estoy cansao» o «toy reventao» no eran cansancio, «porqe hoy piernas» no era un «por qué», «como va mi semnaa» no era la semana y «me duel el hombro» no llegaba a la respuesta segura.

### La solución: corregir al entrar, sin IA

El mensaje se corrige **una sola vez, al entrar**, antes de cualquier detector (`lib/domain/axis/conversation/spelling.ts` y `understand.ts`). Determinista, en el dispositivo, sin red ni coste.

- **Abreviaturas de chat:** «xq», «pq», «porqe» → «por que»; «q», «k» → «que»; «toy» → «estoy»; «oy» → «hoy»; «pa» → «para»…
- **Misma pronunciación** (desde 4 letras): ll/y, c/s/z, qu/k, b/v, h muda y «-ao» por «-ado» («rodiya», «kiero», «cansao»).
- **Una letra de diferencia**, según el largo: desde 7 letras, una letra cambiada, quitada, de más o dos cruzadas; en las de 6, también la letra que falta; en las de 5 y 6, dos letras cruzadas. En las cortas no se cambia una letra: «hombre» no es «hombro».
- Solo se corrige con **un único candidato**; con dos igual de cerca, no se adivina. No se tocan las palabras que ya se reconocen, las que empiezan por un término conocido («tranquilo»), las que llevan cifras («3x10») ni los nombres de las actividades del usuario.
- **El vocabulario sale de las listas de cada detector** (intenciones, negociación, reorganización, test, escáner, conocimiento y catálogo): un término nuevo en cualquiera de ellas es tolerante a faltas sin una segunda lista que mantener.
- **El modelo recibe el mensaje original**: lo entiende igual y redacta sobre la respuesta del dominio calculada con el texto corregido. La conversación guardada muestra lo que el usuario escribió.

### Seguridad

La respuesta médica también aguanta faltas y formas del verbo: cualquier forma de «doler» («me duel», «me dolió», «me duelen») lleva a ella, como ya pasaba con «molestar» (D-025). Ante la duda, la respuesta segura.

### Fuera de D-026

Que la IA redacte también las respuestas de datos —recuperación, semana, carga, última sesión— (paso 2 de la propuesta, D-027) y pedir al modelo que reescriba un mensaje que el determinista no entiende (paso 3). Cada uno necesita su propia decisión.

---

## D-027 — La IA redacta también las respuestas de datos

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 2 de la propuesta de Alex de que AXIS use su IA «como Finax» (D-026).

### Qué cambia

Las preguntas de datos —recuperación (`recovery`), semana (`week`), carga (`load`) y último entrenamiento (`last_session`)— dejan de responderse siempre con el texto fijo del determinista: **las redacta el modelo**, como ya hacía con las explicaciones (D-016). Las cifras siguen saliendo del dominio; el modelo solo las dice de forma más natural.

### Qué no cambia

- **El dominio calcula, el modelo redacta.** El modelo recibe la respuesta del dominio y el mismo briefing recortado de siempre: sin nombre, sin test de evolución y sin escáner. No sale del dispositivo ningún dato nuevo.
- Si el modelo falla, tarda o su texto no pasa la puerta de seguridad, se muestra la respuesta determinista, como en cualquier otra pregunta.
- Lo médico, lo ajeno a AXTHLETICS, el test de evolución, el escáner y lo que decide la sesión siguen sin pasar por el modelo.

### Ninguna cifra se pierde

En una respuesta de datos el contenido son las cifras, así que la puerta de seguridad añade una comprobación: el texto del modelo debe **conservar todas las cifras de la respuesta del dominio** (`omitted_number`). Puede decirlas de otra forma —«72 sobre 100» como «72/100», «7,5» como «7.5», «12.450 kg» como «12450 kg»—, pero no dejar ninguna. Las de siempre siguen valiendo: ninguna cifra inventada (`invented_number`) ni afirmaciones sin respaldo (`unsupported_claim`). En las explicaciones el modelo puede seguir resumiendo.

El volumen se escribe con punto de millares («12.450 kg»), y la puerta lo lee como millares: un texto que dijera «12,45 kg» es otra cifra y se rechaza.

### Sin datos, sin modelo

Cuando la respuesta de datos es que **no hay datos** («esta semana todavía no has completado ningún entrenamiento»), contesta el determinista sin llamar al modelo: no hay cifras que redactar, y es justo donde el modelo podría convertir una ausencia en un hecho.

### Coste

Una llamada más por pregunta de datos, dentro de los planes gratuitos de D-016. Una pregunta de datos tarda lo que tarde el modelo, con el mismo límite de tiempo que las demás.

### Fuera de D-027

Pedir al modelo que reescriba un mensaje que el determinista no entiende (paso 3, D-028). Necesita su propia decisión.

---

## D-028 — El modelo reescribe lo que el determinista no entiende

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 3 de la propuesta de Alex de que AXIS use su IA «como Finax» (D-026, D-027).

### El problema

Con las faltas corregidas (D-026), lo que el determinista no reconoce son las formas de decir: «ando fundido», «estoy ko», «me pesa todo el cuerpo». No hay palabra clave que corregir, y la respuesta era «No he entendido a qué te refieres».

### La solución: el modelo traduce, el determinista responde

Cuando un mensaje sigue sin entenderse después de corregir las faltas, se le pide al modelo **una sola cosa: reescribirlo** como una frase clara, en primera persona, sin añadir nada (`lib/domain/axis/conversation/reinterpret.ts`). Esa frase vuelve al determinista, que es quien responde, con sus reglas de siempre: lo médico sigue llevando a la respuesta segura y cualquier cambio sigue necesitando su botón de confirmar (D-012). El prompt incluye frases que el determinista entiende, para que el modelo reescriba hacia ellas; un test comprueba que ninguna deja de entenderse.

AXIS dice cómo lo ha entendido, al final de la respuesta para que la primera frase siga siendo el veredicto: «… Te he entendido como «Estoy muy cansado»». Es una interpretación y se presenta como tal.

### Qué sale del dispositivo

**Solo el mensaje.** Sin briefing: para reescribir una frase no hace falta saber nada del usuario. Es menos de lo que sale en cualquier otra llamada a la capa de lenguaje, por la misma ruta y a los mismos proveedores (D-016).

### Límites

- La frase reescrita no vale si es larga, trae emojis o saltos de línea, o **una cifra que el usuario no escribió** («tengo poco rato» no puede volver como «tengo 20 minutos»). Si no vale, responde el determinista con el «no he entendido» de siempre.
- Si el modelo tampoco lo entiende, o el mensaje no va de AXTHLETICS, contesta `NO_ENTIENDO` y queda la respuesta de siempre, sin aviso: no es un fallo.
- **De una reinterpretación no se aprende nada**: si la respuesta a la frase reescrita registrara una actividad cancelada o una carga contada, se descarta. Son suposiciones, no algo que el usuario haya dicho.
- La respuesta a la frase reescrita no se vuelve a redactar con el modelo: una llamada por mensaje.

### Fuera de D-028

Que el modelo responda directamente a lo que el determinista no sabe responder.

---

## D-029 — Nuevo logo: la «A» con la flecha que sube

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Decidido por Alex, que aporta el logo.

### Qué cambia

La X abstracta deja de ser la marca. La nueva es una **«A» negra atravesada por una flecha azul que sube**, el logo de Alex. Cambia en los dos sitios donde estaba la X:

- **El icono de la app** —pantalla de inicio, pestaña del navegador e icono de Apple—: el logo a color tal cual, «A» `#111111` y flecha `#0A61F8` sobre `#F8F8F8`, el blanco roto del original. El fondo deja de ser azul: sobre azul, la flecha desaparecería. El icono *maskable* de Android lleva más margen para que el recorte circular no corte el logo.
- **La marca dentro de la app** (`AxisMark`, en la cabecera de AXIS y en sus tarjetas): el mismo dibujo **en un solo color**, el del texto que la rodea, como la X: azul en las tarjetas, blanco sobre azul. Los huecos entre la flecha y la «A» la hacen legible en un color.

### Fuente

El logo original es un PNG (`docs/design/AXTHLETICS_LOGO_SOURCE.png`). Se ha trazado a vectores, `docs/design/AXTHLETICS_LOGO.svg`, que coincide con el original en más de un 99 % de su superficie. Los iconos y la marca salen de ese SVG.

### Caché

Los iconos nuevos se llaman igual que los viejos y el service worker los sirve de caché: se sube su versión (`axtlhetics-v2`) para que una app ya instalada no se quede con el icono anterior. El icono de la pantalla de inicio de una app ya instalada lo cambia el sistema cuando quiere; reinstalarla lo cambia al momento.

### Lo que no cambia

El nombre, el color primario y la palabra «AXIS» junto a la marca. Se retiran los logos de la plantilla inicial que nadie usaba (`icon.svg`, `icon-light-32x32.png`, `icon-dark-32x32.png`, `placeholder-logo.*`).

---

## D-030 — AXIS cede salvo riesgo, y responde más largo cuando explica

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Decidido por Alex: «que si le dices "hoy he corrido, ¿podemos cambiar el entreno a mañana?", lo cambie y no te diga que no; y no solo ahí, también al cambiar el entreno».

### Cede salvo riesgo

Sustituye la regla de la negociación «AXIS cede por evidencia, no por insistencia». Ahora **el usuario decide**: cuando pide un cambio, AXIS lo deja listo con su botón de confirmar (D-012, sin cambio). Si sus datos no lo aconsejan, lo dice antes, con el motivo y en una frase —«No es lo que yo haría: …. Pero lo decides tú.»—, sin sermón.

**El único «no» que queda es el riesgo:** con la recuperación por debajo de 50 (banda roja, D-002) AXIS no sube la carga —más intensa, más tiempo, entrenar en un día de recuperación o entrenar otra vez hoy—. Lo dice, explica por qué y ofrece movilidad, que no carga. Ahí sí se mantiene el criterio aunque el usuario insista. Lo médico sigue llevando a la respuesta segura.

Lo que cambia, petición por petición:

- **Quitar una zona** sin motivo en los datos: se cambia a otra zona, avisando.
- **Pedir una zona** ya trabajada estos días: se cambia, avisando y con un consejo para bajar un punto.
- **Más intensa o más tiempo** con la carga acumulada alta o sin la recuperación registrada: se concede, avisando.
- **No entrenar hoy** aunque los datos no lo pidan: se descansa, diciendo lo que AXIS opina.
- **Entrenar otra vez** habiendo entrenado ya: se ofrece algo suave, avisando.
- **Mover a mañana** aunque ya viniera movido de ayer o mañana haya un partido intenso: se mueve, avisando. Si hoy ya era día de recuperación o ya se entrenó, no hay nada que mover y se dice sin un «no». La validación (D-012) deja de bloquear el segundo aplazamiento y el partido de mañana.
- **Cansancio sin la fatiga registrada:** se suaviza la sesión y se pide registrarla para que cuente; AXIS sigue sin anotarla él.

### Más alternativas

AXIS solo puede ceder con una sesión que exista. El motor prepara ahora una alternativa para cada petición: **más ligera, más intensa, cada zona (tren superior, tren inferior, cuerpo completo), movilidad y recuperación**; y en un día de recuperación, sesiones cortas de cada zona y movilidad. No se ven en pantalla: se eligen desde la conversación.

### Respuestas según la pregunta

- **Datos** (recuperación, semana, carga, último entrenamiento): cortas, como hasta ahora, 1–3 frases y como mucho 4.
- **Explicaciones y cambios** (por qué, qué pasa si cambio, cansancio, deportes, objetivos, ejercicios): **4–6 frases, como mucho 7**. El modelo empieza por el veredicto, explica el porqué con los datos del briefing, dice qué cambia y termina con un consejo práctico. Las puertas de siempre siguen: ni cifras inventadas ni afirmaciones sin respaldo.
- La respuesta de reserva a «¿por qué?» incluye ahora el motivo de cierre del motor y la duración de la sesión.
- Los topes de salida de los proveedores suben para que quepa una respuesta larga (Cloudflare 700 tokens, Groq 1000).

### Fuera de D-030

Que el motor deje de proponer lo que propone: la recomendación del día sigue siendo la del motor. Lo que cambia es cuánto pesa la opinión del usuario cuando pide otra cosa.

---

## D-031 — Progresión según el esfuerzo y semanas de descarga

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Primer paso del plan de Alex para que AXTHLETICS sea el entrenador ideal. El material no cambia: una pesa de 5 kg (D-008).

### El esfuerzo modula el paso

La progresión ya repetía si un ejercicio quedaba a medias (D-019). Ahora también mira **cuánto costó la sesión** en que se hizo por última vez, el esfuerzo de 1 a 5 que se valora al terminar (D-019):

- **Al límite (5):** se repite lo mismo, aunque se completara todo. Hecho, pero sin margen para subir.
- **Duro o moderado (3–4), o sin valorar:** el paso de siempre.
- **Fácil o muy fácil (1–2):** el paso se dobla —el doble de repeticiones o de segundos—, sin pasar el techo del ejercicio. La carga, con una sola pesa, sigue igual.

### Semana de descarga

Tras **4 semanas naturales seguidas cargadas** —al menos 2 sesiones completadas y ninguna de descarga—, la semana siguiente es de **descarga**: una serie menos por ejercicio (nunca menos de 2), sin subir repeticiones ni carga y sin pasar a una variante más difícil. Es parte del plan, no un descanso: se entrena igual, con menos volumen, para asimilar lo acumulado.

- AXIS lo explica en primer lugar en el motivo del día: «Llevas 4 semanas seguidas entrenando con regularidad: esta semana es de descarga…».
- Es determinista y por semanas de lunes a domingo: cualquier día de la semana da la misma respuesta.
- Las sesiones de una semana de descarga lo guardan en su instantánea (`ProposalSnapshot.deload`), así que esa semana corta la cuenta y nunca se encadenan dos. Una semana floja (menos de 2 sesiones) también la corta.

### Datos

Sin migración: `deload` es opcional en la sesión planificada y en la instantánea. Las sesiones anteriores no lo tienen y cuentan como semanas normales.

---

## D-032 — Calentamiento y vuelta a la calma

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 2 del plan de Alex para que AXTHLETICS sea el entrenador ideal.

### Qué cambia

Cada sesión de fuerza **abre con un calentamiento y cierra con una vuelta a la calma**, con ejercicios de movilidad del catálogo elegidos según la zona:

- **Tren superior:** calentamiento con ángeles en la pared y rotación torácica; al acabar, gato-camello.
- **Tren inferior y cuerpo completo:** calentamiento con tobillo a la pared y gato-camello; al acabar, estiramiento de flexor de cadera y de isquiotibiales.
- **Movilidad:** no lleva; ya lo es.

### Cómo se hace

- Son ejercicios de la propia sesión, marcados con su fase (`PlannedExercise.phase`): el entrenamiento activo los recorre como cualquier otro, sin pantalla nueva. Donde pone «EJERCICIO ACTUAL» dice «CALENTAMIENTO» o «VUELTA A LA CALMA», y en las listas el nombre lleva su fase debajo.
- **Una serie**, las repeticiones o segundos del catálogo, sin carga y sin descanso.
- **Salen del tiempo disponible:** 2 minutos cada uno. Una sesión de 45 minutos pasa de 4 a 3 ejercicios de fuerza más 3 de movilidad, y sigue durando lo mismo.

### No es el entrenamiento

El calentamiento y la vuelta a la calma preparan y relajan, así que no cuentan como entrenamiento:

- No progresan y no cuentan como «la última vez» de un ejercicio, ni en la pantalla ni para la progresión.
- No fijan ni baten récords.
- No gastan un ejercicio para la rotación (D-020).
- **Se pueden saltar sin dejar rastro:** no aparecen como «sin completar» ni acortan la sesión.
- AXIS describe la sesión del día por su entrenamiento y nombra aparte el calentamiento y la vuelta a la calma («Antes, calienta con… Al acabar, … para soltar»); el modelo de lenguaje solo recibe los nombres, sin series.

### Datos

Sin migración: `phase` es opcional en el ejercicio planificado, en la sesión en curso y en el realizado. Las sesiones anteriores no lo tienen y todo su contenido cuenta como entrenamiento, como hasta ahora.

### Fuera de D-032

El trabajo específico de baloncesto —saltos, agilidad y prevención de rodilla y tobillo—, que es el paso siguiente.

---

## D-033 — Deportes de salto: potencia y prevención

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 3 del plan de Alex, que juega a baloncesto. Amplía el catálogo (D-020.1, D-025): 44 → 49.

### Cuándo

Solo si en el calendario hay un **deporte de salto o de cambio de dirección**: baloncesto (básquet, basket), vóley, balonmano, fútbol, tenis o pádel. Se reconoce por el nombre de la actividad, sin tildes ni mayúsculas (`JUMP_SPORT_TERMS`). Sin ese deporte, nada cambia.

### Qué cambia

- **Prevención en el calentamiento (D-032):** todas las sesiones de fuerza añaden **equilibrio a una pierna**, para el tobillo y la rodilla.
- **Potencia en las sesiones de piernas:** las de tren inferior y cuerpo completo **de intensidad normal** abren el entrenamiento con **un ejercicio de salto**, con las piernas frescas. Ocupa el hueco de un ejercicio de fuerza: la sesión no se alarga. Los saltos rotan: primero el que hace más que no sale.
- **Nunca** en una sesión ligera, adaptada o de recuperación, y por tanto tampoco el día antes de un partido ni el mismo día de un deporte exigente (D-008): esas sesiones ya no son de intensidad normal.

### Los ejercicios (sin material)

| Ejercicio | Categoría | Para qué | Trabajo |
|---|---|---|---|
| Saltos de tobillo | pliometría | Rebote y rigidez del tobillo | 3 × 20 |
| Aterrizaje controlado | pliometría | Caer con las rodillas alineadas | 3 × 6 |
| Sentadilla con salto | pliometría | Salto vertical | 3 × 8 |
| Saltos de patinador | pliometría | Salto lateral y cambio de dirección (por lado) | 3 × 10 |
| Equilibrio a una pierna | movilidad (estabilidad) | Prevención de tobillo y rodilla | 2 × 30 s por lado |

- **Pliometría** es una categoría nueva que **ningún foco elige por sí solo**: solo la añade el bloque de deporte.
- El aterrizaje controlado progresa a la sentadilla con salto (familia `salto-vertical`). Los saltos de tobillo y el equilibrio se marcan en la pantorrilla.
- Cada uno tiene su **figura animada** (D-024).

### Fuera de D-033

Trabajo de agilidad con conos o escalera, sprints y resistencia: necesitan espacio o material, y la pista ya los da.

---

## D-034 — Plan semanal: volumen por músculo y carga

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 4 del plan de Alex para que AXTHLETICS sea el entrenador ideal.

### Volumen por músculo

AXIS cuenta las **series de la semana natural** (de lunes a hoy) de cada grupo muscular: una serie cuenta entera para los músculos principales del ejercicio y media para los secundarios. Solo el entrenamiento: ni el calentamiento ni la vuelta a la calma (D-032) ni la movilidad. El **objetivo semanal** por grupo depende de la experiencia: 8 series (principiante), 12 (intermedio) o 16 (avanzado).

- **Qué zona toca:** al elegir el foco del día, entre zonas parecidas gana la que más va por detrás de su objetivo. Lo trabajado en los últimos días y lo que carga un deporte de hoy siguen pesando más.
- **Lo que dice AXIS:** a «¿qué tal la semana?» añade la zona más atrasada: «Lo que más va por detrás: pecho, con 3 de 12 series esta semana».
- **Lo que se ve:** en Entrenamiento, bajo «Esta semana», una fila por grupo con las series hechas, el objetivo y una barra (Design System, «Weekly Volume»).

### Carga alta: más suave, no descanso

Con la **Carga de los últimos 7 días en «alta»** (D-008) y la recuperación registrada, AXIS propone una **sesión ligera** para asimilarla (`high_training_load`). No manda descansar: eso lo siguen decidiendo la recuperación y el calendario. Alex había preferido no añadir una regla de descanso por carga; esta versión suave es la que entra en el plan semanal que aprobó después.

### Fuera de D-034

Un calendario de la semana con las sesiones previstas día a día: AXIS decide cada día con los datos de ese día, y adelantar la semana entera sería inventar lo que aún no sabe.

---

## D-035 — Objetivos medibles

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 5 del plan de Alex para que AXTHLETICS sea el entrenador ideal.

### Qué es

Un objetivo medible es **un ejercicio, una cifra y una fecha**: «12 flexiones seguidas antes del 10 de diciembre», «60 s de plancha en 8 semanas». Convive con los objetivos generales del perfil (hipertrofia, fuerza…), que no cambian.

- **Se mide con la mejor serie registrada** del ejercicio —repeticiones, o segundos si es isométrico— en sesiones completadas. El calentamiento no cuenta (D-032).
- **Cómo vas:** se traza una línea recta desde la mejor serie al crearlo hasta la cifra en la fecha. Por encima de la línea, o a menos de una repetición o un 10 % del camino, **vas bien**; por debajo, **vas por detrás**. Llegar es **conseguido**; pasar la fecha sin llegar, **fecha pasada**.
- Cualquier ejercicio del catálogo salvo la movilidad, que no se mide en marcas.

### Dónde

- **Perfil**, sección «Objetivos medibles», después de los deportes: la lista con cómo vas y «Añadir objetivo» (ejercicio, cifra y plazo en semanas, con pulsadores). Se borran desde la lista. No aparece en el onboarding: necesita un perfil guardado. Guardar el formulario del perfil no los toca.
- **En las sesiones:** el ejercicio de un objetivo abierto entra en las sesiones de su zona, en el hueco del último elegido (o del de su misma familia). Se entrena lo que se quiere mejorar.
- **AXIS:** a «¿cuáles son mis objetivos?» añade cada objetivo medible con lo que llevas y cómo vas. El modelo de lenguaje los recibe en el briefing, sin el nombre del usuario.

### Datos

Se guardan dentro del perfil (`UserProfile.targets`, opcional), sin migración. Viajan en la copia de seguridad con el perfil; un objetivo mal formado invalida el perfil importado, como cualquier otro campo.

### Fuera de D-035

Objetivos de peso corporal o de composición (el escáner ya los mide, D-023), de carga (con una pesa de 5 kg no hay recorrido) y de frecuencia. Su gráfica, en la pestaña Progreso (paso 6).

---

## D-036 — Pestaña Progreso

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 6 del plan de Alex. **Cambia la navegación aprobada**: Alex eligió una pestaña nueva en vez de una sección dentro de Historial.

### Navegación

Cinco pestañas: Inicio, Entrenamiento, Recuperación, **Progreso** y Historial. Icono de tendencia (`TrendingUp`). Perfil sigue sin ser pestaña.

### Qué enseña

Cómo avanzas hacia tus objetivos, en tres bloques, de lo más personal a lo más general:

- **Tus objetivos** (D-035): cada objetivo medible con una barra de lo hecho hacia la cifra, una marca fina de dónde tocaría estar hoy y su estado («Vas bien» en azul; «Vas por detrás» en el color del texto, sin rojo: ir por detrás no es un error). Debajo, cuánto llevas, cuánto tocaría y hasta cuándo.
- **Tu fuerza:** eliges un ejercicio que hayas hecho (del más hecho al menos) y una línea enseña **la mejor serie de cada sesión completada** en el tiempo. Una sola serie, sin leyenda: línea de 2 px en el azul primario, puntos con aro del lienzo, guías discretas y un techo redondo. Tocar un punto lo fija: línea vertical y su fecha y valor arriba. «Ver los datos» abre la misma información en una tabla.
- **Series por semana:** barras de las últimas 8 semanas en el lenguaje del gráfico del Historial (D-003); tocar una enseña su semana y sus series. Debajo, el volumen por músculo de esta semana (D-034).

Solo sesiones completadas y solo el entrenamiento: ni las interrumpidas ni el calentamiento (D-032) son marcas. Sin datos, cada bloque dice qué hacer para que aparezcan.

### Fuera de D-036

Comparar periodos, exportar las gráficas y curvas de peso corporal (el escáner, D-023, ya tiene su historial).

---

## D-037 — AXIS recuerda de un día para otro

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 7 del plan de Alex. Amplía D-011: de la memoria de ayer ya no solo se lee `movedTo`.

### Lo que no te gusta

- **Dicho:** «no me gustan las zancadas», «odio el superman», «no soporto la plancha». AXIS lo apunta en el perfil (`dislikedExercises`) y lo confirma: «Apuntado: no te propondré zancadas mientras tenga alternativas». La sesión de hoy no cambia; para quitarlo hoy se pide el cambio. «Ya me gustan las zancadas» lo deshace. Se reconoce también en plena negociación, antes de leerlo como una petición de cambio.
- **Deducido:** un ejercicio saltado **2 veces en 30 días** se trata igual, sin guardar nada: caduca solo cuando se deja de saltar.
- **Efecto:** el constructor de sesiones los aparta **mientras queden suficientes alternativas** (antes una sesión completa que una corta). Un objetivo medible (D-035) sí entra aunque el ejercicio esté en la lista: lo pidió el usuario.
- **En Perfil:** «Ejercicios que evito proponerte», con lo dicho (que se puede quitar) y lo deducido.

### Lo que contaste ayer

Las cargas que el usuario contó ayer («hoy he corrido 10 km») **siguen contando hoy** al negociar el entrenamiento, como si las hubiera contado hoy. Lo de hoy, si lo hay, manda. El motor sigue sin leer cargas contadas (D-011).

### Molestias

Cuando el usuario cuenta una molestia («me duele la rodilla»), la respuesta sigue siendo la segura y **no cambia el entrenamiento** (D-022). Lo nuevo es que la memoria del día apunta la zona (`discomforts`), una vez por zona y día, para poder preguntar después cómo va (paso 8).

### Datos

Sin migración: `dislikedExercises` es opcional en el perfil y viaja en la copia de seguridad; `discomforts` es opcional en la memoria del día. La unión de las cargas de ayer y de hoy se hace en el store al construir el briefing; los detectores y la memoria tienen sus tests.

---

## D-038 — AXIS habla primero

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 8 del plan de Alex para que AXTHLETICS sea el entrenador ideal.

### Qué cambia

Hasta ahora AXIS solo respondía. Ahora, cuando tiene algo que decir, lo dice: **una nota corta en Inicio, debajo de su recomendación**, sin tarjeta, con la marca de AXIS y el texto en gris; tocarla abre la conversación, donde la misma nota aparece bajo la presentación mientras el hilo está vacío. **Una sola nota, la más importante** (`lib/domain/axis/proactive.ts`):

1. **Una molestia contada ayer** (D-037): «Ayer me contaste una molestia en la rodilla. ¿Cómo va? Si sigue, mejor que lo vea un profesional». Nunca diagnostica ni cambia la sesión.
2. **El lunes, la semana pasada:** sesiones, series (las mismas que Progreso, D-036) y la zona que más se quedó atrás (D-034).
3. **El primer día de una semana de descarga** (D-031), hasta que se entrena esa semana.
4. **Un objetivo medible que va por detrás** (D-035): cuánto llevas y cuánto tocaría.
5. **La recuperación de hoy sin registrar.**

### Reglas

- Determinista, en el dispositivo y sin red: sale de lo que la app ya sabe. No pasa por el modelo de lenguaje.
- No decide nada ni propone acciones: como mucho, invita a hablar.
- Sin nada que decir, no hay nota.

### Fuera de D-038

Avisos con la app cerrada: es el recordatorio diario (paso 9), que necesita su propia decisión porque pide una pieza en el servidor.

---

## D-039 — Recordatorio diario en el calendario

**Fecha:** 2026-10-17 · **Estado:** aprobada e implementada · Paso 9 y último del plan de Alex. Alex eligió el evento de calendario frente a la notificación push, que habría necesitado guardar datos en un servidor.

### Qué es

En Perfil, **«Recordatorio diario»**: se elige la hora (de 5:00 a 23:30, cada media hora; por defecto las 8:00) y «Añadir al calendario» descarga un archivo `.ics` con un evento que **se repite cada día** y **avisa a esa hora**: «AXTHLETICS · Registra tu recuperación», con el enlace a la app.

### Por qué así

- **Avisa con la app cerrada** en iPhone y Android: lo da el calendario del móvil.
- **Sin servidor y sin datos fuera del móvil**: el archivo se genera en el dispositivo (`lib/domain/reminders/ics.ts`) y no lleva nada del usuario.
- **Hora flotante**, sin zona horaria: suena a las 8:00 de donde esté el usuario.
- **Siempre el mismo identificador**: volver a añadirlo con otra hora actualiza el evento en lugar de duplicarlo, en los calendarios que lo respetan.

### Fuera de D-039

Notificaciones push de la propia app; quitar o cambiar el evento se hace desde el calendario.

---

## D-040 — Objetivos tras el primer test, y Progreso dentro de Entrenamiento

**Fecha:** 2026-10-18 · **Estado:** aprobada e implementada · Pedido por Alex. **Corrige D-036**: Progreso deja de ser pestaña.

### AXIS propone objetivos con el primer test

Al completar el **primer test de evolución** (D-021), el resumen añade **«Objetivos que te propongo»**: un objetivo medible (D-035) por prueba —flexiones (la variante del usuario), plancha, sentadilla isométrica en pared y remo—.

- **Cifra:** la marca del test más un **25 %**, con un mínimo de **2 repeticiones o 10 segundos**; los segundos se redondean a 5. En el remo cuenta el mejor lado.
- **Plazo:** **8 semanas** desde el test: llega a los dos tests siguientes.
- **«Añadir estos objetivos»** los añade todos de una vez (`addTargets`, una sola escritura); se quitan o cambian en Perfil. Un ejercicio que ya tiene objetivo no se propone otra vez.
- Solo con el **primer** test completado. Si el usuario no los añade al terminar, la propuesta sigue en Entrenamiento mientras no tenga objetivos.
- Desde ahora **las marcas de los tests cuentan** para los objetivos, como una serie más (`bestSetOf`).

### Progreso, en Entrenamiento

Vuelven las **cuatro pestañas** (Inicio, Entrenamiento, Recuperación, Historial). Lo que enseñaba la pestaña Progreso es ahora la sección **«Tu progreso»** de Entrenamiento, después de «Esta semana»: tus objetivos (o la propuesta del test), tu fuerza y las series por semana. El volumen por músculo no se repite: ya está en «Esta semana».

### Enmienda (2026-10-18): gráficas más suaves

Pedido por Alex. La mejor serie por sesión es una **curva suave** con un relleno azul muy tenue debajo, en lugar de tramos rectos. La curva es **monótona** (Fritsch–Carlson): entre dos sesiones nunca sube ni baja más allá de sus dos marcas, así que no enseña ninguna marca que no exista. Las barras de series por semana tienen la **punta redondeada**, más separación y las semanas no seleccionadas en azul suave (25 %); una semana floja conserva una altura mínima para que la punta se vea entera.

El gráfico de volumen del **Historial** (D-003) toma la misma forma: punta redondeada y separación entre barras (menor en el mes, que tiene unas 30), todas en el azul primario porque ahí no hay barra seleccionada.

---

## D-041 — El escaneo entrena

**Fecha:** 2026-10-18 · **Estado:** aprobada e implementada · Decidido por Alex: «a partir de las fotos AXTHLETICS debería ver cómo es el usuario de físico para hacerle entrenos más detallados». **Revoca P-017** (el motor no leía el escaneo) y **matiza D-023** («sin normas de población»): ahora hay rangos de referencia, como orientación.

### El problema

Las fotos ya medían simetría, postura, movilidad, proporciones y el volumen relativo de cada zona, pero **qué zonas iban por detrás salía solo de las preguntas**: sin nada con qué comparar, una foto no podía decirlo. Y el motor no usaba el escaneo: las sesiones no cambiaban.

### Cómo se ve el usuario en las fotos

Frente a **rangos de referencia de un físico equilibrado** (`PHYSIQUE_REFERENCE`, por sexo; sin sexo, el valor intermedio). **Provisionales hasta validarlos con escaneos reales (P-015)**:

- **«V» hombros/cintura** de la silueta de frente: por debajo de 1,40 (hombre), 1,25 (mujer) o 1,32 (sin dato), hombros y espalda van por detrás.
- **Brazo frente a muslo**, cada uno respecto a su hueso: por debajo de 0,62, los brazos van por detrás; por encima de 0,92, las piernas.

Lo que el usuario dijo de sí mismo (zonas que ve más flojas) sigue contando, y se dice que lo dijo él. Nunca se habla de grasa ni se puntúa el físico.

### Qué cambia en las sesiones (`lib/domain/scanner/physique.ts`)

Con el escaneo más reciente de los **últimos 90 días**:

- **Zonas prioritarias** (las de las fotos y las que dijo el usuario): su objetivo semanal de series sube un **25 %** (D-034), así que el motor las elige antes.
- **Correctivos en el calentamiento** (D-032), dos como mucho, solo cuando lo medido queda **claramente** fuera (a medio camino entre «bien» y «mal» en las escalas del escáner): cabeza adelantada o brazos que no llegan arriba → ángeles en la pared y rotación torácica; sentadilla corta → tobillo a la pared y flexor de cadera; rodilla hacia dentro → equilibrio a una pierna.
- **Diferencia clara entre lados** (hombros, caderas o brazos arriba) → cada sesión lleva **al menos un ejercicio a una mano o una pierna**.
- No cambia **si** se entrena hoy: eso lo siguen decidiendo la recuperación y el calendario.

### Cómo se explica

- En el motivo del día, un factor más: «Por tu escaneo, priorizo hombros y espalda, añado movilidad al calentamiento e incluyo trabajo a una mano o una pierna».
- Al terminar el escaneo y en su detalle del historial, **«Lo que cambia en tus entrenos»**, una frase por hallazgo, con las cifras.
- AXIS lo cuenta al preguntarle por el escaneo: «Con tu escaneo ya ajusto tus sesiones: …».

### Lo que no cambia

Las fotos siguen **sin salir del móvil** y el escaneo sigue sin llegar a la capa de lenguaje: todo es determinista y local.

---

## D-042 — AXIS charla

**Fecha:** 2026-10-18 · **Estado:** aprobada e implementada · Decidido por Alex: «cuando le digo hola me responde "dime qué quieres cambiar y por qué"… debería responder algo como "hola, qué tal"»; «la única solución es que responda una IA para que salga más natural». **Matiza D-028**: lo que no se entiende ya no acaba en «no he entendido».

### El problema

Un «hola» no era ninguna intención. Fuera de «Cambiar entrenamiento» salía «No he entendido a qué te refieres»; dentro, todo lo no reconocido se leía como petición y salía «Dime qué quieres cambiar y por qué». Siempre igual, porque eran textos fijos, y el modelo nunca contestaba: solo redactaba respuestas del motor.

### Qué cambia

- **Nueva intención `social`** (`conversation/social.ts`): saludos, «¿qué tal?», gracias, despedidas, elogios, risas y «vale/ok». Solo si el mensaje entero es charla: «hola, estoy reventado» sigue siendo cansancio y «buenas, me duele la rodilla» sigue siendo médico. Se reconoce antes que nada, también en «Cambiar entrenamiento»; ahí un «vale» o un «venga» siguen siendo parte de la negociación.
- **La charla la escribe el modelo, con libertad.** Prompt propio (`chatSystemPrompt`), temperatura 0,8 en vez de 0,3, y **los últimos 8 mensajes del día** como conversación, para que no se repita. No recibe la respuesta del motor (la copiaba), solo lo que no puede faltar: en «Cambiar entrenamiento», la invitación a decir qué cambiar, que se añade si el modelo la olvida.
- **Lo que no se entiende ni reescrito (D-028) se contesta como charla** en vez de «no he entendido».
- **Sin modelo, o si su texto no pasa la puerta**, contesta el motor: varias formas de cada respuesta que cambian de un mensaje a otro, con el nombre y lo que toca hoy.

### Lo que no cambia

- El modelo **no decide nada**: en la charla no propone cambios ni alternativas, y `checkModelText` sigue (sin cifras inventadas, sin afirmar nada del usuario que no esté en el briefing o en lo que él ha dicho, sin lenguaje médico, sin aperturas prohibidas). Las exclamaciones se quitan en lugar de descartar la respuesta.
- **El nombre sigue sin salir del dispositivo**: el modelo escribe `{nombre}` y se sustituye en el móvil; en el historial que viaja, el nombre va como `{nombre}`. No se usa en dos respuestas seguidas.
- La ruta valida el historial: como mucho 10 mensajes de 600 caracteres, solo de `user` o `axis`.

---

## Decisiones pendientes

Nada de lo que sigue debe inventarse ni resolverse sin aprobación explícita de Alex.

### Abiertas por D-001 (AXIS decide el entrenamiento)

**`P-001` — ¿Qué control tiene el usuario sobre la sesión que propone AXIS? CERRADO por D-010.**
D-001 dice que el usuario no elige «principalmente» una rutina, lo que deja abierto si puede rechazar la propuesta, pedir otra, cambiar la duración o entrenar algo distinto. Afecta directamente al diseño de la pantalla de Entrenamiento.

**`P-002` — ¿Qué se guarda como «rutina utilizada» si la sesión la genera AXIS? CERRADO por D-010.**
El Documento Maestro (Parte VI.3) exige almacenar «rutina utilizada» en cada entrenamiento. Con sesiones generadas hace falta decidir qué ocupa ese campo: una plantilla con identificador, una instantánea de la sesión generada, o un concepto nuevo. Bloquea el modelo de datos de la fase 3.

**`P-003` — ¿De dónde salen los «objetivos del usuario» y la «duración disponible»? CERRADO por D-010.**
D-001 los lista como entradas de AXIS, pero Core v0.1 no tiene pantalla de Perfil y la ficha de Fase 0 §1.2 limita el perfil al nombre. Tampoco existe ningún control en las seis pantallas aprobadas donde el usuario indique de cuánto tiempo dispone hoy. Sin decidir esto, AXIS no puede usar esas dos entradas.

**`P-004` — Catálogo de ejercicios. CERRADO por D-008.**
Ya estaba PENDIENTE en el Design System §26, y D-001 lo vuelve crítico: «grupos musculares trabajados recientemente» y «progresión de ejercicios» exigen que cada ejercicio tenga metadatos (grupo muscular, patrón de movimiento, progresión). Bloquea el motor de reglas.

**`P-009` — ¿Qué muestran Inicio y Entrenamiento un día en que AXIS recomienda no entrenar? CERRADO por D-010.**
D-001 autoriza expresamente esa recomendación, pero el prototipo aprobado siempre muestra «Empezar entrenamiento» y una sesión de hoy. Es un estado visual que no existe y que no debo diseñar por mi cuenta.

### Abiertas por D-002 (Recovery Score)

**`P-005` — Escala de entrada y normalización de cada indicador. CERRADO por D-009.**
Los pesos están cerrados, pero no cómo se convierte cada indicador en un 0–100 antes de ponderarlo. El sueño tiene tres componentes en el Documento Maestro (horas, calidad, sensación al despertar) y pesa un 35 %. Energía, fatiga y estrés no tienen escala definida. Solo la hidratación es evidente (`n / 8`). El Design System §20 prohíbe inventar estas escalas.

**`P-010` — ¿Qué son «datos suficientes»? CERRADO por D-009.**
D-002 prohíbe inventar un resultado cuando faltan datos, pero no define el umbral: cuántos indicadores, cuáles son obligatorios, y qué pasa si falta el sueño, que pesa un 35 %.

### Abiertas por D-005 (tokens)

**`P-006` — Valor del radio de superficie/card. CERRADO por D-009.**
D-005 fija 8 px para controles y autoriza un radio mayor para superficies, pero no dice cuál. El prototipo aprobado usa hoy 24 px y 32 px, y la base es de 14 px. Hace falta un valor por token, no tres radios sueltos.

**`P-007` — Valores de los colores semánticos. CERRADO por D-008.**
Success, warning y error siguen PENDIENTES. Además **falta el token de error**: el Design System §17 define el tramo 0–49 del Recovery Score en rojo y hoy no existe ningún token para pintarlo.

**`P-008` — Sombras.**
El Design System §10 dice «sin sombras por defecto»; el prototipo aprobado tiene sombras muy sutiles en la card de Entrenamiento, la de Recuperación y el selector del Historial. Hay que decidir si el Design System admite esta excepción acotada o si se retiran.

**`P-011` — Token de fondo general.**
Sigue PENDIENTE en el Design System §6 y §26 («blanco o blanco muy suavemente grisáceo»). El código usa `#ffffff`.

### Otras

**`P-013` — Fórmula de Carga / Training Load. CERRADO por D-008.**
Resuelto: índice 0–100 sobre los últimos 7 días, calculado en `lib/domain/workouts/load.ts`.

**`P-014` — Persistir la sesión en curso. CERRADO.**
Resuelto el 2026-09-15: la sesión se guarda entera en cada cambio (carga, repeticiones, serie completada, ejercicio saltado) en el almacén `activeWorkout` de IndexedDB v6, una sola fila con clave fija. Al arrancar, `reconcileStoredWorkout` (`lib/domain/workouts/active-workout.ts`) decide: si es de hoy se reanuda donde estaba; si es de otro día con series hechas pasa al historial como abandonada (o completada, si no quedaba nada) usando como cierre la hora del último guardado; si es de otro día sin series se descarta. Terminar o abandonar borra la fila. El modelo de datos de la sesión no cambia.

**`P-012` — Ubicación de la skill de diseño. CERRADO.**
Movida a `.claude/skills/` y corregidas sus referencias. Además se actualizó su contenido, que seguía describiendo la fase de prototipo visual y **prohibía explícitamente** IndexedDB, el Recovery Score real y el razonamiento real de AXIS: al activarse habría dado instrucciones contrarias a lo ya aprobado.

### Abiertas por D-023 (escáner corporal)

**`P-015` — Fórmula de cada componente del índice.**
Cómo se convierte cada medida (grados, proporciones, diferencias izquierda/derecha) en un 0–100 por componente, el margen de error a partir del cual una diferencia cuenta y qué hace el índice si falta un componente. Se decide con los datos del prototipo de medición, no antes.

**`P-016` — Fotos en la copia de seguridad. CERRADO (2026-10-09).**
Decidido por Alex: se guarda **una miniatura por pose, solo en el dispositivo**, para comparar mes a mes. La copia de seguridad lleva los resultados (medidas, respuestas e índice) y **nunca las fotos**; un archivo que las traiga no las importa. El escaneo se puede borrar desde su detalle en Historial.

**`P-017` — Reglas del motor con el escaneo. CERRADO (2026-10-09); revocado por D-041 (2026-10-18): el motor sí usa el escaneo.**
Decidido por Alex: **AXIS informa y ofrece opciones; el usuario decide.** El motor no lee el escaneo y la decisión del día no cambia sola. Cuando el usuario pregunta por su escaneo, AXIS explica el resultado y enumera sus opciones; si hoy hay una sesión ya preparada por el motor que trabaja una zona que el usuario quiere desarrollar, la propone con su botón de confirmar, como cualquier otro cambio (D-012). Ningún resultado del escáner se trata como una lesión o una molestia.
