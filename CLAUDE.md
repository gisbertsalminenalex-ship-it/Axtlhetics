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

Lo que sí existe (D-007) es una **pantalla interna de perfil**, accesible desde el icono de usuario de Inicio: nombre, edad, medidas, objetivos, experiencia, días disponibles, duración habitual y deportes del calendario. Es el mismo formulario del onboarding en modo edición, no una quinta pestaña. Los deportes se registran con un único modelo (días + intensidad, hora opcional) tanto en el onboarding como en Perfil.

### Cómo se decide el entrenamiento del día (D-001)

Axtlhetics **no se basa principalmente en que el usuario elija manualmente una rutina**. AXIS es el sistema de decisión que determina qué entrenamiento tiene sentido hacer ese día.

Esto no añade pantallas ni tabs: cambia quién decide el contenido de la sesión dentro de las pantallas ya aprobadas.

No construir un editor de rutinas ni un gestor de rutinas: la gestión avanzada de rutinas sigue fuera de Core v0.1.

El detalle completo de entradas, salidas y restricciones está en `D-001`. Los puntos derivados (`P-001` a `P-004`, `P-009`) quedaron cerrados por `D-008` y `D-010`: el usuario negocia la sesión con AXIS y confirma cada cambio; la «rutina utilizada» es la instantánea de la propuesta guardada en cada sesión; objetivos y duración salen del perfil; y el día de descanso tiene su propio estado en Inicio y Entrenamiento.

No implementar funciones futuras simplemente porque sean técnicamente posibles: cuentas, social/community, wearables, sincronización, nube, IA externa, gamificación, perfil completo, progreso independiente, nutrición avanzada u otras capacidades de roadmap.

---

## 4. Fuente de verdad y decisiones

Use the following priority:

1. `docs/product/AXTHLETICS_DECISIONS_V1.md` — decisiones de producto explícitamente aprobadas por Alex. Es la fuente de mayor prioridad y supera a cualquier otra si hay conflicto.
2. Axtlhetics Master Document / Documento Maestro para requisitos de producto y alcance.
3. Este `CLAUDE.md` para instrucciones operativas y reglas consolidadas del proyecto.
4. `DESIGN_SYSTEM_AXTHLETICS.md` para reglas visuales.
5. Documentación técnica y código existente para implementación.

El registro de decisiones se lee **antes** de tomar cualquier decisión de producto, arquitectura o diseño. Una decisión solo está cerrada cuando está escrita ahí: un acuerdo en una conversación no cuenta hasta que se registra.

La referencia visual definitiva es:

`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

La referencia visual controla **composición, jerarquía, densidad, proporciones y lenguaje visual**, pero no puede introducir por sí sola nuevas funcionalidades o pantallas fuera del alcance aprobado.

### Jerarquía visual (D-004)

Para decisiones visuales, el orden es:

1. decisiones de producto aprobadas
2. Design System
3. código

El Design System es la fuente de verdad visual. El código **no debe introducir valores visuales arbitrarios** que lo contradigan, y un valor no queda aprobado por el hecho de estar ya escrito en el código.

Si el Design System y la referencia visual aprobada entran en conflicto, primero se actualiza el Design System para reflejar la referencia visual y después el código sigue al Design System. Nunca al revés.

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
- IndexedDB for local persistence in Core v0.1 (schema v7, with migrations in `lib/data/indexeddb/db.ts` and `lib/data/migrations.ts`)
- Netlify for web hosting/deployment — static export, deployed as an installable PWA with offline support
- Netlify Functions for the single server-side piece: `netlify/functions/axis-ai.mts`, the AXIS language layer
- Groq (OpenAI-compatible REST via `fetch`, no SDK, model `openai/gpt-oss-120b` in `AXIS_AI_MODEL`, free plan) as the AXIS language provider behind that function
- GitHub for version control
- Tests: `node:test` with native type stripping (`pnpm test`), no test framework dependency

Future possibilities, not current requirements:

- Supabase for a future cloud backend if needed
- Any other AI provider, if the language layer ever changes: the domain must not know which provider is behind the function

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

IndexedDB is the current persistence layer, at schema **v7**. Stores: `profile`, `activities`, `recovery`, `sessions`, `axisMemory`, `activeWorkout`. Raising the version means adding a migration block that never loses data; migrations are pure functions and are tested without a browser.

What persists locally today: the profile and calendar activities, daily recovery inputs, completed and abandoned workout sessions, the workout in progress (a single row, resumed on the next start) and the AXIS memory, one record per day (`AxisDayMemory`): the confirmed session choice, the activities cancelled today, the loads the user reported, the conversation thread with the state of its action proposals, and where the conversation was (last intent, change mode, last change request). Records of previous days are kept; nothing reads them yet.

Components never touch IndexedDB. The flow is `UI → lib/state/store.tsx → repositories (lib/data) → IndexedDB`, with an in-memory fallback when IndexedDB is unavailable.

Data models should use stable IDs, consistent dates and structures that can reasonably be migrated to a future relational/cloud database.

Do not delete historical workout data simply for convenience.

Do not send personal or training data to external services unless the feature explicitly requires it and the behavior has been approved. The only approved exception is the AXIS language layer (§11): the browser sends a trimmed briefing, without the user's name, to the same-origin Netlify function, which forwards it to the language provider (Groq). Nothing is stored server-side.

---

## 9. Design before implementation

**Design must be completed and explicitly approved before production implementation begins.**

Claude Design is the preferred tool for the generative/visual design phase. Claude Code must implement the approved visual language rather than inventing a different one.

Current project phase: **FUNCTIONAL CORE v0.1**. The visual prototype was reviewed and approved (D-006) and the application is now real and deployed:

- PWA on Netlify, installable and usable offline.
- Local persistence in IndexedDB v7 through repositories.
- Recovery Score (D-002, D-009) and Training Load (D-008) computed from real data.
- AXIS deterministic engine deciding the day, with explained recommendations.
- AXIS conversation: negotiation of the day's session, typed action proposals that the user confirms, conversation persisted locally per day.
- AXIS memory persisted per day: confirmed choice, cancelled activities, reported loads, thread and its state (D-011).
- Groq as the AXIS language layer through a Netlify Function, with deterministic fallback.

The rules of this section still apply to any **new** screen or component: the approved visual language is implemented, not reinvented, and the design phases below describe how it was reached. Mock data is no longer the default; real data through the store is.

Design process (completed for Core v0.1):

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
- Soft secondary blue: `#DCE8FF`
- Primary text: `#111111`
- Secondary text: `#6B6B6B`
- Surface: `#F7F7F7`
- Border: `#D6D6D6`
- Progress track: `#EAEAEA`
- Muted non-text: `#9A9A9A`
- Font: Inter
- Base spacing unit: 4 px
- Surface radius (large): 32 px — the protagonist surface of a screen
- Surface radius: 24 px — surfaces and controls, including buttons and fields
- Full radius: 999 px only for pills/chips/badges/circular controls
- Primary button: 52 px
- Minimum touch target: 44 × 44 px
- Motion: generally 200–300 ms

