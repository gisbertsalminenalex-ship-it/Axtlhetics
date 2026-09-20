# Axtlhetics — Technical Stack

## Project

Axtlhetics Core v0.1 is a local-first Progressive Web App focused on training, recovery, workout history and AXIS-powered guidance.

The current priority is a polished, reliable personal application.

The architecture must remain clean enough to support future expansion without introducing unnecessary infrastructure today.

---

## Frontend

- Next.js
- TypeScript
- React

Next.js is responsible for the application structure, routing and frontend rendering.

---

## Styling

- Tailwind CSS

The visual system must follow the approved Axtlhetics design system.

Primary design values:

- Primary: #0A61F8
- Soft secondary blue: #DCE8FF
- Background: pending — use the approved design-system background token; do not hard-code a contradictory value here
- Surface / Cards: #F7F7F7
- Text primary: #111111
- Text secondary: #6B6B6B
- Border: #D6D6D6
- Progress track: #EAEAEA
- Muted non-text: #9A9A9A
- Font: Inter

The definitive visual language is editorial, premium, technological, clean and informative. The interface should use the design system as the source of truth rather than inventing independent visual tokens.

### Token rules (D-004, D-005)

- Neutrals must be **centralized as tokens**. Arbitrary greys scattered across components (`#71757e`, `#6f737c` and similar) are not allowed.
- Radii are **semantic tokens by component type**, not a single value and not a ramp derived from one base: `--radius-control` (8 px), `--radius-surface` (pending) and `--radius-full` (999 px). No radius is written directly into a component.
- Semantic colors (success / warning / error) remain **pending**. The `#1ba672` and `#f2a516` currently in `app/globals.css` are provisional prototype values and are not approved.
- The order of authority is: approved product decisions → Design System → code. A value is not approved because it is already in the code.

---

## UI Components

- shadcn/ui
- Lucide React

Components should be reusable and consistent.

Do not create isolated one-off components when an existing design-system component can be reused.

---

## Data & Persistence

### Current — Core v0.1

- IndexedDB
- Local-first architecture
- No backend
- No user accounts

The application must work without an internet connection for its core functionality.

Data access should be separated from business logic through appropriate repository abstractions.

### Future

- Supabase may be introduced in a future version if cloud synchronization, accounts or other requirements make it necessary.

Do not introduce Supabase into Core v0.1.

---

## AXIS

### Current — Core v0.1

AXIS uses local logic and deterministic rules.

Conceptual architecture:

User data
↓
Context
↓
AXIS logic
↓
Recommendation
↓
Explanation

AXIS must remain separated from the UI and from the concrete AI provider.

### Decision engine (D-001)

In Core v0.1 AXIS is the engine that decides what training makes sense today. The user does not primarily pick a routine by hand, so the session is an **output** of AXIS, not an input chosen in the UI.

Technical consequences:

- The engine is **deterministic and rule-based**. No external generative AI in Core v0.1.
- Rules live behind a stable interface so the deterministic engine can be replaced or extended with an AI provider later **without rewriting the application**.
- The engine takes a context object and returns a typed result that always carries a **reason**, never a bare recommendation.
- The engine must be able to return "recover / do not train" as a valid result.
- No imports from `components/` anywhere inside the AXIS layer.

### Recovery Score (D-002)

The Recovery Score is an internal 0–100 orientation index, never a medical measurement.

Approved weights — sleep 35 %, energy 20 %, muscular fatigue 20 %, stress 15 %, hydration 10 % — must live in a **single centralized module**, so they can be tuned without touching the computation logic.

When data is insufficient the score is not computed and not invented: the domain returns an explicit "insufficient data" result that the UI renders as such.

### Future

An external AI provider may be integrated later.

Potential technology:

- OpenAI API

The AI provider is not part of the required Core v0.1 stack.

---

## Architecture

The application should maintain clear separation between:

- UI / presentation
- Features
- Domain / business logic
- Data / repositories
- Services
- Shared components

Business logic must not depend directly on UI components.

The domain must not depend directly on IndexedDB.

AXIS must not be tightly coupled to the UI or to a specific AI provider.

---

## Hosting & Deployment

- Vercel

Vercel is the hosting and deployment platform for the web application (D-014). The only server-side piece is the `app/api/axis-ai` route handler; everything else is static.

The application should be deployable as a Progressive Web App.

---

## Version Control

- GitHub
- Git

Use Git for version control and meaningful checkpoints.

Large or risky changes should be committed before continuing.

---

## PWA

Axtlhetics Core is intended to function as a Progressive Web App.

The PWA should prioritize:

- Fast loading
- Responsive design
- Installability
- Reliable local functionality
- Good mobile experience

PWA functionality should not introduce unnecessary complexity into the Core.
