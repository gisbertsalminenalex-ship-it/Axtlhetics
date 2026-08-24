# Axtlhetics — Fase 0: Preparación del Diseño

Mapa funcional de las 5 pantallas de Core v0.1, construido a partir del Documento Maestro, CLAUDE.md, TECH_STACK.md y todas las decisiones aprobadas (A–E de la auditoría + decisiones 1–6 de cierre).

**Leyenda de etiquetas:**
- **[DEFINIDO EN DOCUMENTACIÓN]** — viene explícitamente del Documento Maestro / CLAUDE.md / TECH_STACK.md
- **[DECIDIDO POSTERIORMENTE POR ALEX]** — acordado en este chat, no estaba en la documentación original
- **[PENDIENTE DE DISEÑO]** — no está resuelto todavía, se decidirá en Fase 1/2
- **[FUERA DE CORE v0.1]** — existe en la visión del producto pero no se construye ahora

---

## 1. HOME

### 1.1 Objetivo
Centro de control de la aplicación. En menos de 10 segundos el usuario debe saber su estado actual y la acción más recomendable, y poder empezar a entrenar con un solo toque. **[DEFINIDO EN DOCUMENTACIÓN]**

### 1.2 Contenido

**Obligatorio [DEFINIDO EN DOCUMENTACIÓN]:**
- Saludo personalizado (usa el nombre del perfil mínimo)
- Tarjeta de AXIS con la recomendación del momento
- Botón grande "Empezar entrenamiento"
- Resumen semanal (versión simple, según Decisión D)
- Accesos rápidos a otras secciones
- Barra de navegación inferior

**Secundario [DEFINIDO EN DOCUMENTACIÓN]:**
- Indicadores de recuperación con registro de un toque (sueño, agua)

**NO debe aparecer en Core v0.1:**
- Registro de comidas/nutrición — el documento original lo incluía como indicador de un toque en Home, pero queda excluido por la Decisión C **[FUERA DE CORE v0.1]**
- Insignias, niveles, desafíos **[FUERA DE CORE v0.1]** (Decisión E)
- Progreso avanzado / gráficos **[FUERA DE CORE v0.1]** (Decisión D)
- Cualquier campo de perfil más allá del nombre **[FUERA DE CORE v0.1]** (Decisión 3)

### 1.3 Acciones

- **Principal:** iniciar entrenamiento (botón grande) **[DEFINIDO EN DOCUMENTACIÓN]**
- **Secundarias:** registrar sueño, registrar agua, tocar la tarjeta de AXIS, usar accesos rápidos **[DEFINIDO EN DOCUMENTACIÓN]**; editar el nombre desde el saludo mediante modal **[DECIDIDO POSTERIORMENTE POR ALEX]**
- **Navegación:** a Training (botón principal); a otras secciones vía accesos rápidos y barra inferior. La barra inferior definitiva es **Inicio · Entrenamiento · Recuperación · Historial [DECIDIDO POSTERIORMENTE POR ALEX]**

### 1.4 Estados

- Primer uso / sin datos **[PENDIENTE DE DISEÑO — comportamiento exacto de AXIS sin historial no está definido]**
- Usuario aún no ha entrenado hoy **[DEFINIDO EN DOCUMENTACIÓN]**
- Usuario acaba de terminar una sesión **[DEFINIDO EN DOCUMENTACIÓN]**
- Usuario lleva varios días sin actividad **[DEFINIDO EN DOCUMENTACIÓN]**
- Carga, error **[PENDIENTE DE DISEÑO — no especificado a nivel de esta pantalla]**

### 1.5 AXIS

- **Dónde aparece:** tarjeta principal de Home **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué información puede usar:** sueño, hidratación, energía, fatiga, estrés/ánimo (inputs aprobados del Recovery Score) + historial de entrenamientos recientes **[DEFINIDO EN DOCUMENTACIÓN + Decisión 4]**
- **Qué NO debe usar:** nutrición **[FUERA DE CORE v0.1]**
- **Tipo de recomendación:** acción del día (qué entrenar / descansar), siempre con explicación **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué NO debe hacer todavía:** usar IA externa, inventar datos si faltan, comportarse como chatbot general **[DEFINIDO EN DOCUMENTACIÓN]**
- Comportamiento exacto cuando no hay datos suficientes: **[PENDIENTE DE DISEÑO]**

### 1.6 Componentes necesarios (solo función, no diseño)

