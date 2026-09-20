/**
 * Prueba en vivo de la capa de lenguaje de AXIS contra el proveedor real.
 *
 *   node --import ./scripts/ts-resolver.mjs scripts/try-axis-ai.mjs
 *
 * Lee GROQ_API_KEY del entorno o de `.env.local` (que está en .gitignore).
 * Construye un día real con el motor determinista, pide una redacción a la
 * ruta `/api/axis-ai` exactamente como lo haría el navegador, y pasa la respuesta
 * por las mismas puertas que la aplicación: `reconcileTarget` y `checkModelText`.
 * La ruta se invoca igual que lo haría Vercel, sin levantar ningún servidor.
 *
 * No escribe nada en ningún sitio. No forma parte del build ni de los tests.
 */

import { readFileSync } from 'node:fs'

import { POST as handler } from '../app/api/axis-ai/route.ts'
import { buildBriefing } from '../lib/domain/axis/briefing.ts'
import { buildAxisContext } from '../lib/domain/axis/context.ts'
import { answerFromBriefing } from '../lib/domain/axis/conversation/deterministic.ts'
import { aiSystemPrompt, parseAiResponse, reconcileTarget, toAiBriefing } from '../lib/domain/axis/conversation/ai.ts'
import { decide } from '../lib/domain/axis/engine.ts'
import { checkModelText } from '../lib/domain/axis/safety.ts'
import { AXIS_AI_MODEL } from '../lib/ai/provider-contract.ts'

// --- credencial --------------------------------------------------------------
if (!process.env.GROQ_API_KEY) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const match = env.match(/^GROQ_API_KEY=(.+)$/m)
    if (match) process.env.GROQ_API_KEY = match[1].trim()
  } catch {
    // sin .env.local
  }
}
if (!process.env.GROQ_API_KEY) {
  console.error('Falta GROQ_API_KEY: exporta la variable o escríbela en .env.local (ver .env.example).')
  process.exit(2)
}

// --- un día real ---------------------------------------------------------------
const now = new Date()
const context = buildAxisContext({
  profile: {
    id: 'primary', name: 'Alex', age: 15, heightCm: 175, weightKg: 68,
    goals: ['hipertrofia'], experience: 'intermedio', availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    typicalSessionMinutes: 60, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  },
  recoveryInputs: {
    dayKey: context_day(now), sleepHours: 9, energy: 4, muscleFatigue: 2, stress: 2, hydrationGlasses: 6,
    updatedAt: now.toISOString(),
  },
  recentSessions: [],
  activities: [],
  now,
})
function context_day(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const decision = decide(context)
const briefing = buildBriefing(context, decision, [], decision.primary, null, [])

const SITE = 'https://axthletics.vercel.app'

async function ask(question, memory) {
  const domain = answerFromBriefing(question, briefing, memory)
  const request = new Request(`${SITE}/api/axis-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({
      system: aiSystemPrompt(),
      question,
      briefing: toAiBriefing(briefing),
      domain: { text: domain.text, intent: domain.intent, proposedTarget: domain.proposedTarget ?? null },
    }),
  })

  const started = Date.now()
  const response = await handler(request)
  const elapsed = Date.now() - started
  const payload = await response.json()

  console.log(`\n▸ «${question}»`)
  console.log(`  determinista: ${domain.text}`)
  console.log(`  HTTP ${response.status} en ${elapsed} ms`)
  if (response.status !== 200) {
    console.log(`  código: ${payload.code} → la app respondería con el determinista`)
    return
  }
  const parsed = parseAiResponse(payload)
  console.log(`  modelo (${AXIS_AI_MODEL}): ${parsed.text}`)
  const reconciliation = reconcileTarget(parsed.action, domain.proposedTarget ?? null)
  console.log(`  acción del modelo: ${JSON.stringify(parsed.action)} → destino final: ${JSON.stringify(reconciliation.target)}${reconciliation.modelDisagreed ? '  (DISCREPA → fallback)' : ''}`)
  const check = checkModelText(parsed.text, domain)
  console.log(`  safety: ${check.ok ? 'pasa' : `RECHAZA (${check.reason}: ${check.detail}) → fallback`}`)
}

console.log(`Modelo: ${AXIS_AI_MODEL}`)
console.log(`Propuesta del día: ${decision.primary.headline}`)
await ask('¿Por qué me recomiendas este entrenamiento?')
await ask('cambia la sesión, no quiero hacer piernas', { lastIntent: 'change', changeMode: true })
await ask('cambia a algo más corto, voy justo de tiempo', { lastIntent: 'change', changeMode: true })
