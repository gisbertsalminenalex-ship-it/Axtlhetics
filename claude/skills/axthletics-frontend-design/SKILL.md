---
name: axthletics-frontend-design
description: Design and refine the AXTHLETICS mobile-first visual prototype with high visual fidelity, reusable components, mock data, and strict adherence to the project's approved design system and visual reference. Use this skill for AXTHLETICS frontend design, UI implementation, visual prototyping, screen refinement, responsive polish, and design QA. Do not activate production data, persistence, backend, authentication, or real AXIS logic during the visual-prototype phase.
---

# AXTHLETICS FRONTEND DESIGN SKILL

## Purpose

This skill defines how Claude Code must design and implement the visual prototype of AXTHLETICS. The current goal is visual fidelity and UX exploration, not production functionality.

## Source of truth

Before making frontend decisions, inspect:

1. `CLAUDE.md`
2. `TECH_STACK.md`
3. `docs/product/DOCUMENTO_MAESTRO_AXTHLETICS.docx`
4. `docs/product/AXTHLETICS_DECISIONS_V1.md`
5. `docs/design/DESIGN_SYSTEM_AXTHLETICS.md`
6. `docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

Priority:

1. Explicit product decisions in `AXTHLETICS_DECISIONS_V1.md`
2. Product requirements in the Master Document
3. Visual rules in `DESIGN_SYSTEM_AXTHLETICS.md`
4. Visual composition in `AXTHLETICS_VISUAL_REFERENCE.png`
5. Technical constraints in `TECH_STACK.md`
6. General instructions in `CLAUDE.md`

If two sources conflict, surface the conflict rather than inventing a compromise.

## Current phase: VISUAL PROTOTYPE

Build:

- polished frontend
- mobile-first layouts
- reusable components
- realistic mock data
- prototype navigation
- visual states
- transitions and micro-interactions
- responsive behavior
- useful loading/empty/error states
- realistic content density

Do NOT build:

- real database
- IndexedDB persistence
- authentication
- backend
- API integration
- external AI
- real AXIS reasoning
- real Recovery Score computation
- real workout/history persistence
- production analytics
- production notifications
- external services

Buttons and navigation may work only for prototype navigation.

## Primary objective

Make AXTHLETICS look excellent on a real mobile screen. Visual quality is more important than implementation speed. Do not settle for generic UI patterns just because they are quick to code.

## Design philosophy

AXTHLETICS should feel:

- editorial
- premium
- technological
- clean
- informative
- calm
- athletic
- intelligent
- trustworthy
- fast
- focused
- uncluttered

The product should feel like a calm, confident personal coach, not a generic SaaS dashboard or a fitness analytics panel. Typography and whitespace should establish hierarchy before cards and decorative UI.

Avoid:

- generic SaaS dashboards
- excessive gradients
- excessive shadows
- excessive glassmorphism
- excessive rounded shapes
- decorative UI without purpose
- unnecessary metrics
- spreadsheet-like layouts
- visual noise
- random colors
- inconsistent component styles

## Mobile-first

Design for a modern smartphone in portrait orientation:

- one-handed use
- thumb reach
- clear touch targets
- safe areas
- vertical hierarchy
- comfortable scrolling
- realistic mobile viewport dimensions

Do not make a desktop website squeezed into a phone.

## Visual identity

Primary color: `#0A61F8`

Use it for primary actions, important highlights, progress, active navigation, and key AXIS elements where appropriate.

Do not reintroduce the old `#4F7CFF`.

Main background: white or a very subtly softened neutral; the exact background token is still `PENDIENTE` and must be centralized for easy visual iteration.

Standard cards:

- neutral surface (`#F7F7F7`) when grouping is useful
- subtle neutral border
- 8 px radius
- no default shadow

Cards are not the universal container. Prefer direct canvas content when typography and whitespace already provide enough hierarchy.

AXIS may use a blue filled or softly accented card only as a deliberate variant.

## Typography

Use `Inter`.

Base hierarchy:

- main title: 32 px
- section title/subtitle: 20 px
- body: 16 px
- supporting text: 13 px

Avoid excessive bold and additional font families.

## Spacing

Use a 4 px base unit. Prefer 4, 8, 12, 16, 20, 24, 32, 40, 48, 52 px. Do not invent arbitrary spacing values without reason.

## Radius

Primary radius: 8 px.

Use full rounding only for pills, tags, chips, and circular controls. Do not make everything a pill.

## Shadows

Default: no shadows. Use spacing, borders, and surface contrast for hierarchy. Only use an extremely subtle shadow when a specific interaction genuinely requires elevation.

## Buttons and touch

Primary button height: 52 px.

Minimum interactive area: 44 × 44 px.

Use one obvious primary action per screen. Secondary actions should be quieter.

## Iconography

Use Lucide React as the primary family. Keep the language coherent, lightweight and recognizable. The default is line-based; filled/solid treatments are allowed only when they communicate a meaningful state or functional emphasis. Do not mix icon families or use icons as decoration only.

## Reusable components

Prefer reusable components, including:

- Button
- Card
- AXIS Card
- Circular Metric
- Bottom Navigation
- Recovery Score
- Training Load / Carga (using Circular Metric)
- Hydration Glass
- Hydration Group
- Indicator Input
- Exercise Row
- Set Stepper
- Rest Timer
- Day Strip
- List Row
- Tag / Chip
- Empty State
- Loading State
- Error State
- Modal
- Bottom Sheet
- Progress Indicator

If a pattern appears twice, strongly prefer extracting it.

## AXIS

AXIS is a core product concept and the guidance system of Axtlhetics. In the visual prototype it should feel intelligent, calm, useful, and integrated into the app, not like a separate chatbot product.

Visual identity:

- abstract X symbol + AXIS wordmark;
- small X symbol before `AXIS` in the main header;
- secondary/discreet symbol inside AXIS cards;
- concise, authoritative explanations;
- no giant chatbot avatar, robot mascot, decorative orbits or orbital rings;
- AXIS guides decisions but does not dominate every screen.

Use contextual mock content for:

- Home recommendations
- Training recommendations
- Recovery explanations
- Workout Summary interpretations
- History insights

A dedicated Ask AXIS interaction may exist, but it must remain contextual rather than a generic ChatGPT clone. Never imply that real AI reasoning is active in this phase.

## Circular metrics

Use one reusable `Circular Metric` pattern for 0–100 metrics such as Recovery Score and Training Load / Carga. It should use a thin ring, subtle track, large central value, `/100` where applicable, restrained semantic state and short context. Do not create separate visual systems for metrics that share this structure.

## Recovery Score

Visual prototype only.

Approved concept:

- score 0–100
- weighted inputs
- visual score ring
- clear status
- explanatory context

Prototype visual ranges:

- 0–49 red
- 50–74 orange
- 75–100 green

These ranges are visual prototype conventions, not the final product calculation or semantic-color specification. Exact semantic color tokens remain `PENDIENTE`.

Do not implement the real calculation in this phase. Use realistic mocked states:

- healthy
- moderate
- low
- insufficient data

Insufficient data must not invent a score.

## Recovery indicators

Five primary inputs:

1. Sleep
2. Hydration
3. Energy
4. Muscle fatigue
5. Stress / mood

Visual prototype rules:

- Energy: 1–10
- Muscle fatigue: 1–10
- Stress/mood: use the approved visual scale
- Sleep: duration
- Hydration: 8 interactive glasses

Do not invent medical interpretation.

## Hydration

AXTHLETICS uses 8 interactive glasses.

States:

- empty
- filled
- partially filled group
- complete

Visual behavior:

- fill/unfill transition ≈ 200 ms
- filled state uses brand blue
- empty state uses subtle neutral outline
- summary `n / 8 vasos`

No main milliliter counter.

Use mock state in the prototype.

## Prototype screens

First visual prototype:

1. Home / Inicio
2. Training / Entrenamiento
3. Exercise / active exercise state
4. Workout Summary (internal post-workout flow)
5. Recovery / Recuperación
6. History / Historial

These are visual prototype states/flows, not six permanent navigation tabs.

Bottom navigation:

- Inicio
- Entrenamiento
- Recuperación
- Historial

Workout Summary is a post-workout subflow, not a permanent tab.

## Home

Home is the most important screen. It should quickly answer:

- What should I do today?
- How am I recovering?
- What does AXIS recommend?
- What is my hydration status?
- Can I start training immediately?

Keep it calm and avoid showing every metric.

## Training

Prioritize:

- exercise name
- current set
- reps
- weight
- RIR where useful
- session progress
- rest timer
- AXIS contextual advice
- next/complete actions

Do not overload the active workout screen with analytics.

## Workout Summary

Answer:

- Did I complete the workout?
- How long was it?
- What did I accomplish?
- Did anything notable happen?
- What does AXIS think?

Keep it concise.

## Recovery

Answer:

- How recovered am I?
- Why?
- What should I do?
- What data is affecting the result?

Make the five indicators easy to scan. The score should not visually dominate everything else.

## History

Keep history:

- chronological
- simple
- easy to scan
- focused on previous sessions

A user should be able to see previous workouts, select one, and inspect its details.

## Navigation prototype

Navigation may work visually only. Use mock routing/state for the prototype. Keep transitions quick and intentional; no dramatic page transitions.

## Mock data

All displayed data may be mocked.

Mock values must be:

- realistic
- internally consistent
- useful for demonstrating states
- clearly replaceable later

Prefer centralized mock data over scattered hardcoded values.

## Visual iteration workflow

Build in this order:

1. Analyze references and documents.
2. Create design foundation.
3. Build Home.
4. Review Home visually.
5. Reuse the established visual language for Training.
6. Build the remaining screens.
7. Connect prototype navigation.
8. Run a full visual consistency pass.

Do not build every screen before reviewing the design.

## Visual QA

Before a screen is considered finished, check:

- premium mobile appearance
- clear hierarchy
- obvious primary action
- sufficient whitespace
- consistent cards
- aligned padding
- typography consistency
- icon consistency
- touch targets
- color consistency
- understandable interactions
- fidelity to approved reference language
- absence of generic-looking UI
- no unnecessary or overcrowded content

## Anti-generic rule

Do not settle for the first reasonable UI. If it looks like a generic SaaS dashboard, fitness dashboard, Tailwind starter, default shadcn interface, or default Next.js UI, keep refining.

## Reference matching

When the reference image and written rules disagree:

- written product decisions control functionality
- the Design System controls visual rules
- the reference controls composition and visual intent

Do not copy contradictions blindly.

## Prototype vs production

This phase answers: “Do we love how AXTHLETICS looks and feels?”

It does not answer whether the backend works.

If a real feature would complicate visual iteration, replace it with a mock.

## Scope control

Do not silently expand scope. If a visually attractive feature would add product scope not required for the prototype, mark it as a possible enhancement and continue with approved scope.

## Completion condition

The visual prototype phase is complete when:

- all six core prototype screens exist
- navigation between them works
- mock data is consistent
- visual states exist
- mobile layout is polished
- the Design System is used consistently
- the reference image's visual language is reflected
- no real product logic is required
- the whole prototype can be reviewed on a real mobile viewport

At that point, stop. Do not begin production architecture or real data implementation until the visual prototype is explicitly approved.

## Locked visual decisions

- Primary blue: `#0A61F8`; do not reintroduce `#4F7CFF`.
- Bottom navigation: Inicio, Entrenamiento, Recuperación, Historial.
- Workout Summary is an internal post-workout flow, not a tab.
- Progreso and Perfil are outside Core v0.1.
- Hydration uses 8 interactive glasses, not a main millilitre counter.
- AXIS uses the abstract X + AXIS identity and remains integrated/discreet.
- Visual direction: editorial, premium, technological, clean and informative.
- Do not treat the visual reference as permission to add future product scope.