- Cabecera con saludo
- Tarjeta de AXIS (recomendación + explicación)
- Botón primario grande
- Indicador de recuperación editable (sueño, agua)
- Resumen semanal simple
- Grid/lista de accesos rápidos
- Barra de navegación inferior
- Modal de edición de nombre

### 1.7 Navegación

- **Se llega desde:** es la pantalla raíz / punto de entrada **[DEFINIDO EN DOCUMENTACIÓN]**
- **Lleva a:** Training (botón principal) **[DEFINIDO EN DOCUMENTACIÓN]**; posiblemente Recovery y Calendar/History vía accesos rápidos **[PENDIENTE DE DISEÑO — el documento no detalla qué accesos rápidos exactos existen]**
- **Modal:** edición de nombre **[DECIDIDO POSTERIORMENTE POR ALEX]**

### 1.8 Diseño ya definido

Paleta actualizada (`#0A61F8` como azul primario; superficie `#F7F7F7`; texto `#111111`; fondo blanco o blanco muy suavemente grisáceo pendiente), tipografía Inter, mucho whitespace, una acción principal por pantalla, animaciones 200–300ms, iconografía Lucide coherente. **[DECIDIDO POSTERIORMENTE POR ALEX / DESIGN SYSTEM]**

### 1.9 Decisiones pendientes

- Contenido exacto de la barra de navegación inferior — **YA CERRADO: Inicio · Entrenamiento · Recuperación · Historial**
- Qué accesos rápidos concretos aparecen
- Copy/contenido exacto de la tarjeta de AXIS por estado
- Comportamiento de AXIS sin historial

### 1.10 Límites de Core v0.1

Fuera: nutrición, logros/gamificación, pantalla de progreso independiente, perfil completo (edad, altura, peso, foto, objetivos).

---

## 2. TRAINING

### 2.1 Objetivo
Guiar la sesión de entrenamiento para que el usuario solo tenga que concentrarse en entrenar. **[DEFINIDO EN DOCUMENTACIÓN]**

### 2.2 Contenido

**Obligatorio [DEFINIDO EN DOCUMENTACIÓN]:**
- Resumen inicial: duración, dificultad, ejercicios, recomendación de AXIS
- Durante la sesión: series, repeticiones, peso, progreso
- Comparación con la última sesión
- Descansos con temporizador automático

**Secundario [DEFINIDO EN DOCUMENTACIÓN]:**
- Consejos de AXIS durante el descanso

**NO debe aparecer:** nutrición, logros, progreso avanzado/gráficos. **[FUERA DE CORE v0.1]**

### 2.3 Acciones

- **Principal:** avanzar entre series/ejercicios y registrar lo completado (peso, reps) **[DEFINIDO EN DOCUMENTACIÓN, a nivel funcional]**
- **Secundarias:** iniciar/saltar descanso, ver comparación con sesión anterior **[DEFINIDO EN DOCUMENTACIÓN]**; pausar o cancelar el entrenamiento a medias **[PENDIENTE DE DISEÑO — no contemplado en el documento]**
- **Navegación:** al finalizar, pasa a Workout Summary **[DEFINIDO EN DOCUMENTACIÓN, de forma implícita]**

### 2.4 Estados

- Primer uso, sin sesión anterior con la que comparar **[PENDIENTE DE DISEÑO]**
- Datos normales (con historial) **[DEFINIDO EN DOCUMENTACIÓN]**
- En curso / en descanso (estados de la lógica de la sesión) **[DEFINIDO EN DOCUMENTACIÓN, a nivel funcional]**
- Cancelación a medias **[PENDIENTE DE DISEÑO]**
- Carga, error **[PENDIENTE DE DISEÑO]**

### 2.5 AXIS

- **Dónde aparece:** resumen inicial (recomendación) y durante los descansos (consejos) **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué puede usar:** inputs de recuperación aprobados + historial de entrenamientos **[DEFINIDO EN DOCUMENTACIÓN + Decisión 4]**
- **Qué NO debe usar:** nutrición **[FUERA DE CORE v0.1]**
- **Tipo de recomendación:** intensidad/consejo durante el descanso, con explicación **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué NO debe hacer:** inventar comparaciones si no hay datos suficientes **[DEFINIDO EN DOCUMENTACIÓN]**

### 2.6 Componentes necesarios

- Tarjeta de resumen inicial
- Tarjeta de ejercicio activo (input de series/reps/peso)
- Indicador de progreso de la sesión
- Temporizador de descanso
- Tarjeta de consejo de AXIS
- Mini-componente de comparación con la sesión anterior

### 2.7 Navegación

