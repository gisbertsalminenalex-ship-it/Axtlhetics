# Axtlhetics — Design System

**Versión:** Core v0.1  
**Estado:** Definitivo para implementación visual, salvo los elementos marcados como `PENDIENTE`.

## 1. Objetivo

Axtlhetics es **el sistema operativo de tu cuerpo**: una aplicación móvil de entrenamiento y recuperación diseñada para ayudar al usuario a decidir qué hacer hoy para acercarse a sus objetivos físicos.

El sistema visual debe transmitir una combinación de **editorial + premium + tecnológico + limpio + informativo**. Debe sentirse como un entrenador personal calmado y seguro de sí mismo, no como una hoja de cálculo, un dashboard SaaS o una app de fitness cargada de métricas.

La interfaz no compite por mostrar más datos. Compite por mostrar **menos datos, mejor elegidos**.

Cada pantalla debe tener un objetivo claro y un único protagonista visual:

- Inicio → recomendación de AXIS y siguiente acción.
- Entrenamiento → serie/ejercicio activo.
- Recuperación → estado de recuperación y qué significa.
- Historial → sesiones y evolución previa.
- Workout Summary → resumen post-entrenamiento dentro del flujo de Entrenamiento.

---

## 2. Alcance

Core v0.1 mantiene las cinco áreas funcionales del Documento Maestro:

1. Home / Inicio
2. Training / Entrenamiento
3. Workout Summary — flujo interno post-entrenamiento
4. Recovery / Recuperación
5. Calendar / History — presentado como Historial

### Navegación principal definitiva

La bottom navigation tiene **4 tabs y solo 4**:

1. **Inicio**
2. **Entrenamiento**
3. **Recuperación**
4. **Historial**

`Workout Summary` existe como pantalla/estado interno después de completar un entrenamiento, pero **no es un tab**.

`Progreso` y `Perfil` **no forman parte de la navegación ni del alcance visual de Core v0.1**. La referencia visual puede contener elementos de versiones futuras, pero no deben introducirse en el prototipo actual.

Quedan fuera de Core v0.1: cuentas, login, autenticación, nutrición avanzada, logros, gamificación, perfil completo, pantalla independiente de progreso, gestión avanzada de rutinas, backend y funciones cloud.

### El entrenamiento del día lo decide AXIS (D-001)

Axtlhetics **no se basa principalmente en que el usuario elija manualmente una rutina**. AXIS decide qué entrenamiento tiene sentido hacer ese día y explica brevemente por qué.

Esto **no añade pantallas ni tabs**: cambia quién decide el contenido de la sesión dentro de las pantallas ya aprobadas. No se diseña un editor ni un gestor de rutinas.

AXIS puede recomendar también **recuperación o no entrenar**. El estado visual correspondiente en Inicio y Entrenamiento sigue sin diseñar y no debe inventarse (`P-009`).

### Estadísticas simples en Historial (D-003)

El bloque «Rendimiento +12 % vs. semana pasada» con su gráfico de líneas simple queda **aprobado** para Core v0.1 y se considera una **estadística simple**, no un gráfico avanzado.

El gráfico debe seguir siendo sencillo y no convertirse en un dashboard analítico. La aprobación cubre ese gráfico y no autoriza añadir otros.

---

## 3. Referencia visual definitiva

La referencia oficial es:

