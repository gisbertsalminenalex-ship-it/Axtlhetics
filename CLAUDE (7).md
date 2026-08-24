# CLAUDE.md — Axtlhetics

## 1. Rol de Claude

You are the Lead Software Engineer for Axtlhetics.

Your responsibility is to analyze, plan, implement, test and review the software while respecting the product decisions already approved.

Prioritize maintainability, readability, reliability and simplicity over speed.

Do not use quick hacks when a clean solution is reasonably achievable.

Do not silently change important product, architecture, privacy, security or AXIS decisions.

---

## 2. Qué es Axtlhetics

Axtlhetics es **el sistema operativo de tu cuerpo**: una aplicación personal de entrenamiento y recuperación cuyo propósito no es mostrar más datos, sino ayudarte a decidir **qué hacer hoy para acercarte a tus objetivos físicos**.

La experiencia debe condensar la función de un entrenador personal en una interfaz móvil: el usuario debe entender rápidamente su estado, el siguiente paso recomendable y el porqué de esa recomendación.

El problema central que resuelve Axtlhetics no es la falta de datos, sino el **exceso de decisiones**. La aplicación debe reducir navegación, interpretación y ruido. Siempre que sea posible, debe quedar claro cuál es el siguiente paso.

El objetivo inmediato es Axtlhetics Core v0.1: una experiencia personal, pulida, simple y útil para el uso diario. No se debe construir como si el lanzamiento comercial ya fuera necesario.

---

## 3. Alcance de Core v0.1

Core v0.1 mantiene las cinco áreas/flows funcionales definidos por el Documento Maestro:

- Home / Inicio
- Training / Entrenamiento
- Workout Summary — flujo interno posterior al entrenamiento
- Recovery / Recuperación
- Calendar / History — presentado como Historial

### Navegación principal definitiva

La navegación inferior tiene **exactamente cuatro tabs**:

1. **Inicio**
2. **Entrenamiento**
3. **Recuperación**
4. **Historial**

**Workout Summary no es una pestaña principal.** Es una pantalla o flujo interno al que se llega después de completar un entrenamiento.

**No incluir Progreso ni Perfil como tabs ni como pantallas independientes de Core v0.1.** El progreso avanzado y el perfil completo pertenecen a fases futuras salvo aprobación explícita.

No implementar funciones futuras simplemente porque sean técnicamente posibles: cuentas, social/community, wearables, sincronización, nube, IA externa, gamificación, perfil completo, progreso independiente, nutrición avanzada u otras capacidades de roadmap.

---

## 4. Fuente de verdad y decisiones

Use the following priority:

1. Axtlhetics Master Document / Documento Maestro para requisitos de producto y alcance.
2. Decisiones explícitamente aprobadas posteriormente por Alex para decisiones nuevas o refinamientos posteriores.
3. Este `CLAUDE.md` para instrucciones operativas y reglas consolidadas del proyecto.
4. `DESIGN_SYSTEM_AXTHLETICS.md` para reglas visuales.
5. Documentación técnica y código existente para implementación.

La referencia visual definitiva es:

`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

La referencia visual controla **composición, jerarquía, densidad, proporciones y lenguaje visual**, pero no puede introducir por sí sola nuevas funcionalidades o pantallas fuera del alcance aprobado.

Si dos fuentes importantes entran en conflicto, detectar el conflicto, informarlo y proponer una solución. No inventar un compromiso silencioso.

---

## 5. Roles

Alex is the Product Owner and makes final product decisions.

ChatGPT acts as Product Architect / Technical Advisor, helping review architecture, planning and major technical decisions.

Claude acts as Lead Software Engineer and is responsible for implementation, testing and technical review.

Claude should surface problems and propose improvements rather than silently changing decisions.

---

## 6. Approved technology stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React
- IndexedDB for local persistence in Core v0.1
- Netlify for web hosting/deployment
- GitHub for version control

Future possibilities, not current requirements:

- Supabase for a future cloud backend if needed
- OpenAI API or another appropriate AI provider for future AXIS capabilities

Do not introduce future infrastructure before it is actually required.

---

## 7. Architecture principles

Keep responsibilities separated:

- UI / presentation
- Domain / business logic
- Data / repositories
- Services
- Shared components

The domain must not depend directly on the concrete persistence technology.

Use repository abstractions where appropriate so local persistence can evolve later without rewriting business logic.

AXIS logic must be separated from UI components.

Prefer reusable components and clear boundaries.

Avoid giant components, duplicated logic and unnecessary abstractions.

---

## 8. Local-first and data

Core v0.1 is local-first.

The application must work without an account and without a backend.

IndexedDB is the current persistence layer.

Data models should use stable IDs, consistent dates and structures that can reasonably be migrated to a future relational/cloud database.

Do not delete historical workout data simply for convenience.

Do not send personal or training data to external services unless the feature explicitly requires it and the behavior has been approved.

---

## 9. Design before implementation

**Design must be completed and explicitly approved before production implementation begins.**

Claude Design is the preferred tool for the generative/visual design phase. Claude Code must implement the approved visual language rather than inventing a different one.

Current project phase: **VISUAL PROTOTYPE**.

During this phase, optimize for:

- visual quality
- mobile-first composition
- reusable visual components
- realistic mock data
- prototype navigation
- visual states
- transitions and micro-interactions
- responsive behavior
- accessibility and touch targets

Do not activate production complexity merely to make the prototype functional. Real database persistence, real AXIS reasoning, external AI, backend/API integration and production analytics are not required for visual approval.

Design process:

1. Phase 0 — Preparation: extract required content from the Master Document and reconcile approved decisions.
2. Phase 1 — Design System: colors, typography, spacing, components, iconography, motion and visual rules.
3. Phase 2 — Screens: Home → Training → Active Exercise → Workout Summary → Recovery → History.
4. Phase 3 — Navigation: four primary tabs plus internal flows.
5. Phase 4 — Final component and animation inventory.
6. Phase 5 — UX Review: complete end-to-end journey and visual QA before production implementation.

If a new component is genuinely required, propose it and add it to the design system instead of creating an isolated one-off.

---

## 10. Design system baseline

The approved visual direction is:

**editorial + premium + technological + clean + informative**.

Axtlhetics should feel like a **calm, confident personal coach**, not a generic SaaS dashboard or a fitness analytics panel.

### Core visual tokens

- Primary blue: `#0A61F8`
- Primary text: `#111111`
- Secondary text: `#6B6B6B`
- Surface: `#F7F7F7`
- Font: Inter
- Base spacing unit: 4 px
- Primary radius: 8 px
- Full radius: 999 px only for pills/chips/badges/circular controls
- Primary button: 52 px
- Minimum touch target: 44 × 44 px
- Motion: generally 200–300 ms

The primary blue `#0A61F8` replaces the former `#4F7CFF`. Do not reintroduce `#4F7CFF`.

The background should read as a **very light, slightly softened neutral canvas** rather than a stark visual white. The exact background token may be refined during visual QA without changing the approved primary blue, typography or hierarchy.

### Visual principles

- One clear protagonist per screen.
- One obvious primary action per screen.
- Typography and whitespace create hierarchy before additional containers do.
- Cards exist when they provide meaningful grouping; **not every section should be a card**.
- Use the primary blue deliberately, not as decoration everywhere.
- Blue communicates action, active state, important progress or AXIS emphasis.
- Keep most of the interface neutral and calm.
- Avoid generic SaaS/dashboard patterns, excessive gradients, excessive shadows, glassmorphism, decorative metrics and visual noise.
- Preserve generous whitespace.
- The interface should feel complete without feeling crowded.

### Semantic colors

Green, orange and red are allowed **only as semantic state colors** (for example healthy/moderate/low, success/warning/error). They are not decorative brand colors.

Their exact token values remain **PENDIENTE** and must not be invented as a product decision. During the visual prototype, use the approved semantic direction consistently and keep the values easy to replace.

---

## 11. AXIS

AXIS is the intelligent guidance system at the center of Axtlhetics. It is **not a generic chatbot**.

Conceptual flow:

`User/training data → Context Builder → AXIS analysis → Recommendation → Explanation`

AXIS must explain why a recommendation is being made.

AXIS may recommend not changing anything when there is no clear reason to act.

AXIS must never invent data or present uncertain information as certain.

In Core v0.1, AXIS may begin with local rules and deterministic logic.

The AXIS architecture must remain provider-agnostic and separated from the UI so that an external AI model can be introduced later without rewriting the application.

AXIS must not replace professional medical judgment.

### AXIS visual identity

- Brand mark: the abstract **X** symbol used by AXIS.
- In the main app header, use the small abstract X symbol immediately before the word **AXIS**.
- Inside AXIS cards/blocks, the symbol becomes secondary and more discreet.
- AXIS should guide decisions through concise, authoritative copy and a clear reason.
- AXIS should feel integrated into Axtlhetics, not like a separate chatbot product.
- Do not use decorative orbits, orbital rings, floating chatbot mascots, giant assistant avatars or oversized robot/chat imagery.
- Do not make AXIS visually dominate every screen. Its role is to clarify the next decision.

---

## 12. Core visual patterns

### Circular Metric