- **Se llega desde:** Home (botón "Empezar entrenamiento") **[DEFINIDO EN DOCUMENTACIÓN]**; posiblemente desde Calendar/History para repetir una rutina — **[PENDIENTE DE DISEÑO, no mencionado en el documento]**
- **Lleva a:** Workout Summary al finalizar **[DEFINIDO EN DOCUMENTACIÓN]**

### 2.8 Diseño ya definido

Principios visuales generales (§1.8); nada específico de layout para Training está definido todavía.

### 2.9 Decisiones pendientes

- ⚠️ **Gap importante:** el documento menciona "rutina utilizada" como dato a guardar, pero **no define cómo se crean o seleccionan las rutinas en Core v0.1** (¿rutinas predefinidas? ¿el usuario las crea? ¿entrenamiento libre sin rutina?). Esto no es solo una decisión de diseño visual — es una decisión funcional que probablemente necesite tratarse con Alex/ChatGPT antes de la Fase 2.
- Qué pasa si se cancela un entrenamiento a medias
- Si se puede repetir una rutina desde Calendar/History

### 2.10 Límites de Core v0.1

Fuera: nutrición, logros, comunidad, wearables, análisis avanzado de progreso.

---

## 3. WORKOUT SUMMARY

### 3.1 Objetivo
Cerrar la sesión mostrando un resumen de lo realizado y, si corresponde, los nuevos récords, reforzando la motivación sin gamificación formal. **[DEFINIDO EN DOCUMENTACIÓN, combinando Parte V.1 "Finalización" + Decisión D]**

### 3.2 Contenido

**Obligatorio [DEFINIDO EN DOCUMENTACIÓN + Decisión D]:**
- Estadísticas de la sesión (duración, volumen, ejercicios realizados)
- Nuevos récords personales, si los hay, cuando estén claramente relacionados con el entrenamiento

**Secundario [DEFINIDO EN DOCUMENTACIÓN]:**
- Mensaje motivacional/felicitación de AXIS (sin insignias formales)

**NO debe aparecer:** sistema de logros/insignias/niveles, gráficos históricos avanzados, nutrición. **[FUERA DE CORE v0.1]**

### 3.3 Acciones

- **Principal:** confirmar y volver a Home **[PENDIENTE DE DISEÑO — no está explícito en el documento, es la interpretación más razonable del flujo]**
- **Secundarias:** ver detalle de récords **[PENDIENTE DE DISEÑO]**
- Compartir/exportar: **no mencionado para esta pantalla en el documento** — no se debe asumir. **[PENDIENTE DE DISEÑO / posible FUERA DE CORE v0.1]**

### 3.4 Estados

- Con récord nuevo (destacar) / sin récord nuevo **[PENDIENTE DE DISEÑO, a nivel visual]**
- Carga
- Error al guardar la sesión — riesgo a tener en cuenta: qué pasa si falla el guardado en IndexedDB **[PENDIENTE DE DISEÑO]**

### 3.5 AXIS

- **Dónde aparece:** mensaje de felicitación/resumen de la sesión **[DEFINIDO EN DOCUMENTACIÓN, Parte III.9]**
- **Qué puede usar:** datos de la sesión recién completada + historial para detectar récords **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué NO debe hacer:** no está claro si en esta pantalla AXIS también debe sugerir el "próximo paso" (eso podría ser función de Home) **[PENDIENTE DE DISEÑO]**

### 3.6 Componentes necesarios

- Tarjeta de estadísticas de la sesión
- Indicador visual de récord nuevo (no es un sistema de logros, solo un reconocimiento puntual)
- Mensaje de AXIS
- Botón de confirmación/cierre

### 3.7 Navegación

- **Se llega desde:** Training, automáticamente al finalizar **[DEFINIDO EN DOCUMENTACIÓN]**
- **Lleva a:** Home **[PENDIENTE DE DISEÑO — interpretación razonable, no explícita]**; posible acceso directo a Calendar/History **[PENDIENTE DE DISEÑO]**

### 3.8 Diseño ya definido

Principios visuales generales (§1.8).

### 3.9 Decisiones pendientes

- Si existe acción de compartir/exportar desde aquí
- Si hay botón directo a Calendar/History
- Cómo se visualiza un "récord nuevo" sin que se perciba como gamificación (línea fina con la Decisión E)
- Manejo del error de guardado

### 3.10 Límites de Core v0.1

Fuera: insignias/niveles, gráficos avanzados, nutrición.

---

## 4. RECOVERY