`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

Es la **Visual Source of Truth** para composición, jerarquía, densidad, proporciones, tratamiento de pantallas y lenguaje visual general.

La referencia no es literal respecto al alcance del producto. Si muestra `Progreso`, `Perfil` u otros elementos fuera de Core v0.1, esos elementos no se incorporan automáticamente.

La referencia debe utilizarse como guía de composición e intención, no como excusa para introducir funcionalidades futuras ni para copiar literalmente cada componente.

---

## 4. Plataforma

**Mobile-first obligatorio.**

La interfaz base está diseñada para teléfono vertical:

- layouts adaptados al viewport móvil
- uso con una mano
- safe areas
- controles táctiles claros
- sin sidebars de escritorio
- sin tablas densas
- sin convertir la aplicación en un dashboard

Las pantallas mayores pueden adaptarse, pero el diseño base siempre es móvil.

---

## 5. Dirección visual

### Personalidad

Axtlhetics debe sentirse:

- editorial
- premium
- tecnológico
- limpio
- informativo
- calmado
- atlético
- inteligente
- confiable
- enfocado

### Regla principal

**Un solo protagonista por pantalla.**

No crear varias tarjetas o widgets con el mismo peso visual compitiendo por atención.

### Jerarquía

La jerarquía debe construirse en este orden:

1. tipografía
2. espacio en blanco
3. posición/composición
4. contraste de superficie
5. bordes/divisores
6. color de acento
7. componentes elevados solo cuando sea necesario

La interfaz debe poder sentirse completa sin sentirse llena.

### Anti-dashboard

Evitar:

- grids de métricas sin jerarquía
- una card para cada dato
- dashboards SaaS genéricos
- exceso de gráficos
- exceso de gauges
- gradientes decorativos
- glassmorphism
- sombras fuertes
- demasiados colores
- elementos decorativos sin función
- layouts que parezcan escritorio comprimido en móvil

---

## 6. Paleta

Cerrada por **D-077**: familia visual AXIS, la misma estructura que Finax y Mentax. Cada app tiene su color y su AXIS tiene otro: Finax verde con AXIS violeta, Mentax violeta con AXIS turquesa, **AXTHLETICS cobalto con AXIS en tinta oscura** (la lima inicial se sustituyó el mismo día).

| Token | Valor | Uso |
|---|---|---|
| `--primary` | `#1F4FE0` | cobalto: acción principal, estado activo, progreso relevante |
| `--secondary` | `#E7EDFC` | cobalto suave: chips activos, pill de la barra inferior, recuadros de icono |
| `--axis` | `#141A26` | tinta: el recuadro del símbolo de AXIS |
| `--axis-foreground` | `#FFFFFF` | el símbolo sobre ese recuadro |
| `--axis-soft` | `#EEF0F4` | franjas y notas de AXIS (las notas sobre el canvas llevan borde fino) |
| `--axis-ink` | `#141A26` | texto «AXIS ·» en sus franjas |
| `--background` | `#F3F5F9` | canvas tintado |
| `--surface` | `#FFFFFF` | tarjeta, con `shadow-card` |
| `--fill` | `#F1F3F8` | relleno DENTRO de una tarjeta: chips, campos, pistas |
| `--foreground` | `#141A26` | texto principal (y `--ink`) |
| `--muted-foreground` | `#5B6372` | texto secundario |
| `--border` | `#E6E9F0` | divisores y contorno fino de tarjetas |
| `--border-strong` | `#D3D9E3` | contorno de controles que deben leerse como tocables |
| `--track` | `#ECEFF4` | pistas de anillos y progreso |
| `--muted-nontext` | `#9AA1AE` | iconos inactivos y anotaciones internas |

`#1F4FE0` es el **único azul primario aprobado**. No reintroducir `#0A61F8` ni `#4F7CFF`.

El cobalto marca la acción; la tinta marca a AXIS. Ninguno de los dos se reparte por toda la interfaz.

### Recuadros de categoría (D-077)

Los iconos de factores y accesos van en un recuadro con el color de su categoría (`components/category-tone.ts`): sueño `#EEF0FF`/`#4B55C8`, energía `#FFF4DB`/`#9A5B00`, estrés `#FCEBF3`/`#B4316F`, hidratación `#E3F4FB`/`#0E7490`, fatiga y entrenamiento cobalto suave. Dicen qué es, nunca si está bien o mal: por eso ninguno es verde, naranja ni rojo.

### Colores semánticos

Verde, naranja y rojo están permitidos **únicamente como estados semánticos**:

- verde → estado saludable/óptimo/éxito
- naranja → estado moderado/atención
- rojo → estado bajo/error/alerta

**Aprobados por D-008.** Los tres valores son definitivos y viven centralizados como tokens:

