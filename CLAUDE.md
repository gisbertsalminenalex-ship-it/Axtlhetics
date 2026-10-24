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
2. **Entrenamiento** — incluye la sección «Tu progreso»: objetivos medibles, mejor serie de cada ejercicio y series por semana (D-036, movida aquí en D-040)
3. **Recuperación**
4. **Historial**

**Workout Summary no es una pestaña principal.** Es una pantalla o flujo interno al que se llega después de completar un entrenamiento.

**No incluir Progreso ni Perfil como tabs.** Progreso vive en Entrenamiento (D-040); el perfil completo pertenece a fases futuras salvo aprobación explícita.

Lo que sí existe (D-007) es una **pantalla interna de perfil**, accesible desde el icono de usuario de Inicio: nombre, edad, medidas, objetivos, experiencia, días disponibles, duración habitual y deportes del calendario. Es el mismo formulario del onboarding en modo edición, no una quinta pestaña. Los deportes se registran con un único modelo (días + intensidad, hora opcional) tanto en el onboarding como en Perfil. En Perfil, una actividad puede ser además de **un día concreto** en vez de cada semana (D-018): es el caso de un partido, que cambia de día de una semana a otra o no existe.

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
- IndexedDB for local persistence in Core v0.1 (schema v10, with migrations in `lib/data/indexeddb/db.ts` and `lib/data/migrations.ts`)
- Vercel for web hosting/deployment (D-014) — the page is prerendered as static HTML and served as an installable PWA with offline support; no static export (`output: 'export'`), because the route below needs a server
- A single Next.js route handler as the only server-side piece: `app/api/axis-ai/route.ts` (Node.js runtime, `maxDuration = 10`), the AXIS language layer, deployed by Vercel as a function
- AXIS language providers behind that route (D-016), both OpenAI-compatible REST via `fetch`, no SDK, free plans: **Cloudflare Workers AI** as primary (`@cf/google/gemma-4-26b-a4b-it`, `lib/ai/providers/cloudflare.ts`) and **Groq** as fallback (`openai/gpt-oss-120b`, `lib/ai/providers/groq.ts`), chained in `lib/ai/provider-chain.ts`
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

IndexedDB is the current persistence layer, at schema **v10**. Stores: `profile`, `activities`, `recovery`, `sessions`, `axisMemory`, `activeWorkout`, `assessments` (D-021 evolution tests, kept apart from `sessions` on purpose), `scans` (D-023 body scans: measurements, self-report and result; the only place where their photo thumbnails live), `measurements` (D-060 weight and tape measurements, one record per day). Raising the version means adding a migration block that never loses data; migrations are pure functions and are tested without a browser. The v8, v9 and v10 migrations are forward-only. Backups are schema 4 (they carry the evolution tests, the scan results — **never the scan photos**, P-016 — and the measurements) and schema-1/2/3 files still import.

