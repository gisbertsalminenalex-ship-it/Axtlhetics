# Axtlhetics — Design System

**Versión:** Core v0.1  
**Estado:** Definitivo para implementación visual, salvo los elementos
marcados como `PENDIENTE`.

## 1. Objetivo

Axtlhetics es una aplicación móvil de entrenamiento personal. El sistema
visual debe transmitir simplicidad, claridad, rapidez, confianza y foco
en la acción. La aplicación debe sentirse como un entrenador personal,
no como una hoja de cálculo.

Cada pantalla debe tener un objetivo claro y una acción principal
reconocible.

## 2. Alcance

Core v0.1 incluye únicamente:

1.  Home
2.  Training
3.  Workout Summary
4.  Recovery
5.  Calendar / History

Quedan fuera de Core v0.1: cuentas, login, autenticación, nutrición,
logros, gamificación, perfil completo, pantalla independiente de
progreso, gestión avanzada de rutinas, backend y funciones cloud.

## 3. Referencia visual definitiva

La referencia oficial es:

`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

Debe utilizarse para composición, jerarquía, densidad, proporciones,
tarjetas, botones, navegación, espaciado y apariencia general.

Claude Code debe reproducir el lenguaje visual aprobado y no
reinterpretarlo ni sustituirlo por un dashboard de escritorio.

## 4. Plataforma

**Mobile-first obligatorio.**

La interfaz base está diseñada para teléfono vertical:

- columna y layouts adaptados al viewport móvil
- uso con una mano
- safe areas
- controles táctiles claros
- sin sidebars de escritorio
- sin tablas densas
- sin convertir la aplicación en un dashboard

Las pantallas mayores pueden adaptarse, pero el diseño base siempre es
móvil.

## 5. Paleta

| Token                    | Valor     | Uso                                      |
|--------------------------|-----------|------------------------------------------|
| `--color-primary`        | `#4F7CFF` | acciones principales, progreso y acentos |
| `--color-background`     | `#FFFFFF` | fondo                                    |
| `--color-surface`        | `#F7F7F7` | tarjetas y contenedores                  |
| `--color-text-primary`   | `#111111` | texto principal                          |
| `--color-secondary`      | `#DCE8FF` | estados y detalles secundarios           |
| `--color-text-secondary` | `#6B6B6B` | texto secundario                         |
| `--color-border`         | `#D6D6D6` | bordes y divisores                       |
| `--color-track`          | `#EAEAEA` | pistas de progreso/anillos               |
| `--color-muted-nontext`  | `#9A9A9A` | iconos inactivos y anotaciones internas  |

`#9A9A9A` no debe utilizarse como texto normal.

Los colores semánticos independientes de éxito/error/advertencia no
están cerrados como decisión de producto. **No inventarlos.**

## 6. Tipografía

Fuente oficial: **Inter**.

| Uso              | Tamaño |
|------------------|-------:|
| Título principal |  32 px |
| Subtítulo        |  20 px |
| Texto normal     |  16 px |
| Texto pequeño    |  13 px |

No introducir una segunda familia tipográfica.

## 7. Espaciado

Unidad base: **4 px**.

Utilizar múltiplos de 4: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.

No crear otra escala de espaciado.

## 8. Forma

Radio principal: **8 px**.

`--radius: 8px`

No crear automáticamente `radius-sm`, `radius-md`, `radius-lg`, etc.

Radio completo:

`--radius-full: 999px`

Solo para pills, chips, badges y elementos circulares.

## 9. Elevación

**Sin sombras.**

La separación se consigue mediante superficies, bordes y espacio en
blanco. No añadir `box-shadow` por defecto.

## 10. Botones y controles

Botón principal: **52 px** de altura.

Área táctil mínima: **44 × 44 px**.

La acción primaria debe dominar visualmente. Evitar múltiples acciones
primarias compitiendo.

## 11. Iconografía

Biblioteca: **Lucide React**.

Estilo lineal, simple, consistente y reconocible. No mezclar familias de
iconos.

## 12. Movimiento

Animaciones rápidas, suaves y funcionales.

Rango general: **200–300 ms**.

No animar por decoración.

Hidratación: cambio de vaso vacío/lleno aproximadamente **200 ms**.

## 13. Tarjetas

Patrón principal:

- fondo `#F7F7F7`
- radio 8 px
- sin sombra
- padding basado en múltiplos de 4
- jerarquía interna clara
- suficiente whitespace