| Estado | Rango en Recovery Score | Token | Valor |
|---|---|---|---|
| Verde | 75–100 | `--color-success` | `#1ba672` |
| Naranja | 50–74 | `--color-warning` | `#f2a516` |
| Rojo | 0–49 | `--color-error` | `#d93b3b` |

Ningún componente escribe un color de estado suelto: todos pasan por los tokens y por el mapa de bandas de `components/recovery-band.ts`.

La **Carga** usa una semántica distinta a propósito, porque en ella «más» no es «mejor»: baja en neutro, moderada en verde y alta en naranja.

---

## 7. Tipografía

Fuente oficial: **Plus Jakarta Sans** (D-077), la de Finax: la familia AXIS comparte voz tipográfica.

Escala cerrada por **D-075**, con los tamaños grandes rebajados en **D-077** porque Plus Jakarta Sans es más ancha que Inter. Once tamaños con nombre, cada uno con su interlineado y su tracking (`app/globals.css`). Ningún componente escribe un tamaño en píxeles.

| Token | Tamaño | Uso |
|---|---:|---|
| `text-hero` | 60 px | una cifra que es la pantalla (cronómetro) |
| `text-display` | 36 px | cifra protagonista |
| `text-title-lg` | 28 px | título de pestaña, saludo de Inicio |
| `text-title` | 24 px | titular de la tarjeta protagonista |
| `text-headline` | 19 px | título de sección, nombre de la marca |
| `text-body` | 16 px | texto de lectura |
| `text-callout` | 15 px | filas de lista, botones |
| `text-subhead` | 14 px | texto de apoyo dentro de tarjetas |
| `text-footnote` | 13 px | texto secundario |
| `text-caption` | 12 px | antetítulos, etiquetas de métrica, metadatos |
| `text-overline` | 11 px | rótulos en mayúsculas, barra de navegación |

Pesos: `extrabold` en títulos de pantalla, titulares de tarjeta y secciones; `bold` en botones, antetítulos y cifras; `semibold` en filas y etiquetas; el resto, regular. Las cifras que se comparan llevan `tabular-nums`.

El **antetítulo** (fecha o contexto de la pantalla) va en `text-caption`, `bold`, mayúsculas y cobalto, encima del título.

No introducir una segunda familia tipográfica.

---

## 8. Espaciado

Unidad base: **4 px**.

Utilizar múltiplos de 4: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.

No crear otra escala de espaciado.

---

## 9. Forma

Actualizado por **D-005**. Los radios **no son uniformemente 8 px**: la referencia visual aprobada utiliza radios distintos según el tipo de superficie o componente, y el sistema los distingue por tipo.

### Radios por tipo de componente

| Token | Valor | Uso |
|---|---|---|
| `--radius-surface-lg` | `28px` | superficie protagonista: tarjeta de AXIS, tarjeta de sesión, tarjeta del Recovery Score |
| `--radius-surface` | `20px` | superficies: listas agrupadas, tarjetas, campos |
| `--radius-full` | `999px` | botones principales, pills, chips, badges y elementos circulares |

Actualizado por **D-075**: 32 y 24 px hacían que todo pareciera una burbuja. Los botones principales pasan a ser pill.

Cerrado por **D-009**, siguiendo la regla de D-004: estos son los valores que usa la referencia visual aprobada, y el Design System los recoge en lugar de imponer otros.

D-005 mencionaba 8 px para controles. **La interfaz aprobada no usa 8 px en ninguna parte**: sus botones y campos usan 24 px. El token de 8 px se retira porque describía algo que no existe. Si más adelante se quiere un radio pequeño, se añade primero aquí.

### Reglas

- Cada radio sale de un **token con nombre**. No se escriben radios arbitrarios directamente en los componentes.
- No se generan escalas de radios derivadas automáticamente de un único valor base (`sm`/`md`/`lg`/`xl`...). Los radios son **semánticos**, no una rampa matemática.
- Un radio nuevo solo se añade si existe un tipo de componente que lo justifique, y se añade aquí primero.
- No hacer que toda la interfaz parezca una colección de pills.

---

## 10. Elevación

