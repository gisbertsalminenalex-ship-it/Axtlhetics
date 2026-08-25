# Axtlhetics

**The operating system for your body.**

Axtlhetics is a local-first personal fitness application designed to help you decide what to do today to move closer to your physical goals.

## Core v0.1

Core v0.1 focuses on:

- Training
- Recovery
- Workout history
- AXIS-powered guidance

AXIS is Axtlhetics' intelligent guidance system. It uses the user's training and recovery data to recommend what to do next and explain why.

## Product principles

Axtlhetics prioritizes:

- Clear decisions over excessive data
- Health and recovery over gamification
- Purposeful information over dashboard clutter
- A calm, premium and focused mobile experience
- Guidance that explains the reasoning behind recommendations

## Architecture

Core v0.1 is local-first and designed to work without a backend.

The current stack includes:

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Lucide React
- IndexedDB
- Netlify
- PWA

AXIS uses local, deterministic logic in Core v0.1. An external AI provider may be introduced in a future version, but it is not required for the current core product.

## Scope

The main navigation consists of four sections:

1. Inicio
2. Entrenamiento
3. Recuperación
4. Historial

Workout Summary exists as an internal training flow, not as a primary navigation tab.

Core v0.1 intentionally excludes features such as social functionality, gamification, wearables, accounts and cloud infrastructure.

## Design

Axtlhetics follows a mobile-first visual system with an **editorial, premium, technological, clean and informative** direction.

The design prioritizes hierarchy, whitespace and purposeful use of color rather than turning every piece of information into a card.

The approved visual reference is:

`docs/design/AXTHLETICS_VISUAL_REFERENCE.png`

The Design System is the source of truth for visual tokens, components and interaction patterns.

## Project status

Axtlhetics Core v0.1 is currently being designed and refined before implementation.
