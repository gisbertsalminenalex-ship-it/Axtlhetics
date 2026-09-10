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

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#0A61F8` | acción principal, estado activo, progreso relevante y AXIS |
| `--color-background` | `PENDIENTE` | canvas general; debe ser blanco o blanco muy suavemente grisáceo |
| `--color-surface` | `#F7F7F7` | superficies y agrupaciones |
| `--color-text-primary` | `#111111` | texto principal |
| `--color-text-secondary` | `#6B6B6B` | texto secundario |
| `--color-border` | `#D6D6D6` | bordes y divisores |
| `--color-track` | `#EAEAEA` | pistas de anillos y progreso |
| `--color-muted-nontext` | `#9A9A9A` | iconos inactivos y anotaciones internas |
| `--color-secondary` | `#DCE8FF` | superficies/acento azul muy suave cuando sea necesario |

`#0A61F8` es el **único azul primario aprobado**. No reintroducir `#4F7CFF`.

El azul debe sentirse claro, suave y premium. No debe convertirse en un color eléctrico/agresivo repetido por toda la interfaz.

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

Fuente oficial: **Inter**.

| Uso | Tamaño |
|---|---:|
| Título principal | 32 px |
| Título de sección | 20 px |
| Texto normal | 16 px |
| Texto secundario | 13 px |

No introducir una segunda familia tipográfica.

La tipografía debe hacer gran parte del trabajo de jerarquía. Evitar usar negrita, cajas y color simultáneamente para todo.

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
| `--radius-surface-lg` | `32px` | superficie protagonista: tarjeta de AXIS, tarjeta de sesión, tarjeta del Recovery Score |
| `--radius-surface` | `24px` | superficies y controles: botones, accesos rápidos, filas de lista, campos |
| `--radius-full` | `999px` | solo pills, chips, badges y elementos circulares |

Cerrado por **D-009**, siguiendo la regla de D-004: estos son los valores que usa la referencia visual aprobada, y el Design System los recoge en lugar de imponer otros.

D-005 mencionaba 8 px para controles. **La interfaz aprobada no usa 8 px en ninguna parte**: sus botones y campos usan 24 px. El token de 8 px se retira porque describía algo que no existe. Si más adelante se quiere un radio pequeño, se añade primero aquí.

### Reglas

- Cada radio sale de un **token con nombre**. No se escriben radios arbitrarios directamente en los componentes.
- No se generan escalas de radios derivadas automáticamente de un único valor base (`sm`/`md`/`lg`/`xl`...). Los radios son **semánticos**, no una rampa matemática.
- Un radio nuevo solo se añade si existe un tipo de componente que lo justifique, y se añade aquí primero.
- No hacer que toda la interfaz parezca una colección de pills.

---

## 10. Elevación

**Sin sombras por defecto.**

La separación se consigue mediante superficies, bordes y espacio en blanco.

Una elevación extremadamente sutil puede utilizarse únicamente cuando una interacción concreta necesita comunicar profundidad. No utilizar sombras como decoración.

---

## 11. Botones y controles

Botón principal: **52 px** de altura.

Área táctil mínima: **44 × 44 px**.

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

- símbolo abstracto **X** como marca;
- en el header principal, símbolo pequeño antes de `AXIS`;
- dentro de una AXIS Card, símbolo secundario y discreto;
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
  --color-primary: #0A61F8;
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

  --font-family: "Inter", sans-serif;

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