Revocado «sin sombras por defecto» por **D-077**. La familia AXIS separa con **tarjetas blancas sobre el canvas tintado**, y la tarjeta lleva una sombra suave:

| Token | Uso |
|---|---|
| `shadow-card` | tarjetas, listas agrupadas, módulos |
| `shadow-card-lg` | la tarjeta protagonista de la pantalla |
| `shadow-action` | el botón principal cobalto |
| `--elevation-control` | el pulgar de un control que se superpone a su carril |

Ninguna sombra suelta: si aparece otra, se añade aquí primero. Dentro de una tarjeta blanca no hay tarjetas con sombra: lo que va dentro usa `--fill` (chips, campos) o un borde fino.

---

## 11. Botones y controles

Botón principal: **52 px** de altura.

Área táctil mínima: **44 × 44 px**. Única excepción aprobada: los vasos de hidratación (§19).

La acción primaria debe dominar visualmente. Evitar múltiples CTAs primarios compitiendo.

El botón primario utiliza `--color-primary`.

Los controles secundarios deben ser visualmente más silenciosos.

---

## 12. Iconografía

Familia principal: **Lucide React**.

Lenguaje:

- predominantemente lineal
- limpio
- ligero
- reconocible
- consistente

Se permiten iconos sólidos o tratamientos filled **solo cuando tenga sentido funcional o de estado** y manteniendo una única familia visual coherente. No mezclar familias de iconos sin una razón explícita.

No utilizar iconos como decoración sin función.

---

## 13. Movimiento

Animaciones rápidas, suaves y funcionales.

Rango general: **200–300 ms**.

No animar por decoración. Si un elemento no necesita animación, se deja quieto.

Las transiciones de navegación deben ser discretas y rápidas. Evitar transiciones dramáticas.

### Tokens de motion

Viven en `app/globals.css` y son el único sitio donde se fijan estos números.

| Token | Valor | Uso |
|---|---|---|
| `--ax-press` | `130ms` | feedback al pulsar |
| `--ax-fast` | `180ms` | microinteracciones, como el llenado de un vaso |
| `--ax-base` | `220ms` | cambios de contenido |
| `--ax-enter` | `300ms` | entrada de una pantalla o un bloque |
| `--ax-metric` | `700ms` | recorrido de una métrica hasta su valor |
| `--ax-stagger` | `45ms` | separación entre elementos de una lista |
| `--ax-rise` | `10px` | desplazamiento de entrada; la pantalla no viaja |
| `--ax-press-scale` | `0.985` | hundido al pulsar, sin rebote |
| `--ax-ease` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | salida suave, sin rebote |

Utilidades disponibles: `.ax-enter`, `.ax-fade`, `.ax-stagger`, `.ax-stagger-fade` (para SVG, donde `transform` va en unidades del viewBox), `.ax-press` y `.ax-draw`.

### Reglas

- Solo se animan `opacity` y `transform`. Nada anima `width`, `height` ni posición.
- El escalonado se limita a **seis posiciones**: nadie debe esperar por una lista larga.
- La barra de navegación no se mueve al cambiar de pestaña.
- Sin efecto de escritura carácter a carácter, sin rebotes, sin celebraciones.
- Hidratación: el agua sube y baja en ~180 ms escalando un rectángulo recortado con la silueta del vaso.

### Reducción de movimiento

Con `prefers-reduced-motion: reduce` **no se desactiva nada**: se neutralizan los tokens. `--ax-rise` pasa a `0px`, `--ax-press-scale` a `1`, y las entradas y las métricas a `1ms`. El feedback esencial —el color de un vaso al llenarse, el estado activo de un control— se mantiene, solo que inmediato.

---

## 14. Tarjetas

Las cards son un **patrón de agrupación**, no el contenedor universal de la interfaz.

### Usar una card cuando:

- agrupe información relacionada;
- separe una acción de su contexto;
- marque un módulo interactivo;
- mejore claramente el escaneo en móvil.

### No usar una card cuando:

- la tipografía y el espacio ya crean suficiente jerarquía;
- solo se está encerrando un título o una métrica por costumbre;
- varias cards consecutivas crearían un dashboard de bloques iguales.