The primary blue `#0A61F8` replaces the former `#4F7CFF`. Do not reintroduce `#4F7CFF`.

### Neutrals and radii (D-005)

Neutrals must be **centralized as tokens** and must use the approved values above. Do not scatter arbitrary greys (`#71757e`, `#6f737c` and similar) across components.

Radii are semantic and come from the design system, not from arbitrary numbers written into a component. The approved interface uses 32 px for the protagonist surface, 24 px for surfaces and controls, and 999 px for pills.

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

Approved by D-008: success `#1ba672`, warning `#f2a516`, error `#d93b3b`. Recovery Score bands are 0–49 red, 50–74 orange, 75–100 green. No component writes a state color directly: they all go through the tokens and `components/recovery-band.ts`.

---

## 11. AXIS

AXIS is the intelligent guidance system at the center of Axtlhetics. It is **not a generic chatbot**.

Conceptual flow:

`User/training data → Context Builder → AXIS analysis → Recommendation → Explanation`

AXIS must explain why a recommendation is being made.

AXIS may recommend not changing anything when there is no clear reason to act.

AXIS must never invent data or present uncertain information as certain.

In Core v0.1, AXIS **is** local, deterministic and rule-based. No external generative AI is used to make these decisions (D-001).

The AXIS architecture must remain provider-agnostic and separated from the UI so that an external AI model can be introduced later without rewriting the application.

### Current implementation state