### 4.1 Objetivo
Registrar los indicadores de recuperación diarios y mostrar el Recovery Score con la recomendación de AXIS sobre la intensidad de entrenamiento. **[DEFINIDO EN DOCUMENTACIÓN]**

### 4.2 Contenido

**Obligatorio [DEFINIDO EN DOCUMENTACIÓN + Decisión 4]:**
- Registro de sueño (horas, calidad, sensación al despertar)
- Contador de hidratación (vasos de agua, objetivo personalizable)
- Estado físico: energía, fatiga muscular, estrés/estado de ánimo
- Recovery Score visible (0–100)
- Explicación/recomendación de AXIS (entrenar fuerte / mantener / reducir carga)

**Secundario [PENDIENTE DE DISEÑO]:**
- Histórico reciente del Recovery Score (no está definido si vive aquí o en Calendar/History)

**NO debe aparecer:** registro nutricional, logros, gráficos avanzados de tendencias. **[FUERA DE CORE v0.1]**

### 4.3 Acciones

- **Principal:** registrar/actualizar los indicadores del día **[DEFINIDO EN DOCUMENTACIÓN, a nivel funcional]**
- **Secundarias:** editar el objetivo personal de vasos de agua, ver la explicación completa de AXIS **[DEFINIDO EN DOCUMENTACIÓN]**

### 4.4 Estados

- Primer uso / sin registro del día (vacío)
- Registro parcial
- Registro completo del día
- Recovery Score no calculable por falta de datos suficientes **[PENDIENTE DE DISEÑO — el fallback exacto no está definido]**
- Carga, error

### 4.5 AXIS

- **Dónde aparece:** junto al Recovery Score, explicando la recomendación de intensidad **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué puede usar:** sueño, hidratación, energía, fatiga, estrés/ánimo **[Decisión 4]**
- **Qué NO debe usar:** nutrición **[FUERA DE CORE v0.1]**
- **Tipo de recomendación:** entrenar fuerte / mantener la sesión / reducir carga, con explicación **[DEFINIDO EN DOCUMENTACIÓN]**
- **Qué NO debe hacer:** calcular o mostrar el score como cierto si faltan datos suficientes; debe indicarlo con claridad **[DEFINIDO EN DOCUMENTACIÓN, principio general de AXIS]**

### 4.6 Componentes necesarios

- Formulario/registro de sueño
- Contador de agua (stepper)
- Selectores de energía / fatiga / estrés-ánimo
- Componente visual del Recovery Score (probablemente circular/gauge — su animación ya está identificada como una de las animaciones clave a decidir en la fase de diseño)
- Tarjeta de recomendación de AXIS

### 4.7 Navegación

- **Se llega desde:** Home (indicador o acceso rápido) y desde la barra de navegación inferior **[DECIDIDO POSTERIORMENTE POR ALEX]**
- **Lleva a:** normalmente vuelve a Home, sin más destinos obligatorios **[PENDIENTE DE DISEÑO]**

### 4.8 Diseño ya definido

Principios visuales generales (§1.8); la animación del Recovery Score ya está en la lista de animaciones clave pendientes de decidir (acordado en fase de planificación previa).

### 4.9 Decisiones pendientes

- ⚠️ **Fórmula y pesos del Recovery Score** — explícitamente pendiente por la Decisión 4, no se debe inventar
- Valor por defecto del objetivo de hidratación
- Si el histórico de Recovery Score vive en esta pantalla o solo en Calendar/History
- Comportamiento exacto cuando faltan datos para calcular el score

### 4.10 Límites de Core v0.1

Fuera: nutrición, logros, gráficos de tendencias avanzados.

---

## 5. CALENDAR / HISTORY

### 5.1 Objetivo
Permitir revisar el historial de entrenamientos pasados para comparar la evolución. **[DEFINIDO EN DOCUMENTACIÓN, pero solo a nivel de arquitectura de datos — Parte VI.3, no existe una sección de especificación UX dedicada a esta pantalla como sí existe para Home]**

> ⚠️ **Nota importante:** a diferencia de Home, el Documento Maestro **no tiene una sección de especificación de pantalla** para Calendar/History. Todo lo que sigue en esta ficha proviene de la descripción de la arquitectura de datos (Parte VI.3 "Estructura de Entrenamientos y Estadísticas") y de inferencias razonables sobre su función — no de una definición UX explícita. Este es el mayor vacío de documentación de las 5 pantallas.

### 5.2 Contenido