Patrón estándar:

- superficie `--color-surface`
- radio 8 px
- sin sombra por defecto
- padding basado en múltiplos de 4
- jerarquía interna clara
- whitespace suficiente

Reutilizar el mismo patrón cuando la función sea la misma.

---

## 15. AXIS

AXIS es el **sistema de orientación inteligente** de Axtlhetics. No es un chatbot generalista.

### Concepto

AXIS mira el contexto disponible y ayuda a responder:

> **¿Qué debería hacer hoy y por qué?**

Debe guiar decisiones, no pedir al usuario que interprete un dashboard.

### Identidad visual

Actualizado por **D-077**:

- **símbolo de AXIS:** los «Three Elements» del ecosistema AXIS (`AxisSymbol`, `components/axis-symbol.tsx`), el mismo de la app AXIS y de la sección AXIS de cada app;
- **su firma es el recuadro de tinta** (`AxisBadge`): el símbolo en blanco sobre `--axis`. Va allí donde habla AXIS: el porqué de la recomendación, las notas, el chat, los resúmenes;
- las franjas y notas de AXIS van en `--axis-soft` con «AXIS ·» en `--axis-ink`;
- **marca de la app** (D-029): la «A» con la flecha que sube (`AxisMark`). En la cabecera, como ficha (`BrandTile`): la «A» con su flecha, en blanco, sobre cobalto, seguida de «axthletics» en minúscula;
- presencia reconocible pero nunca dominante;
- copy corto, claro y con autoridad tranquila.

### No usar

- mascota de chatbot;
- avatar de robot gigante;
- burbujas de chat como patrón principal;
- órbitas o anillos decorativos alrededor del símbolo;
- logo gigante;
- lenguaje visual que haga parecer AXIS una aplicación independiente.

AXIS debe estar integrado en Axtlhetics y aparecer con más o menos presencia según el contexto.

### Reglas funcionales

AXIS debe:

- explicar por qué recomienda algo;
- poder recomendar no cambiar nada cuando no existe una razón clara;
- nunca inventar datos;
- no presentar incertidumbre como certeza;
- no sustituir el juicio médico profesional.

En Core v0.1, AXIS puede utilizar reglas locales deterministas. La arquitectura debe permanecer desacoplada y agnóstica al proveedor de IA.

---

## 16. Circular Metric

`Circular Metric` es el patrón reutilizable para métricas circulares 0–100.

Usos actuales:

- Recovery Score
- Carga / Training Load

Puede reutilizarse para futuras métricas compatibles que sean aprobadas.

Características:

- anillo fino;
- track neutral sutil;
- número grande en el centro;
- `/100` cuando corresponda;
- estado semántico contenido;
- etiqueta/contexto breve.

No crear componentes visualmente distintos para Recovery Score y Carga si comparten la misma estructura.

---

## 17. Recovery Score

### Naturaleza y pesos (D-002)

El Recovery Score es un **índice orientativo interno de 0 a 100**. No debe presentarse nunca como una medición médica ni como un diagnóstico, ni en la interfaz ni en el copy de AXIS.

Pesos **aprobados y definitivos**:

| Indicador | Peso |
|---|---:|
| Sueño | 35 % |
| Energía | 20 % |
| Fatiga muscular | 20 % |
| Estrés | 15 % |
| Hidratación | 10 % |
| **Total** | **100 %** |

Reglas asociadas:

- Los pesos deben vivir **centralizados en un único lugar del código**, para poder ajustarlos sin rehacer la lógica.
- El `82` que muestra el prototipo es **un valor visual de mock** y no es el resultado de esta fórmula.
- Si faltan datos suficientes, **no se inventa un resultado**: se usa el estado «datos insuficientes» descrito más abajo.
- AXIS debe poder **explicar el resultado** de forma breve y comprensible.

Cerrados por **D-009**: la normalización de cada indicador vive en `lib/domain/recovery/scales.ts` y la política de datos suficientes (sueño obligatorio y al menos 3 factores) en `lib/domain/recovery/weights.ts`.

