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

- Primary: #4F7CFF
- Background: #FFFFFF
- Cards: #F7F7F7
- Text: #111111
- Font: Inter

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

- Netlify

Netlify is the hosting and deployment platform for the web application.

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

---

## Future Technologies

The following technologies are intentionally NOT part of Core v0.1:

- Supabase
- OpenAI API
- User accounts
- Cloud synchronization
- Community/social systems
- Wearable integrations

They may be considered in future versions only when a concrete product requirement justifies them.

---

## Technical Principle

Use the simplest technology that satisfies the current requirement.

Do not add infrastructure because it might be useful someday.

Axtlhetics Core should remain:

- Local-first
- Simple
- Fast
- Maintainable
- Scalable enough for future evolution
