# Axtlhetics — Registro de Decisiones V1

**Estado:** vivo — se amplía decisión a decisión.
**Última actualización:** 2026-09-17.

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
- Todo ejercicio que carga peso se modela como **unilateral**, porque solo hay una pesa. La única excepción razonable es la sentadilla sujetando la pesa con las dos manos.
- La carga **no puede subir indefinidamente**: `MAX_AVAILABLE_LOAD_KG = 5`. Una vez ahí, la progresión pasa a repeticiones y, cuando el ejercicio se domina, a una **variante más exigente**.

El equipamiento vive en una constante (`AVAILABLE_EQUIPMENT`): cambiarla cambia lo que AXIS puede proponer sin tocar el motor.

### Catálogo

Cierra `P-004`. Son 23 ejercicios con metadatos completos: categoría (empuje / tirón / piernas / core), músculos principales y secundarios, equipamiento, unilateral o no, dificultad 1–5, progresión, regresión, tipo de estímulo, instrucciones y parámetros de trabajo.

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

La **duración disponible hoy**, cuando difiere de la habitual, no tiene un control propio: se comunica a AXIS en la conversación («solo tengo 20 minutos») y entra como petición `shorter`, que se acomoda porque el tiempo es un límite real y no una preferencia. No se añade ningún control nuevo a las pantallas aprobadas.

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
- **La memoria de ayer no se aplica hoy.** Cada día empieza vacío; los registros de días anteriores se conservan sin límite, y por ahora nadie los lee.
- Ninguna inteligencia nueva: es memoria, no decisión.

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