### Componente visual

El componente visual aprobado es un `Circular Metric` con:

- track `#EAEAEA`;
- cifra central;
- `/100`;
- contexto breve;
- color semántico según estado.

### Estados visuales de prototipo

Para el prototipo visual se pueden representar:

- saludable / óptimo;
- moderado;
- bajo;
- datos insuficientes.

Como referencia visual del prototipo, los rangos pueden tratarse como:

- 0–49 → rojo
- 50–74 → naranja
- 75–100 → verde

Estos rangos son **una convención visual de prototipo**, no una especificación definitiva de la fórmula de producto.

### Sin datos

- track vacío;
- guion o equivalente visual;
- nunca inventar una puntuación.

Los **pesos** los fija D-002 y la normalización y el umbral de datos suficientes los fija D-009. Nada del Recovery Score sigue pendiente.

---

## 18. Carga / Training Load

La Carga utiliza el mismo patrón `Circular Metric` que Recovery Score.

Visualmente debe comunicar una métrica relevante sin competir con AXIS ni convertir Home en un dashboard.

No inventar todavía la fórmula funcional, pesos o interpretación clínica de la carga si no están aprobados.

---

## 19. Hidratación

Axtlhetics utiliza **8 vasos interactivos**, no un contador principal en mililitros.

Estados:

- vaso vacío;
- vaso lleno;
- grupo parcial;
- objetivo completo.

Interacción visual:

- tocar vacío → llenar;
- tocar lleno → vaciar;
- transición ≈ 200 ms;
- resumen `n / 8 vasos`.

Ejemplo visual: `5 / 8 vasos`.

El vaso lleno utiliza el azul primario. El vaso vacío utiliza un borde neutral sutil.

La hidratación debe ser claramente interactiva sin parecer un control complejo.

**Excepción al área táctil mínima (aprobada por Alex, 2026-10-13).** Los 8 vasos van en una sola fila y ocho áreas de 44 px de ancho no caben en un móvil de 360 px (harían falta 352 px). Cada vaso mantiene **44 px de alto** y su ancho es el que le toca en la fila: unos 30 px en 360 px, unos 34 px en 390 px. No se pasa a dos filas ni se cambia el componente aprobado. Un toque en el vaso de al lado se corrige con otro toque, sin coste.

---

## 20. Recovery inputs

Los cinco indicadores principales son:

1. sueño
2. hidratación
3. energía
4. fatiga muscular
5. estrés / estado de ánimo

La anatomía visual debe permitir controles táctiles claros.

La escala funcional definitiva de los indicadores que siga pendiente no debe inventarse.

---

## 21. Bottom navigation

Componente móvil:

- aproximadamente 64 px + safe area;
- iconos ~24 px;
- área táctil ≥44 px;
- estados activo/inactivo claros;
- sin sombras pesadas.

### Tabs definitivos

1. **Inicio**
2. **Entrenamiento**
3. **Recuperación**
4. **Historial**

No incluir:

- Progreso
- Perfil

`Workout Summary` no es un tab: pertenece al flujo interno de Entrenamiento.

---

## 22. Estados

Los componentes importantes deben contemplar:

- loading
- empty
- error
- disabled
- pressed
- success cuando corresponda

Mantener siempre el mismo lenguaje visual.

---

## 23. Reutilización y componentes

Cuando un patrón aparezca en varias pantallas, debe ser un componente reutilizable.

Componentes principales previstos:

- Button
- Card
- AXIS Card
- Circular Metric
- Recovery Score — composición especializada de Circular Metric
- Hydration Glass
- Hydration Group
- Indicator Input
- Exercise Row
- Set Stepper
- Rest Timer
- Day Strip
- List Row
- Tag / Chip
- Bottom Navigation
- Modal
- Bottom Sheet
- Empty State
- Loading State
- Error State
- Progress Indicator

No crear variantes aisladas sin razón real.

### Exercise Figure (D-024)

Figura animada de un ejercicio: un maniquí 2D que va de la pose inicial a la final y vuelve, con los músculos que trabaja marcados.