- **Engine** (`lib/domain/axis/engine.ts`, `rules.ts`, `facts.ts`, `session-builder.ts`): deterministic. It builds one `AxisContext` per day (`context.ts`) and produces a decision with a primary proposal, alternatives and explained factors.
- **Conversation** (`lib/domain/axis/conversation/`): intents, negotiation of the day's session and follow-ups. The rule is *AXIS cedes by evidence, not by insistence*. It never opens with a compliment; the first sentence is the verdict.
- **Actions** (`lib/domain/axis/actions.ts`): the conversation can end in a typed action proposal. Actions store the chosen option (type + focus), never a proposal id, and are resolved against the **current** decision when confirmed. `validateAction` answers «can it run?» (day, target exists in the current decision, catalog, load ≤ 5 kg, no effect against the selected proposal) — never «should it be recommended?».
- **Action engine** (`lib/domain/axis/action-engine.ts`, D-012): the lifecycle, and nothing else. `proposeAction` (answer → action, only targets the engine generated today) → `checkAction` (validateAction + applied/cancelled/superseded/malformed) → `executeAction` (apply on memory, `save` through a minimal `AxisMemoryPort`, return the saved memory). Nothing is marked applied before the save succeeds; a failed save leaves the action in a retryable error with no override. Applying one action supersedes the other pending ones of the day. The store only builds the `AxisDay` (context, decision, selected), hands the latest memory and the repository, and commits what comes back. It is not a second brain: it imports neither rules, facts nor the session builder.
- **Language layer** (`lib/domain/axis/conversation/ai.ts`, `netlify/functions/axis-ai.mts`): **the deterministic engine decides, the model writes.** The model (Groq, `openai/gpt-oss-120b`) receives the deterministic answer plus a trimmed briefing and may only rewrite the text; structured fields come out of the domain untouched. If the model suggests a different target it is discarded (`modelDisagreed`). It is only called for questions where natural wording adds something; data queries never reach it. Without a key, on error or on timeout the deterministic answer is used and the UI says so. The API key lives only in the function (`GROQ_API_KEY`, never `NEXT_PUBLIC_*`; `GROQ_MODEL` optionally overrides the model); structural tests fail if the key or an SDK enters the client or if the domain learns which provider is behind the function. The function is protected twice: Netlify's native rate limit (`config.rateLimit`, per IP and domain, values in `RATE_LIMIT`) and an origin check (`checkRequestOrigin`: `Origin`/`Referer` must be the site itself, `Sec-Fetch-Site` must not say cross-site) that answers `403 FORBIDDEN` before revealing anything. The origin check is a filter, not authentication; any rejection ends in the deterministic answer.
- **Personality** (`lib/domain/axis/personality.ts`): who AXIS is and how it speaks, as data. The system prompt is generated from it; it contains no product rules.
- **Safety** (`lib/domain/axis/safety.ts`): `checkModelText` is the exit gate for model text — empty, too long, emojis, exclamations, medical language, complacent openers, or a text that contradicts the domain verdict or the approved proposal is rejected and the deterministic answer is shown (`usedFallback`, `rejectedReason`). `reconcileTarget` stays the authority on actions; a model that proposes an unapproved target is recorded as `modelDisagreed` on the message.
- **Knowledge** (`lib/domain/axis/knowledge/`): data only — sport vocabulary and what reported activities load, focus vocabulary, muscle-group entry point. The tables themselves live once, in `workouts/types.ts`; knowledge re-exports them. A test fails if a second definition appears.
- **Memory** (`lib/domain/axis/memory.ts`, D-011): `AxisDayMemory` is the single per-day record — override, cancelled activities, reported loads, messages, action statuses and thread state. Pure operations (`rememberAnswer`, `openChangeThread`, `applyOverride`, `clearOverride`…) are the only way the store changes it; one effect persists it. «Cambiar entrenamiento» appends to the thread, never replaces it. Change mode ends on confirm, cancel or «Volver». Reported loads are evidence for the conversation only; the engine never reads them.

AXIS must not replace professional medical judgment.

### AXIS as the training decision engine (D-001)

AXIS decides what training makes sense today. The user does not primarily pick a routine by hand.

Inputs AXIS must be able to consider, progressively: training history, recent sessions, Recovery Score, sleep, hydration, energy, muscular fatigue, stress/mood, user goals, muscle groups worked recently, time since the last session, session availability/duration, and exercise progression.

Outputs AXIS must be able to produce: what to train, what type of session, a lighter or harder session, a modified session, or a recommendation to recover and not train at all.

Every recommendation carries a **short explanation of the reason**. Reference for tone and length:

> «Hoy evitaremos cargar más las piernas porque tu fatiga muscular es elevada y ayer hiciste una sesión intensa.»

The derived points `P-001` to `P-004` and `P-009` are closed (D-008, D-010). Open points are listed only in the decisions register; do not resolve any of them independently.

### Recovery Score (D-002)

The Recovery Score is an **internal orientation index from 0 to 100**. It must never be presented as a medical measurement or a diagnosis.

Approved weights: sleep 35 %, energy 20 %, muscular fatigue 20 %, stress 15 %, hydration 10 %.

These weights must live in a **single centralized place in the code** so they can be changed without rewriting the logic. The score is computed from the day's real inputs (`lib/domain/recovery/score.ts`). If there is not enough data, do not invent a score — use the "datos insuficientes" state. AXIS must be able to explain the result briefly.

Training Load is implemented alongside it (`lib/domain/workouts/load.ts`, D-008): a 0–100 index over the last 7 days, shown as «—» when there is no completed session in the window.

Input scales, normalization and the "enough data" policy are closed by D-009. They live in `lib/domain/recovery/scales.ts` and `lib/domain/recovery/weights.ts` — change them there, nowhere else.

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

Interaction (implemented in Recuperación, persisted in the day's recovery inputs):

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

## 14. Starting a session

The first Claude Code session was an audit; that step is done. Every later session starts the same way in miniature: read the decisions register, check `git log` for what changed last, and inspect the store and domain that the task touches before proposing anything.

Do not re-audit the whole repository for a bounded task. Do not start implementing a product change without checking it against the register first.

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

The visual prototype phase is over: a feature that touches user data is not complete until it reads and writes through the store and the repositories, survives a reload, and its domain logic is tested with `pnpm test`. Before calling it done: `pnpm test`, `pnpm typecheck`, `pnpm build`.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