Reutilizar el mismo patrón cuando la función sea la misma.

## 14. AXIS

AXIS se integra en el lenguaje visual de Axtlhetics y no tiene una
paleta completamente independiente.

Puede diferenciarse mediante composición, jerarquía e iconografía, pero
no debe parecer una aplicación distinta.

AXIS debe explicar por qué realiza una recomendación.

El copy o datos no aprobados deben tratarse como `MOCK`.

## 15. Recovery Score

El componente visual aprobado es un **anillo circular** con:

- pista `#EAEAEA`
- cifra central
- color provisional basado en el lenguaje primario hasta que se cierre
  la regla funcional

Estado sin datos:

- pista vacía
- guion o equivalente visual
- nunca inventar una puntuación

La fórmula, pesos, umbrales, categorías y regla definitiva de color
siguen pendientes. No inventarlos.

## 16. Hidratación

Home utiliza **8 vasos interactivos**, no un contador principal en
mililitros.

- vaso vacío: borde gris
- vaso lleno: `#4F7CFF`
- transición: aproximadamente 200 ms
- tocar vacío → llenar
- tocar lleno → vaciar
- resumen: `n / 8 vasos`

Ejemplo visual: `5 / 8 vasos`.

## 17. Recovery inputs

Los cinco indicadores son:

1.  sueño
2.  hidratación
3.  energía
4.  fatiga muscular
5.  estrés / estado de ánimo

La anatomía visual debe permitir controles táctiles claros.

La escala funcional definitiva de los indicadores que siga pendiente no
debe inventarse.

## 18. Bottom navigation

Componente móvil:

- aproximadamente 64 px + safe area
- iconos Lucide ~24 px
- área táctil ≥44 px
- estados activo/inactivo claros
- sin sombras pesadas

El contenido exacto de las pestañas sigue pendiente. Si se representa
antes de cerrarlo, usar `MOCK` y no inventar destinos definitivos.

## 19. Estados

Los componentes importantes deben contemplar:

- loading
- empty
- error
- disabled
- pressed
- success cuando corresponda

Mantener siempre el mismo lenguaje visual.

## 20. Reutilización

Cuando un patrón aparezca en varias pantallas, debe ser un componente
reutilizable.

Componentes principales previstos:

- Button
- Card
- AXIS Card
- Recovery Score
- Hydration Glasses
- Indicator Input
- Exercise Row
- Progress Bar
- Bottom Navigation
- Modal
- Bottom Sheet
- Empty State
- Loading State
- Error State

No crear variantes aisladas sin razón real.

## 21. Reglas para Claude Code

Antes de modificar UI, Claude Code debe leer:

1.  `CLAUDE.md`
2.  Documento Maestro
3.  este Design System
4.  `docs/design/AXTHLETICS_VISUAL_REFERENCE.png`
5.  `TECH_STACK.md`

Debe respetar el stack aprobado, reutilizar componentes, mantener
mobile-first y no inventar decisiones de producto.

## 22. Tokens

``` css
:root {
  --color-primary: #4F7CFF;
  --color-background: #FFFFFF;
  --color-surface: #F7F7F7;
  --color-text-primary: #111111;
  --color-text-secondary: #6B6B6B;
  --color-secondary: #DCE8FF;
  --color-border: #D6D6D6;
  --color-track: #EAEAEA;
  --color-muted-nontext: #9A9A9A;

  --font-family: "Inter", sans-serif;

  --space-unit: 4px;

  --radius: 8px;
  --radius-full: 999px;

  --control-height-primary: 52px;
  --touch-target-min: 44px;

  --motion-fast: 200ms;
  --motion-standard: 250ms;
  --motion-slow: 300ms;
}
```

## 23. No inventar

Siguen pendientes y requieren aprobación:

- fórmula y pesos del Recovery Score
- umbrales/categorías/color definitivo del Score
- catálogo o biblioteca de ejercicios
- creación de la primera rutina
- parámetros objetivo exactos de una rutina
- contenido definitivo de la bottom navigation
- copy definitivo de AXIS cuando falte contexto
- cualquier funcionalidad fuera de Core v0.1

## 24. Regla de oro

**Axtlhetics debe verse como la referencia visual definitiva y
comportarse como el Documento Maestro.**

Cuando exista una duda:

**detectar → informar → proponer → esperar aprobación.**

No inventar decisiones importantes.