- **Componente:** `components/exercise-figure.tsx`. Las poses son datos (`lib/exercise-figure/poses.ts`); los músculos salen del catálogo.
- **Color:** cuerpo `--muted-nontext`, lado lejano el mismo a 50 % de opacidad; músculo principal `--primary`, secundario `--primary` a 45 %; objetos (caja, silla, pared) `--track`; suelo `--border`; pesa `--foreground`. Ningún color propio.
- **Lienzo:** fondo `--surface`, con el radio del hueco donde va (`--radius-surface` en el ejercicio activo).
- **Movimiento:** una repetición cada 2,8 s: quieto arriba, baja, quieto abajo, vuelve, con aceleración suave. Con «reducir movimiento», quieto en la pose inicial.
- **Tamaños:** 128 × 96 px animada en el ejercicio activo; 48 px y 40 px quieta en «Siguiente ejercicio» y en el resumen.
- **Accesibilidad:** `role="img"` con el nombre del ejercicio y sus músculos principales.

### Rest Timer (D-019)

Descanso entre series dentro del ejercicio activo. Aprobado en D-019.

- **Cuándo:** arranca solo al completar una serie, con los segundos de descanso del ejercicio. No aparece tras la última serie de la sesión.
- **Dónde:** sustituye al bloque del ejercicio actual (nombre, selectores y «Completar serie»). La cabecera, la barra de progreso, el siguiente ejercicio y las estadísticas no cambian.
- **Composición:** etiqueta `DESCANSO` con el estilo de `EJERCICIO ACTUAL`; cuenta atrás grande dentro de una **Circular Metric** en tono `primary`, sin otro anillo propio; debajo, «Después» con el nombre del ejercicio y la serie que viene (serie, reps y kg).
- **Acciones:** «Saltar descanso» es la acción principal (botón primario, 56 px). «+ 15 s» y «Deshacer última serie» son texto (mínimo 44 px de alto).
- **Fin:** al llegar a cero vuelve sola a la serie. Sin sonido ni vibración en Core v0.1.
- **Persistencia:** el descanso se guarda con la sesión en curso; al recargar, sigue donde iba.

### Weekly Volume (D-034)

Series de la semana por grupo muscular frente a su objetivo, en Entrenamiento, bajo «Esta semana».

- **Componente:** `components/weekly-volume.tsx`. Los datos salen del dominio (`lib/domain/workouts/weekly-volume.ts`).
- **Composición:** una fila por grupo: nombre a la izquierda (13,5 px, medio), `hechas / objetivo series` a la derecha en `muted-foreground` con cifras tabulares, y debajo una barra de 6 px de alto con radio completo.
- **Color:** pista `--track` y progreso `--primary`, el mismo lenguaje que la Circular Metric. Sin colores de estado: ir por detrás no es un error.
- **Techo:** cumplido el objetivo, la barra se queda llena. Pasarse no se premia.
- **Sin tarjeta:** va directamente sobre el lienzo; la tipografía y el espacio dan la jerarquía.

---

## 24. Reglas para Claude Code

Antes de modificar UI, Claude Code debe leer:

1. `docs/product/AXTHLETICS_DECISIONS_V1.md` — registro de decisiones aprobadas, prioridad máxima
2. `CLAUDE.md`
3. Documento Maestro
4. este Design System
5. `docs/design/AXTHLETICS_VISUAL_REFERENCE.png`
6. `TECH_STACK_AXTHLETICS_UPDATED.md`

Para decisiones visuales, la jerarquía es **decisiones aprobadas → Design System → código** (D-004). Un valor visual no queda aprobado por el hecho de estar escrito en el código.

Debe respetar el stack aprobado, reutilizar componentes, mantener mobile-first y no inventar decisiones de producto.

Durante la fase de prototipo visual debe priorizar fidelidad visual y facilidad de iteración sobre implementación de lógica real.

Claude Code no debe introducir una nueva pantalla, tab, métrica o componente importante sin comprobar primero el alcance aprobado.

---

## 25. Tokens