**Obligatorio [DEFINIDO EN DOCUMENTACIÓN, a nivel de dato]:**
- Lista de sesiones pasadas, nunca eliminadas
- Por sesión: fecha, duración, rutina utilizada, nivel de esfuerzo, observaciones

**Secundario [DEFINIDO EN DOCUMENTACIÓN + Decisión D]:**
- Estadísticas simples (volumen semanal, frecuencia, tiempo entrenado) como resumen, no como sistema de gráficos avanzado

**NO debe aparecer:** gráficos avanzados/análisis histórico profundo, rachas, objetivos avanzados, logros, nutrición. **[FUERA DE CORE v0.1]**

### 5.3 Acciones

- **Principal:** ver/seleccionar una sesión pasada **[PENDIENTE DE DISEÑO — no especificado]**
- **Secundarias:** posible repetición de una rutina anterior desde aquí **[PENDIENTE DE DISEÑO — no mencionado en el documento, no debe darse por hecho]**

### 5.4 Estados

- Primer uso / sin historial (vacío) **[PENDIENTE DE DISEÑO, pero coherente con el principio general de estados vacíos]**
- Con historial
- Carga, error

### 5.5 AXIS

- El documento indica que AXIS **usa** el historial para adaptar futuras recomendaciones (Parte VI.3 "Uso por AXIS"), pero **no está definido si AXIS aparece visiblemente en esta pantalla** o si solo la consume como fuente de datos en segundo plano. **[PENDIENTE DE DISEÑO]**

### 5.6 Componentes necesarios (tentativo)

- Lista de sesiones (o vista calendario — no definido cuál de las dos, o si ambas)
- Tarjeta de sesión individual
- Posible selector de vista

> Todo lo anterior es tentativo dado el vacío de especificación; no debe tomarse como decisión.

### 5.7 Navegación

- No definida en el documento. **[PENDIENTE DE DISEÑO]** Se accede probablemente desde Home (acceso rápido) y/o barra de navegación inferior.

### 5.8 Diseño ya definido

Solo los principios visuales generales (§1.8); nada específico de esta pantalla.

### 5.9 Decisiones pendientes

- Especificación UX completa de la pantalla (layout: lista vs. calendario vs. ambos)
- Si permite repetir una rutina anterior
- Si AXIS tiene presencia visible aquí
- Navegación de entrada/salida

### 5.10 Límites de Core v0.1

Fuera: gráficos avanzados, rachas, objetivos avanzados, logros, nutrición.

---

## Resumen global

### Componentes probablemente compartidos
- Botón primario (acción principal por pantalla)
- Tarjeta base reutilizable (Card)
- Tarjeta de AXIS (con variantes: recomendación en Home, consejo en Training, explicación en Recovery, felicitación en Workout Summary)
- Barra de navegación inferior
- Indicador circular/gauge del Recovery Score (posible reutilización en el resumen de Home)
- Inputs numéricos/steppers (peso, reps, vasos de agua)
- Indicador visual de récord nuevo

### Patrones de navegación
- Home actúa como pantalla raíz.
- Flujo lineal: Home → Training → Workout Summary → vuelta a Home.
- Recovery y Calendar/History probablemente son destinos accesibles desde Home y/o la barra inferior, pero qué pantallas exactas componen esa barra **no está definido**.

### Patrones de estados
- Las 5 pantallas necesitan, como mínimo: estado vacío/primer uso, estado normal, carga y error.
- Home, Training y Workout Summary tienen además estados especiales derivados de la lógica de la app (inactividad, sesión en curso/descanso, récord nuevo).

### Decisiones visuales que afectan a toda la app (ya definidas)
Paleta de colores, tipografía Inter, whitespace generoso, una acción principal por pantalla, animaciones 200–300ms, iconografía lineal simple.

### Decisiones que debemos resolver antes de diseñar las pantallas
1. Contenido exacto de la barra de navegación inferior — **CERRADO: Inicio · Entrenamiento · Recuperación · Historial**
2. **Cómo funcionan las rutinas de entrenamiento** en Core v0.1 (predefinidas / creadas por el usuario / entrenamiento libre) — gap funcional, no solo visual
3. **Especificación UX de Calendar/History**, que hoy no tiene sección dedicada en el Documento Maestro
4. Fórmula y pesos del Recovery Score
5. Comportamiento de AXIS cuando faltan datos suficientes (en cualquier pantalla)
6. Qué pasa si se cancela un entrenamiento a medias
7. Si existe acción de compartir/exportar desde Workout Summary

No he programado nada, no he modificado el repositorio y no he usado Claude Design todavía.
