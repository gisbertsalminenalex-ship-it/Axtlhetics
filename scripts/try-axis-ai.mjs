/**
 * Prueba en vivo de la capa de lenguaje de AXIS contra los proveedores reales.
 *
 *   node --import ./scripts/ts-resolver.mjs scripts/try-axis-ai.mjs [modo]
 *
 * Modos (D-016):
 *   chain       (por defecto) la cadena tal cual: Cloudflare → Groq
 *   cloudflare  solo Cloudflare
 *   groq        solo Groq
 *   fallback    Cloudflare con un token inválido: debe responder Groq
 *   none        los dos con credenciales inválidas: debe responder el determinista
 *
 * Lee CF_ACCOUNT_ID, CF_API_TOKEN y GROQ_API_KEY del entorno o de `.env.local`
 * (que está en .gitignore). Construye un día real con el motor determinista,
 * pide una redacción a la ruta `/api/axis-ai` exactamente como lo haría el
 * navegador, y pasa la respuesta por las mismas puertas que la aplicación:
 * `reconcileTarget` y `checkModelText`. La ruta se invoca igual que lo haría
 * Vercel, sin levantar ningún servidor; las líneas `[axis-ai]` son el registro
 * de metadatos de la cadena, el mismo que queda en Vercel.
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

// --- credenciales -------------------------------------------------------------
const KEYS = ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL']
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const key of KEYS) {
    const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
    if (!process.env[key] && match) process.env[key] = match[1].trim()
  }
} catch {
  // sin .env.local
}

const MODE = process.argv[2] ?? 'chain'
if (MODE === 'groq') {
  delete process.env.CF_ACCOUNT_ID
  delete process.env.CF_API_TOKEN
} else if (MODE === 'cloudflare') {
  delete process.env.GROQ_API_KEY
} else if (MODE === 'fallback') {
  process.env.CF_API_TOKEN = 'token-invalido-a-proposito'
} else if (MODE === 'none') {
  process.env.CF_API_TOKEN = 'token-invalido-a-proposito'
  process.env.GROQ_API_KEY = 'clave-invalida-a-proposito'
} else if (MODE !== 'chain') {
  console.error(`Modo desconocido: ${MODE}. Usa chain, cloudflare, groq, fallback o none.`)
  process.exit(2)
}

const needsCloudflare = MODE !== 'groq'
const needsGroq = MODE !== 'cloudflare'
if (needsCloudflare && !(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN)) {
  console.error('Faltan CF_ACCOUNT_ID y CF_API_TOKEN: escríbelas en .env.local (ver .env.example).')
  process.exit(2)
}
if (needsGroq && !process.env.GROQ_API_KEY) {
  console.error('Falta GROQ_API_KEY: escríbela en .env.local (ver .env.example).')
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
  console.log(`  modelo: ${parsed.text}`)
  const reconciliation = reconcileTarget(parsed.action, domain.proposedTarget ?? null)
  console.log(`  acción del modelo: ${JSON.stringify(parsed.action)} → destino final: ${JSON.stringify(reconciliation.target)}${reconciliation.modelDisagreed ? '  (DISCREPA → fallback)' : ''}`)
  const check = checkModelText(parsed.text, domain, { briefing: toAiBriefing(briefing) })
  console.log(`  safety: ${check.ok ? 'pasa' : `RECHAZA (${check.reason}: ${check.detail}) → fallback`}`)
}

console.log(`Modo: ${MODE}`)
console.log(`Propuesta del día: ${decision.primary.headline}`)
await ask('¿Por qué me recomiendas este entrenamiento?')
await ask('cambia la sesión, no quiero hacer piernas', { lastIntent: 'change', changeMode: true })
await ask('cambia a algo más corto, voy justo de tiempo', { lastIntent: 'change', changeMode: true })