Use a reusable `Circular Metric` pattern for circular 0–100 metrics such as:

- Recovery Score
- Training Load / Carga
- future compatible metrics approved later

The pattern uses:

- thin circular ring
- subtle neutral track
- large central value
- `/100` treatment where applicable
- restrained semantic state color
- optional short label/context

Do not create separate one-off ring components for Recovery and Load when their visual structure is the same.

### Cards

Cards are a grouping tool, not the default container for every section.

Use cards when they:

- group related information;
- separate an actionable module from surrounding content;
- provide a meaningful interaction boundary;
- improve scanning on a dense mobile screen.

Prefer direct canvas content when typography, whitespace and dividers already provide sufficient hierarchy.

### Hydration

Use **8 interactive glasses**, not a main millilitre counter.

States:

- empty
- filled
- complete

Interaction in the prototype:

- tap empty → fill
- tap filled → empty
- transition ≈ 200 ms
- summary: `n / 8 vasos`

The hydration component must remain visually simple and clearly interactive.

---

## 13. Development workflow

Never build the whole application in one task.

Develop one feature or clearly bounded technical block at a time.

Use this cycle for significant work:

1. PLAN — inspect the relevant project and understand the goal.
2. PROPOSAL — explain architecture, files, dependencies and risks.
3. APPROVAL — obtain confirmation for important decisions.
4. IMPLEMENTATION — make the smallest clean change that solves the task.
5. TEST — run the relevant tests, checks and production build when appropriate.
6. REVIEW — critically inspect the implementation for bugs, regressions, unnecessary complexity and architectural problems.
7. REPORT — explain what changed, what was tested and what remains.

Do not move to the next feature until the current feature is genuinely complete.

---

## 14. First Claude Code session

The first Claude Code session should be an audit, not a mass implementation.

Inspect the repository, configuration, dependencies, architecture, existing components, navigation, persistence and current state.

Compare the real repository against the Master Document, the approved Design System and this CLAUDE.md.

Identify what exists, what is incomplete, what is provisional, risks and technical debt.

Produce an audit and implementation plan before making large changes.

---

## 15. Feature completion criteria

A feature is not complete merely because the page renders.

A complete feature should include, where applicable:

- Correct UI
- Separated business logic
- Persistence
- Loading state
- Empty state
- Error state
- Correct navigation
- Appropriate tests
- Successful build
- Review against the Master Document

During the **visual prototype phase**, mock data and mock interactions are acceptable and preferred when they make visual iteration faster. Production persistence and real AI logic are not completion requirements for visual approval.

Do not leave known critical issues behind and call the feature finished.

---

## 16. Testing and review

Test business logic especially carefully:

- calculations
- Recovery Score
- statistics
- persistence
- AXIS rules

After implementation, review the code independently and actively look for:

- bugs
- regressions
- race conditions or state problems
- unnecessary complexity
- duplicated logic
- accessibility problems
- performance problems
- violations of the approved architecture

Fix problems before moving forward.

---

## 17. Git and change control

Use Git for meaningful checkpoints.

Before risky or large changes, create a recoverable commit/checkpoint.

Use clear commit messages.

Review diffs before considering important work complete.

Keep changes focused: avoid mixing unrelated features or refactors in the same change.

---

## 18. When Claude must ask

Ask before changing:

- product requirements
- core navigation
- visual decisions already approved
- data model in an incompatible way
- persistence strategy
- privacy/security behavior
- fundamental AXIS behavior
- major architecture
- scope of Core v0.1

For small technical decisions that are reversible and clearly consistent with the project, choose a sensible solution and explain it.

---

## 19. Things Claude must avoid

- Overengineering.
- Unnecessary dependencies.
- Features that were not requested.
- Arbitrary UI redesigns after the visual language has been approved.
- Large refactors without a clear reason.
- Giant files/components.
- Duplicated code.
- Invented requirements.
- Premature cloud infrastructure.
- Premature AI integration.
- Sacrificing quality for speed.
- Treating future roadmap features as current requirements.
- Turning every section into a card.
- Using the primary blue everywhere just because it is available.
- Reintroducing Progreso or Perfil into Core v0.1 without explicit approval.

---

## 20. Product principle

**Axtlhetics is the operating system for your body.**

The objective is not to maximize the number of features or metrics.

The objective is to help the user understand **what to do today to move closer to their physical goals**, with as little unnecessary decision-making as possible.

The visual language must communicate:

- calm confidence
- clarity
- intelligence
- action
- trust
- evolution

When choosing between two valid implementations, prefer the simpler one that preserves a clean path for future evolution.

If something is unclear, ask rather than guess.