What persists locally today: the profile and calendar activities, daily recovery inputs, completed and abandoned workout sessions, the workout in progress (a single row, resumed on the next start) and the AXIS memory, one record per day (`AxisDayMemory`): the confirmed session choice, the activities cancelled today, the loads the user reported, the conversation thread with the state of its action proposals, and where the conversation was (last intent, change mode, last change request), plus the D-022 reorganization of the day (minutes the user said they have, whether today's training moved to tomorrow, and what the last applied action changed, for undo). Records of previous days are kept; the only thing read from yesterday is its `movedTo` (D-022 amendment to D-011).

Components never touch IndexedDB. The flow is `UI → lib/state/store.tsx → repositories (lib/data) → IndexedDB`, with an in-memory fallback when IndexedDB is unavailable.

Data models should use stable IDs, consistent dates and structures that can reasonably be migrated to a future relational/cloud database.

Do not delete historical workout data simply for convenience.

The user can **export everything to a JSON file and restore it** (D-015, `lib/domain/backup/`). It is the only mitigation against losing the history when the browser evicts the storage, and it introduces no server: the download is the browser's and the read is local. Importing **replaces**, never merges; it is atomic across stores, rejects an empty or newer-schema file, validates record by record and reports what it discarded. It is reachable from Perfil and from the first onboarding step, because an empty device is exactly when it is needed.

Do not send personal or training data to external services unless the feature explicitly requires it and the behavior has been approved. The only approved exception is the AXIS language layer (§11): the browser sends a trimmed briefing, without the user's name, to the same-origin route `/api/axis-ai`, which forwards it to the language providers (D-016): Cloudflare Workers AI and, only if it fails, Groq. Nothing is stored server-side; the route logs one line of metadata per provider attempt (provider, model, HTTP status, outcome, `finish_reason`, duration, token/neuron usage) and never the content. The second approved exception is training reminders (D-044): when the user turns them on, `/api/push` stores in Upstash Redis only the Push API subscription, the training weekdays, the reminder hour and the time zone; pushes are sent without payload (VAPID, `lib/push/`), the text is composed by the service worker on the device, and an hourly GitHub Actions workflow calls `/api/push/cron` with `CRON_SECRET`. The third is the health note (D-064): what the user writes about their health is sent alone (no name, no briefing) through the same `/api/axis-ai` route for the model to classify into care zones and PAR-Q signals; nothing is stored server-side, and offline it is read on the device.

---

## 9. Design before implementation

**Design must be completed and explicitly approved before production implementation begins.**

Claude Design is the preferred tool for the generative/visual design phase. Claude Code must implement the approved visual language rather than inventing a different one.

Current project phase: **FUNCTIONAL CORE v0.1**. The visual prototype was reviewed and approved (D-006) and the application is now real and deployed:

- PWA on Vercel, installable and usable offline.
- Local persistence in IndexedDB v10 through repositories.
- Body scanner (D-023): guided on-device scan next to the evolution test; MediaPipe pose model served from the app (`scripts/prepare-mediapipe.mjs`); photos never leave the device and never reach the language layer; since D-041 the engine uses the scan to prioritise zones, add correctives and ask for unilateral work, always explained (P-017 revoked).
- Recovery Score (D-002, D-009) and Training Load (D-008) computed from real data.
- AXIS deterministic engine deciding the day, with explained recommendations.
- AXIS conversation: negotiation of the day's session, typed action proposals that the user confirms, conversation persisted locally per day.
- AXIS memory persisted per day: confirmed choice, cancelled activities, reported loads, thread and its state (D-011).
- AXIS language layer through the `/api/axis-ai` route handler: Cloudflare Workers AI → Groq → deterministic fallback (D-016).

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
- **Conversation** (`lib/domain/axis/conversation/`): intents, negotiation of the day's session and follow-ups. The rule (D-030) is *the user decides, AXIS warns*: a requested change is accepted with its confirm button, and when the data advise against it AXIS says so first in one sentence. The only refusal left is risk: with recovery below 50 it does not raise the load (harder, longer, training on a recovery day or again today), offers mobility, and keeps that verdict under insistence. The engine prepares an alternative for every request (lighter, harder, each strength focus, mobility, recovery) so AXIS can always cede with a real session. Answers are short for data and 4–6 sentences (max 7) for explanations and changes (`lengthLimitsFor`, `LONG_ANSWER_INTENTS`). It never opens with a compliment; the first sentence is the verdict.
- **Actions** (`lib/domain/axis/actions.ts`): the conversation can end in a typed action proposal. Four types: `change_training` and the D-022 reorganizations `set_available_minutes`, `move_to_tomorrow` (today recovery, tomorrow available, never a copied session; since D-030 a second deferral or a demanding match tomorrow is warned about, not blocked) and `add_dated_activity` (tomorrow's match, confirmed). The last applied action of the day can be undone from its card until training starts (`undoAction`). Actions store the chosen option (type + focus), never a proposal id, and are resolved against the **current** decision when confirmed. `validateAction` answers «can it run?» (day, target exists in the current decision, catalog, load ≤ 5 kg, no effect against the selected proposal) — never «should it be recommended?».
- **Action engine** (`lib/domain/axis/action-engine.ts`, D-012): the lifecycle, and nothing else. `proposeAction` (answer → action, only targets the engine generated today) → `checkAction` (validateAction + applied/cancelled/superseded/malformed) → `executeAction` (apply on memory, `save` through a minimal `AxisMemoryPort`, return the saved memory). Nothing is marked applied before the save succeeds; a failed save leaves the action in a retryable error with no override. Applying one action supersedes the other pending ones of the day. The store only builds the `AxisDay` (context, decision, selected), hands the latest memory and the repository, and commits what comes back. It is not a second brain: it imports neither rules, facts nor the session builder.
- **Language layer** (`lib/domain/axis/conversation/ai.ts`, `app/api/axis-ai/route.ts`): **the deterministic engine decides, the model writes.** The model receives the deterministic answer plus a trimmed briefing and may only rewrite the text; structured fields come out of the domain untouched. If the model suggests a different target it is discarded (`modelDisagreed`). It is only called for the intents in `AI_WORTHY_INTENTS`: explanations and, since D-027, data answers (recovery, week, load, last session) — except when a data answer is that there is no data, which stays deterministic. Medical, out-of-scope, evolution test, body scan and decision answers never reach it. Since D-028 (`reinterpret.ts`), a message the deterministic engine still does not understand after spelling correction is sent alone, without briefing, for the model to **rewrite** as a clear sentence; the rewrite goes back to the deterministic engine, which answers and says how it understood it. A rewrite with a number the user did not write is discarded, and nothing is learned from it (cancelled activities, reported loads). Since D-042 (`social.ts`), small talk (greetings, «¿qué tal?», thanks, goodbyes, laughs, «vale») is its own intent `social`, recognised before anything else (also in change mode, except acknowledgements there); the model **writes it freely** with `chatSystemPrompt`, temperature 0.8 and the last 8 messages of the day as history (name replaced by `{nombre}`, substituted on the device), never proposes changes, and still passes `checkModelText`; without a model, varied deterministic replies. A message still not understood after D-028 reinterpretation is answered as small talk instead of «no he entendido». Behind the route, `lib/ai/provider-chain.ts` tries Cloudflare Workers AI (Gemma, primary) and then Groq (`gpt-oss-120b`, fallback) within a 7 s deadline (Cloudflare ≤ 4 s); each provider in `lib/ai/providers/` only builds its request and reads its reply. Any provider failure — 429, 5xx, auth, timeout, network, empty text, `finish_reason` other than `stop`, non-JSON — moves to the next; if both fail, the deterministic answer is used and the UI says so. Invalid requests, other origins, safety rejections and a closed browser request never trigger a second call. The browser never learns which provider answered. Credentials live only in the route (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `GROQ_API_KEY`, never `NEXT_PUBLIC_*`; `CF_MODEL` and `GROQ_MODEL` optionally override the models); structural tests fail if a credential or an SDK enters the client or if the domain learns which providers are behind the route. The route is protected twice: a rate limit per IP configured as a Vercel Firewall rule on `/api/axis-ai` (not in code; reference values in `RATE_LIMIT`) and an origin check (`checkRequestOrigin`: `Origin`/`Referer` must be the site itself, `Sec-Fetch-Site` must not say cross-site) that answers `403 FORBIDDEN` before revealing anything. The origin check is a filter, not authentication; any rejection ends in the deterministic answer.
- **Spelling** (`lib/domain/axis/conversation/spelling.ts`, `understand.ts`, D-026): the user's message is corrected once on entry, before any detector, towards the vocabulary harvested from the detectors' own term lists (chat shorthands, same sound, one-letter edits on long words, single candidate only). A term added to any detector list becomes typo-tolerant automatically. The model still receives the original text.
- **Personality** (`lib/domain/axis/personality.ts`): who AXIS is and how it speaks, as data. The system prompt is generated from it; it contains no product rules.
- **Safety** (`lib/domain/axis/safety.ts`): `checkModelText` is the exit gate for model text — empty, too long, emojis, exclamations, medical language, complacent openers, a text that contradicts the domain verdict or the approved proposal, one with a number not backed by the domain answer or the briefing the model received (`invented_number`, D-016), or one that asserts something about the user — history, recovery, discomfort, preferences — that the domain answer does not (`unsupported_claim`, D-016; absence of data is never stated as a fact), or, in a data answer, one that drops a number the domain gave (`omitted_number`, D-027; the volume's thousands dot «12.450» reads as thousands) is rejected and the deterministic answer is shown (`usedFallback`, `rejectedReason`). `reconcileTarget` stays the authority on actions; a model that proposes an unapproved target is recorded as `modelDisagreed` on the message.
- **Knowledge** (`lib/domain/axis/knowledge/`): data only — sport vocabulary and what reported activities load, focus vocabulary, muscle-group entry point. The tables themselves live once, in `workouts/types.ts`; knowledge re-exports them. A test fails if a second definition appears.
- **Memory** (`lib/domain/axis/memory.ts`, D-011): `AxisDayMemory` is the single per-day record — override, cancelled activities, reported loads, messages, action statuses and thread state. Pure operations (`rememberAnswer`, `openChangeThread`, `applyOverride`, `clearOverride`…) are the only way the store changes it; one effect persists it. «Cambiar entrenamiento» appends to the thread, never replaces it. Change mode also opens when the user types an unequivocal change request from any state («quiero una sesión más corta», «no quiero hacer piernas»: it must *ask* for something and that something must have a name — shorter, easier, harder, rest, avoid a zone; questions and hypotheticals never qualify). Change mode ends on confirm, cancel or «Volver». Reported loads are evidence for the conversation only; the engine never reads them.

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

Progression (`suggestWorkFor` in `lib/domain/axis/session-builder.ts`, D-019, D-031, D-046) repeats an exercise left unfinished or done in a session rated «al límite», takes the normal step otherwise and doubles it after an easy session. After 4 loaded calendar weeks in a row (≥ 2 completed sessions, none of them deload) the week is a deload week (`lib/domain/workouts/deload.ts`): one set less (never under 2), no progression, explained first in the day's reason, and marked in the session snapshot so two never chain.

Every strength session opens with a warm-up in three parts and has no cool-down (D-032, corrected by D-045), marked with `phase: 'calentamiento'` and `warmupPart`: activation (`ACTIVATION_EXERCISES`: jumping jacks and mountain climbers, 60 s each, catalog entries flagged `warmupOnly` so they are never picked as training), joint mobility (one free step `JOINT_MOBILITY` «Movilidad articular», 120 s or 180 s with the mobility goal, `warmupOnly`; then only what is prescribed to that user: jump-sport balance and scan correctives — amendment of 2026-10-20) and approach sets (`approachSets`: 5 reps of the first 3 non-timed, non-plyometric training exercises, same load if weighted, easier regression if bodyweight); one set, no rest, taken from the available minutes. Approach sets reuse training exercise ids on purpose, so any lookup of an exercise in a session must filter `isMainExercise`. They are not training: `isMainExercise` keeps them out of progression, last performance, records, rotation, skips and the shortened-session check, and the AXIS briefing lists only their names.

With a jump or change-of-direction sport in the calendar (D-033, `practicesJumpSport` in the engine, `JUMP_SPORT_TERMS` in knowledge), every strength warm-up adds single-leg balance and lower-body or full-body sessions at normal intensity open the training with one rotating plyometric exercise that takes a strength slot. The `pliometria` category is reachable only through that block, never through a focus.

Weekly plan (D-034, `lib/domain/workouts/weekly-volume.ts`): sets per muscle group in the calendar week (primary 1, secondary 0.5, training only) against a target by experience (8/12/16). `chooseFocus` adds the week's fulfilment as a weighted penalty after recent work and today's sport; the week answer names the lagging group; Entrenamiento shows it under «Esta semana». A high 7-day Training Load with known recovery makes the day light (`high_training_load`), never rest.

Measurable goals (D-035): `UserProfile.targets` (exercise, number, deadline, start value), progress in `lib/domain/workouts/targets.ts` from the best completed set (training only) against a straight line to the deadline. Managed in Perfil (`components/profile/goal-targets.tsx`, own store actions `addTarget`/`removeTarget`; `saveProfile` keeps them). Open targets get their exercise into sessions of its focus (`priorityExerciseIds`), and the goals answer lists them.

Cross-day memory (D-037, `conversation/preferences.ts`): «no me gustan las zancadas» stores the exercise in `UserProfile.dislikedExercises` (undone by «ya me gustan…»), and an exercise skipped twice in 30 days counts the same (`frequentlySkipped`); the builder leaves them out while enough alternatives remain, but a measurable goal still gets in. Yesterday's reported loads still count in today's negotiation. Medical answers record the body zone in the day memory (`discomforts`) without touching the training.

AXIS speaks first (D-038, `lib/domain/axis/proactive.ts`): one deterministic note at a time, by priority — yesterday's discomfort, Monday's last-week summary, the first day of a deload week, a measurable goal behind, today's recovery not registered. Shown under the AXIS card on Inicio (opens the chat) and in the empty chat; never decides or proposes actions.

Daily reminder (D-039): Perfil generates a recurring daily iCalendar event on the device (`lib/domain/reminders/ics.ts`, floating time, fixed UID) that the phone calendar fires with the app closed. No push notifications, no server.

After the first completed evolution test (D-040, `lib/domain/assessment/targets.ts`), the test summary — and «Tu progreso» in Entrenamiento while there are no goals — proposes one measurable goal per test (best mark +25 %, at least +2 reps / +10 s, 8 weeks), added in one write (`addTargets`). Test marks count towards goals.

The scan trains (D-041, revokes P-017, `lib/domain/scanner/physique.ts`): the latest scan (≤ 90 days) gives priority groups (zones behind the provisional reference ranges `PHYSIQUE_REFERENCE`, detected by `diagnosis.ts` since D-068) whose weekly set target rises 25 %, up to two corrective warm-up exercises for clear posture/mobility findings, and a unilateral exercise when sides clearly differ. It never decides whether to train; it is explained as a `body_scan` factor, in the scan summary («Lo que cambia en tus entrenos») and in the scan answer. Photos still never leave the device.

Equipment (D-046, `lib/domain/workouts/equipment.ts`): `UserProfile.equipment` holds the user's gear (pull-up bar, bands, bench) and a list of free weights (dumbbell or kettlebell, kg, single or pair); bodyweight and a chair are always assumed. A profile without it reads as one 5 kg weight (`LEGACY_EQUIPMENT`, `equipmentOf`), so old profiles behave as before. Asked in the onboarding and edited in Perfil («Tu material», `components/profile/equipment-picker.tsx`). Catalog requirements: `pesa` (any weight), `par_pesas` (a pair), `kettlebell`, `barra_dominadas`, `gomas`, `banco`; home only, no gym gear (a test guards it). 76 exercises; every loaded one has `startLoadKg`. Only weights the user owns are suggested (`loadsFor`): start at the heaviest not above `startLoadKg` × experience factor, then **double progression** — reps up to the cap, then the next weight with the base reps; mastered (harder variant) only at the cap with no heavier weight. The engine, `isSessionValid` and the briefing read the day's gear through `gearToday(context)`: «hoy estoy sin material» proposes the `train_without_equipment` action (day memory `withoutEquipment`, undoable, that day only). Exercise names in the conversation resolve preferring what the user's gear allows (`briefing.equipment`, stripped by `toAiBriefing`: equipment never reaches the language layer). The evolution test stays protocol v1 (5 kg, or a 5-litre water jug).

Goals decide the session (D-047, `lib/domain/workouts/weekly-plan.ts`, replaces the averaged rep factor): every session serves **one** goal, stored as `goal` on `PlannedSession`/`WorkoutSession` (older sessions count by focus: `core_movilidad` → movilidad, `acondicionamiento` → resistencia, others not at all). `weeklyQuota` splits the profile's available days: mobility 1 per week with other goals (half when alone), resistance alone 60 % plus general strength, the rest evenly, remainders rotating by week (`weekIndexOf`). `goalForToday` picks the goal with most sessions pending this calendar week (then the longest unworked); a light day with mobility pending is mobility; resistance is excluded when legs must be avoided or on recovery/rest days. The engine (`decide`) maps the goal to a focus (`focusForGoal`: resistencia → `acondicionamiento`, movilidad → `core_movilidad`, strength goals → `chooseFocus`), explains it in a `goal` factor right after the first rule factor («Esta semana: 2 de fuerza… Hoy toca…», only when the week has more than one goal), and always offers an «Acondicionamiento» alternative. Strength sessions take `GOAL_PARAMS` in the session builder (rep factor, extra sets, difficulty shift, rest bounds, default tempo); the rep cap is 1.6 × that session's base reps and last reps are clamped to it. Conditioning: focus and category `acondicionamiento`, 9 timed bodyweight exercises (30 s work / 30 s rest, rounds by experience, +5 s progression), at most 6 exercises, no approach sets, excluded from weekly sets per muscle (D-034). With the mobility goal, the warm-up's joint mobility lasts 180 s instead of 120 s. The `rendimiento_deportivo` goal opens lower/full-body sessions with a jump like a jump sport. «Cardio», «intervalos», «hiit» name the conditioning focus in the conversation.

Hard days and the week at a glance (D-048). `lib/domain/axis/hard-day.ts`: on a day the rules already made `good_recovery` TRAINING, `isHardDay` also needs recovery ≥ 80, fatigue ≤ 3 if registered, load not high, no deload, no medium/high sport today or tomorrow, no hard session yesterday, not a mobility goal, and fewer hard sessions this week than `HARD_DAYS_PER_WEEK` (principiante 0, intermedio 1, avanzado 2 — the single place future levels plug into). Then the primary gets intensity `alta` (+1 set within the experience cap, +1 difficulty; one more round in intervals), a `hard_day` factor (the reason then shows three details, so the weekly split still fits), a «Día fuerte» headline, and a `MODIFIED_TRAINING` alternative `alternative_normal` («Versión normal», same focus, moderate). Entrenamiento marks the day and offers «Prefiero la versión normal» (`chooseNormalVersion` in the store: `proposeAction` + `confirmAxisAction`, never building actions itself). `lib/domain/axis/week-view.ts` `projectWeek` gives Monday–Sunday: done (completed titles), today (the selected proposal), planned (the same `decide` run per future available day with an assumed recovery of 78 and the earlier days simulated as done; never hard) or rest, plus each day's activities; it never mutates the context. Entrenamiento shows it as one line (`components/week-plan.tsx`): tapping a day shows its detail below, and the weekly split sentence sits under «Esta semana».

Real duration and the day before a match (D-050): `estimatedMinutes` comes from `estimateMinutes` (per exercise: sets × work — seconds, or reps × 4 s, doubled when unilateral — plus rest between sets and 45 s of transition), and `buildSession` adjusts the number of exercises (3–6, 6 for conditioning) until it fits the available minutes, compacting to 2 exercises and then 2 sets when time is very short. The negotiation calls an alternative longer or shorter only with a 5-minute difference (`MEANINGFUL_MINUTES`). `muscleGroupsToAvoid` also includes the groups of a high-intensity activity tomorrow.

Care zones and sex (D-051). `UserProfile.careZones` (rodilla, tobillo, cadera, espalda baja, hombro, codo, muñeca, cuello) and `UserProfile.sex` (hombre, mujer or null), in Perfil (`components/profile/about-you.tsx`); in onboarding the sex step is «¿Hombre o mujer?» and the zones come from the health note (D-064). `lib/domain/workouts/joints.ts` maps every catalog exercise to the joints it loads (a test requires full coverage); `buildSession` drops whatever loads a care zone — main pool, harder variants, the jump block, activation, targeted warm-up and the approach-set regression — and the engine blocks any focus left with fewer than 3 doable exercises (`blockedFocuses`, `chooseFocus(facts, blocked)`, no resistance goal if conditioning is blocked) and adds a `care_zones` factor right after the first rule factor (never a diagnosis). With «mujer», `restFor` shortens strength rests by 15 % (min 45 s, intervals untouched) and `startingLoad` uses 70 % of the upper-body reference. The scanner pre-selects the profile's sex. Neither reaches the language layer.

Reps in reserve (D-052): after the last set of a main, rep-based exercise, the rest panel asks «¿Cuántas te quedaban?» (0 · 1–2 · 3 o más; `reserveQuestionFor`, `setReserve`, stored as `reserve` on the active entry and the `PerformedExercise`). `lastPerformanceOf` returns it and `suggestWorkFor` uses it before the session effort: `ninguna` repeats like «al límite», `tres_mas` doubles the step like «fácil»; unanswered falls back to the session effort.

Subgroups for balance (D-053, `lib/domain/workouts/subgroups.ts`): the seven muscle groups stay; every training exercise with legs or arms also maps to cuádriceps, isquios, gemelos, bíceps or tríceps (test-enforced). `weeklySubgroupSets` counts the calendar week (primary 1, secondary 0.5) and `laggingSubgroups` returns the side of each pair (cuádriceps–isquios, bíceps–tríceps) that is 2+ sets behind; `rotationOrder` puts those exercises first right after the difficulty band, before the usual rotation.

Reps in reserve on every set (D-055, `lib/domain/workouts/strength.ts`): the rest panel asks «¿Cuántas te quedaban?» after every set of a main rep-based exercise, stored as `reserve` on each `CompletedSet` (the last set's is still the exercise's, D-052). The target is 1–2 (3 o más on light/deload days, `targetReserveFor`); `setReserve` adjusts the next set from the set just done (`nextSetAfter`: lighter weight or −2 reps below target, heavier weight or +2 reps above), using the user's loads carried on the entry (`loads`, from `gearToday` at start); `nextSetAdvice` says it.

Estimated strength (D-056): Epley 1RM from kg × (reps + reserve; unanswered counts as 0, > 20 does not estimate). When the last session of an exercise has answered reserves, `suggestWorkFor` uses `lastPerformance.capacity` (the last answered set) through `fromCapacity`: the next load if the start reps fit at the target reserve (two steps fewer at the rep cap), else the same load bounded to −1/+2 steps, else the lightest load that fits; bodyweight takes reps to failure − reserve. Without answers, the D-046 double progression stays. «Tu fuerza» also shows «1RM estimado» (`oneRepMaxHistory`).

Training blocks (D-057, `lib/domain/workouts/blocks.ts`): `currentBlock` derives the block from history (up to 4 consecutive trained weeks + the D-031 deload; a week without training or a deload starts a new one; a new one every 5 weeks regardless). `blockAnchors` returns the first main, non-plyometric, non-core/mobility exercises of the first completed session of that focus in the block (`ANCHORS_BY_FOCUS`: upper 2, lower 2, full 3, others 0); the engine passes them as `anchorExerciseIds` and `withAnchors` puts them first (adapted to the day, only if in the pool). Entrenamiento shows `describeBlock` under «Esta semana».

Initial evaluation (D-058, `lib/domain/profile/screening.ts`): `UserProfile.health` (the PAR-Q+ signals as `flags` + `cleared` + the user's `note`; since D-064 not seven yes/no questions but «No tengo ningún problema de salud» or free text that `lib/domain/profile/health-note.ts` has the model classify — known ids only, `detectHealthNote` keyword fallback — into flags and care zones; onboarding no longer has the care-zone picker, Perfil adds read zones to its own) and `UserProfile.background` (history + status), asked in onboarding and Perfil (`components/profile/screening.tsx`). `needsMedicalClearance` → no hard day, a `health_check` factor and the first proactive note; `isRampUp` (never trained or stopped > 3 months, < 6 completed sessions) → the primary TRAINING is `ligera` with a `ramp_up` factor. Unanswered assumes nothing. Entrenamiento shows «Tu evaluación inicial» (`evaluationSteps`: salud, historia, test, escaneo) until all four are done.

Weekly review (D-059, `lib/domain/axis/weekly-review.ts`): `weeklyReview` (store-computed, `null` without sessions last week) gives sessions vs available days, up to 3 improvements against the last time before that week (estimated 1RM or best set), average sleep and recovery (the store now reads 14 days of recovery) and `next` lines that only announce what the engine does (block/deload, lagging group, missed sessions, short sleep). Entrenamiento shows «La semana pasada» (`components/weekly-review.tsx`); on Monday the D-038 note is `reviewHeadline`.

Weight and measurements (D-060, `lib/domain/body/measurements.ts`): one `BodyMeasurement` per day (weight and tape perimeters: cintura, cadera, pecho, brazo, muslo) in the `measurements` store; the store exposes `measurements`, `saveWeight`, `savePerimeters`. «Tu progreso» ends with «Tu cuerpo» (`components/progress/body-section.tsx`): today's weight, the weekly average chart (`weeklyWeights`, `weeklyWeightChange`) and tape measurements every 28 days (`perimetersDue`, changed by D-067).

Baseline and monthly check (D-067, `lib/domain/body/goal-measures.ts`): `goalMeasures(goals)` — hipertrofia: weight + pecho/brazo/muslo; salud_general: weight + cintura; fuerza/resistencia/rendimiento: the evolution test; movilidad/técnica: nothing. Onboarding adds «Tu punto de partida» after the body step when needed (`components/profile/baseline.tsx`, «Medir ahora» / «Lo mido luego», saved with `saveBaseline` in one record). `monthlyCheckDue` (every `MONTHLY_CHECK_DAYS` = 28, like the test) feeds a D-038 note `monthly_check` (after deload, before goal_behind). «Tu cuerpo» shows «Tu evolución» (`goalEvolution`: first, a month before, latest). `currentWeight` (last logged, else the profile's) is the weight to work with. The weekly review carries the week's average weight.

The scan diagnoses itself (D-068, `lib/domain/scanner/diagnosis.ts`): the scanner no longer asks build or strong/weak zones — only the formula sex (pre-selected from the profile) and the priority, then the photos. `diagnoseScan` (in `ScanSummary.diagnosis`) gives the detected build (Heath-Carter 1–7: ecto from height / ∛weight, endo approximated from body fat %, meso from the shoulder/waist «V»; `BUILD_SCALE`, provisional), strong zones (above `PHYSIQUE_REFERENCE` by `STRONG_ZONE_MARGIN`), weak zones and clear asymmetries. `ScanSummaryView` shows «Complexión detectada», «Puntos fuertes musculares» and «Áreas a priorizar». `ScanSelfReport` is `{ priority, sex? }`; older records still carrying `build`/`strongZones`/`weakZones` validate and are ignored.

The scan as a coach assessment (D-069, `lib/domain/scanner/coach.ts`): photos see shape; tape and strength track muscle. A «Tu músculo, con cinta» step (`components/scanner/tape-step.tsx`; brazo, pecho, muslo, cintura; optional; saved with `savePerimeters` only on scan save) feeds `ScanInput.tape` (`readTape`: latest within 60 days + change vs ≥21 days before; `tapeForScan` falls back to `ScanRecord.tape`, the snapshot saved with the scan). `tapeReadings` (`TAPE_REFERENCE`, provisional): arm/thigh girth overrides the photo ratio; chest/waist for men only; `physiquePlan` uses them too (`allZoneReadings`, `zonesOf`). `tapeText` calls growth «coherente con más músculo» only with the zone's strength up. The overview opens with «Tu físico: …»; `ScanSummary.progress` feeds «Este mes: cinta y fuerza».

AI is the voice of AXIS (D-070): the engine still decides (verdict, proposed target, numbers are binding in `domain`); the model answers in its own words (`aiSystemPrompt`) for nearly every intent (`AI_WORTHY_INTENTS`; medical/out_of_scope stay deterministic). Today's last 8 turns travel with every request (`chatHistory`). Output `{message, followUps, action}`: follow-ups (≤2, `readFollowUps` server-side) render as chips under the last AXIS message (`components/screens/axis-chat.tsx`). Form is fixed, not rejected (`tidyModelText` in `safety.ts`); substance gates unchanged. Reinterpreted messages (D-028) are voiced against the original question. `VOICE_TEMPERATURE` 0.55.
Memory (D-070 block 2, `memory-pack.ts`, `buildAiMemory`): every request carries `briefing.memory` — up to 6 past days (last 3 user lines each, name as `{nombre}`, discomforts, told loads; the store loads them at boot), last 6 sessions, goals, learned dislikes/care zones, today's intake vs target, the weekly review, and scan/test summaries (never photos or raw measurements). Scan and assessment questions now reach the AI.

Nutrition (D-061, `lib/domain/nutrition/targets.ts`): `UserProfile.nutrition` (goal perder_grasa/mantener/ganar_musculo, accepted `adjustmentKcal`, `since`), set with `setNutritionGoal` and never by the profile form (`saveProfile` keeps it). `nutritionTargets` (computed once in the store, exposed as `nutritionTargets`): Mifflin-St Jeor × `activityFactor` (training days), goal delta (−min(500, 15 %) / +min(300, 10 %)), never below basal, round 50; protein 2.0–2.2 g/kg to lose fat, 1.6–2.0 otherwise, on `currentWeight`; fat 25–30 % of kcal and carbs the rest (D-066). Under 18 (D-023 as changed by D-066): same numbers, but never below maintenance and no downward adjustments. `proposeAdjustment` (±150 kcal, max ±500) after 3 weekly weight averages since the last change when the rate leaves `TARGET_RATE_PCT`; the user accepts it (`applyNutritionAdjustment`). With ≥ 7 complete logged days whose average is > 250 kcal off target in the direction that explains the weight, it returns `kind: 'adherence'` (say it, no button) instead.

Food log (D-066, `lib/domain/nutrition/intake.ts`, `components/food-log.tsx`): `BodyMeasurement.meals` (slot, kcal, protein/carbs/fat g; store `addMeal`/`removeMeal`), shown as «Lo que llevas hoy» with bars against the targets. A day is complete with dinner or ≥ 3 meals; only complete days feed averages and warnings. `proteinReached` answers the D-061 protein check from grams when meals exist (the question hides then). The weekly review gets `intake` and a line when ≥ 3 complete days are > 250 kcal off. `lowIntakeYesterday` (a complete day < 70 % of target kcal) reaches the engine through `AxisContext.lowIntakeYesterday` and rule `low_intake` (LIGHT_TRAINING, after high training load). The daily «¿Hoy llegaste a tu proteína?» is `protein` on the day's `BodyMeasurement`; the weekly review counts it. UI: «Alimentación» at the end of Recuperación (`components/nutrition-section.tsx`).

Block close (D-062, `lib/domain/workouts/block-review.ts`): `blockReview` is shown in Entrenamiento («Cierre del bloque» during the deload, «Tu bloque anterior» the first week of the next block if it had ≥ 3 weeks): each anchor's estimated 1RM (or best set) first → last in the block, the evolution test done in it (compared rows from `summarizeAssessment`) or an invitation to repeat it, and that the next block picks new anchors. The first-day-of-deload note invites the test if none was done in the last 4 weeks.

Load ramp (D-063): the first weighted main exercise's approach sets climb to the working weight with the user's lighter loads (`rampTo`: the closest load to ~50 % × 8 and ~75 % × 4, ascending, no repeats); with no lighter load it keeps the single 5-rep set. Other approach sets are unchanged.

Exercise level (D-065, `lib/domain/workouts/levels.ts`): in the active workout, before the first set of a main exercise, «Nivel» (`components/workout/level-picker.tsx`) lists its family's variants that today's gear and care zones allow (`levelOptions`, by difficulty); `changeExercise` swaps the entry with `suggestWorkFor`'s work and records `exercise_changed`. The choice is stored per family in `UserProfile.exerciseLevels` (store `changeExerciseLevel`; `saveProfile` keeps it) and the builder's `adapt` starts from it (`chosenLevel`, overrides the target difficulty and dislikes) and climbs the progression chain while `hasMastered` (never on deload).

Work timer (D-054): a timed entry shows «Empezar · N s» (`startWork`), stored as `ActiveWorkout.work` (a rest-like window plus `exerciseIndex`, validated on load). `workState` gives remaining/elapsed/finished; at zero the screen vibrates and calls `finishWork` (`completeWork`: registers the planned seconds, or the elapsed ones on «Terminar ya», then the usual rest); `cancelWork` records nothing. Skipping, completing or undoing clears it. The countdown is the shared `components/workout/countdown-ring.tsx`, also used by `RestTimer`.

Without recovery data (D-049; its Inicio check-in card was removed on 2026-10-21, recovery is registered only in Recuperación). Without today's recovery, `unknown_recovery` no longer always means light: it is `TRAINING` (rule `unknown_recovery_normal`, moderate, never hard, «No sé cómo llegas hoy…» and a «Sesión normal, sin apretar de más» closing) unless yesterday or the day before had a registered score below 75 (`facts.recentLowRecovery`, from `context.recentRecovery`, loaded with `recovery.recent(4)`), tomorrow has a high-intensity sport or the training load is high — then `LIGHT_TRAINING` as before.

Input scales, normalization and the "enough data" policy are closed by D-009. They live in `lib/domain/recovery/scales.ts` and `lib/domain/recovery/weights.ts` — change them there, nowhere else.

### AXIS visual identity

- Brand mark (D-029): an **«A» with a rising arrow**, traced from Alex's logo into `docs/design/AXTHLETICS_LOGO.svg` (source PNG next to it). It replaces the former abstract X. In the app it is one colour, the surrounding text's (`components/axis-mark.tsx`); in full colour — A `#111111`, arrow `#0A61F8`, on `#F8F8F8` — only in the app icons (`public/icon-*.png`, `apple-icon.png`).
- In the main app header, use the small mark immediately before the word **AXIS**.
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
- Adding a fifth tab (Progreso or Perfil) without explicit approval: Progreso lives inside Entrenamiento (D-040).

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