```css
:root {
  --color-primary: #1F4FE0; /* D-077 */
  --color-background: /* PENDIENTE: blanco o blanco muy suavemente grisáceo */;
  --color-surface: #F7F7F7;
  --color-text-primary: #111111;
  --color-text-secondary: #6B6B6B;
  --color-secondary: #DCE8FF;
  --color-border: #D6D6D6;
  --color-track: #EAEAEA;
  --color-muted-nontext: #9A9A9A;

  /* Valores semánticos aprobados por D-008.
     Recovery Score: 0-49 rojo, 50-74 naranja, 75-100 verde. */
  --color-success: #1ba672;
  --color-warning: #f2a516;
  --color-error: #d93b3b;

  --font-family: "Plus Jakarta Sans", sans-serif; /* D-077 */

  --space-unit: 4px;

  /* Radios semánticos por tipo de componente (D-005, D-009) */
  --radius-surface-lg: 32px;
  --radius-surface: 24px;
  --radius-full: 999px;

  --control-height-primary: 52px;
  --touch-target-min: 44px;

  --motion-fast: 200ms;
  --motion-standard: 250ms;
  --motion-slow: 300ms;
}
```

---

## 26. No inventar

La lista viva de pendientes está en `docs/product/AXTHLETICS_DECISIONS_V1.md`, con identificador `P-00X`. Lo que sigue es el resumen visual.

Siguen pendientes y requieren aprobación:

- normalización de cada indicador del Recovery Score a 0–100 (`P-005`) y umbral de datos suficientes (`P-010`);
- fórmula, pesos e interpretación definitiva de Carga;
- valores exactos de colores semánticos, incluido el token de error que falta (`P-007`);
- valor de `--radius-surface` (`P-006`);
- si el Design System admite las sombras sutiles que existen hoy en el prototipo (`P-008`);
- token exacto del fondo general si se quiere pasar de blanco a un blanco ligeramente grisáceo (`P-011`);
- catálogo o biblioteca de ejercicios (`P-004`);
- grado de control del usuario sobre la sesión que propone AXIS (`P-001`);
- estado visual del día en que AXIS recomienda no entrenar (`P-009`);
- copy definitivo de AXIS cuando falte contexto;
- cualquier funcionalidad fuera de Core v0.1.

Ya están **cerradas** y no deben volver a tratarse como pendientes:

- color primario `#0A61F8`;
- navegación principal de 4 tabs: Inicio, Entrenamiento, Recuperación, Historial;
- Workout Summary como flujo interno, no tab;
- ausencia de Progreso y Perfil como pantallas/tabs de Core v0.1;
- hidratación con 8 vasos interactivos;
- dirección visual editorial + premium + tecnológica + limpia + informativa;
- identidad visual de AXIS basada en símbolo X + AXIS, integrada y discreta;
- **pesos del Recovery Score** (D-002): sueño 35, energía 20, fatiga 20, estrés 15, hidratación 10;
- **AXIS decide el entrenamiento del día** (D-001), sin selección manual de rutina como mecanismo principal;
- **gráfico de rendimiento del Historial aprobado** como estadística simple (D-003);
- **radios semánticos por tipo de componente**, no un único radio de 8 px (D-005);
- **neutros centralizados** en los tokens de §25, sin grises arbitrarios en los componentes (D-005);
- jerarquía visual **decisiones → Design System → código** (D-004);
- **normalización del Recovery Score y política de datos suficientes** (D-009);
- **radios de superficie**: 32 px protagonista, 24 px superficies y controles, 999 px pills (D-009);
- **colores semánticos**: verde `#1ba672`, naranja `#f2a516`, rojo `#d93b3b` (D-008).

---

## 27. Regla de oro

**Axtlhetics debe verse como la Visual Source of Truth y comportarse como el Documento Maestro.**

El sistema visual debe comunicar que Axtlhetics es el sistema operativo del cuerpo: menos ruido, menos decisiones y una siguiente acción clara.

Cuando exista una duda:

**detectar → informar → proponer → esperar aprobación.**

No inventar decisiones importantes.
