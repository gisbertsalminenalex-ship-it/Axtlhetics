import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateChange, parseChangeRequest } from './conversation/negotiation'
import type { AxisBriefing } from './briefing'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { decide } from './engine'
import { AXIS_PERSONALITY } from './personality'
import { checkModelText, countSentences, type DomainAnswerForSafety } from './safety'

const PLAIN: DomainAnswerForSafety = {
  text: 'Hoy toca tren inferior.',
  intent: 'why',
  verdict: null,
  proposedTarget: null,
}

const DECLINED: DomainAnswerForSafety = {
  text: 'Hoy no lo quitaría: tu recuperación está en 84.',
  intent: 'change',
  verdict: 'decline',
  proposedTarget: null,
}

const ACCEPTED: DomainAnswerForSafety = {
  text: 'Cambio a «Tren superior», que deja esa zona tranquila.',
  intent: 'change',
  verdict: 'accept',
  proposedTarget: { type: 'MODIFIED_TRAINING', focus: 'tren_superior' },
}

function reasonOf(text: string, domain: DomainAnswerForSafety = PLAIN): string | null {
  const check = checkModelText(text, domain)
  return check.ok ? null : check.reason
}

// ---------------------------------------------------------------------------
// Lo que pasa
// ---------------------------------------------------------------------------

test('una redacción sobria, corta y fiel pasa', () => {
  assert.equal(reasonOf('Hoy toca tren inferior: llevas dos días sin cargar piernas y tu recuperación está en 84.'), null)
  assert.equal(reasonOf('No. Tu recuperación está en 40 y subir la carga solo acumula fatiga.', DECLINED), null)
  assert.equal(reasonOf('Cambio a tren superior: esa zona está descansada.', ACCEPTED), null)
})

test('los decimales no cuentan como fin de frase', () => {
  assert.equal(countSentences('Sube a 2.5 kg. Mantén las 8 repeticiones.'), 2)
  assert.equal(countSentences('Una sola frase sin punto final'), 1)
  assert.equal(countSentences(''), 0)
})

test('el máximo de frases sale de la personalidad', () => {
  const max = AXIS_PERSONALITY.limits.maxSentences
  const exact = Array.from({ length: max }, (_, i) => `Frase ${i + 1}.`).join(' ')
  const over = `${exact} Una más.`
  assert.equal(reasonOf(exact), null)
  assert.equal(reasonOf(over), 'too_long')
})

// ---------------------------------------------------------------------------
// Forma
// ---------------------------------------------------------------------------

test('texto vacío', () => {
  assert.equal(reasonOf(''), 'empty')
  assert.equal(reasonOf('  \n '), 'empty')
})

test('longitud desmesurada en caracteres aunque sean pocas frases', () => {
  assert.equal(reasonOf('a'.repeat(AXIS_PERSONALITY.limits.maxCharacters + 1)), 'too_long')
})

test('emojis y exclamaciones', () => {
  assert.equal(reasonOf('Hoy toca tren inferior 🔥'), 'emoji')
  assert.equal(reasonOf('¡Hoy toca tren inferior!'), 'exclamation')
  assert.equal(reasonOf('Hoy toca tren inferior!'), 'exclamation')
})

test('aperturas complacientes, con o sin acento y con puntuación delante', () => {
  for (const opener of AXIS_PERSONALITY.forbiddenOpeners) {
    assert.equal(reasonOf(`${opener}, cambiamos.`), 'forbidden_opener', opener)
  }
  assert.equal(reasonOf('Tienes razón, hoy piernas no.'), 'forbidden_opener')
  assert.equal(reasonOf('«Claro» que no: tu recuperación está en 40.'), 'forbidden_opener')
  // La palabra dentro de la frase no es una apertura.
  assert.equal(reasonOf('No está claro que hoy convenga cargar piernas.'), null)
})

test('lenguaje médico', () => {
  assert.equal(reasonOf('Parece una lesión de rodilla.'), 'medical_language')
  assert.equal(reasonOf('Con antiinflamatorios se te pasa.'), 'medical_language')
  assert.equal(reasonOf('No puedo evaluar eso: es criterio médico.'), null)
})

// ---------------------------------------------------------------------------
// Fondo: el veredicto y la propuesta
// ---------------------------------------------------------------------------

test('con un decline, el texto no puede conceder el cambio', () => {
  assert.equal(reasonOf('De acuerdo, hoy dejamos piernas.', DECLINED), 'contradicts_verdict')
  assert.equal(reasonOf('Vale, cambio a tren superior.', DECLINED), 'contradicts_verdict')
  assert.equal(reasonOf('Hoy no: tu recuperación está en 84 y nada justifica saltar piernas.', DECLINED), null)
})

test('las frases de aceptación no se miran fuera de un decline', () => {
  assert.equal(reasonOf('De acuerdo, y no por gusto: ya llevas piernas trabajado.', ACCEPTED), null)
  assert.equal(reasonOf('De acuerdo con tus datos, hoy toca tren inferior.', PLAIN), null)
})

test('con un accept, el texto no puede negarse ni anunciar otro foco', () => {
  assert.equal(reasonOf('No lo cambio: la sesión se queda como está.', ACCEPTED), 'contradicts_proposal')
  assert.equal(reasonOf('Cambio a tren inferior, que está descansado.', ACCEPTED), 'contradicts_proposal')
})

test('mencionar otra zona al explicar no es anunciar un cambio a esa zona', () => {
  assert.equal(
    reasonOf('Cambio a tren superior: las piernas ya las cargaste ayer con la bici.', ACCEPTED),
    null,
  )
  assert.equal(reasonOf('Las piernas se quedan tranquilas hoy.', ACCEPTED), null)
})

test('el orden de gravedad: el fondo se detecta antes que la forma', () => {
  assert.equal(reasonOf('¡De acuerdo, cambiamos!', DECLINED), 'contradicts_verdict')
})

// ---------------------------------------------------------------------------
// El determinista pasa su propia puerta
// ---------------------------------------------------------------------------

test('las respuestas de negociación del propio dominio no tropiezan con la forma', () => {
  const context = buildAxisContext({
    profile: {
      id: 'primary',
      name: 'Alex',
      age: 15,
      heightCm: 175,
      weightKg: 68,
      goals: ['fuerza'],
      experience: 'intermedio',
      availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      typicalSessionMinutes: 60,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    recoveryInputs: {
      dayKey: '2026-09-07',
      sleepHours: 9,
      energy: 4,
      muscleFatigue: 2,
      stress: 2,
      hydrationGlasses: 6,
      updatedAt: '2026-09-07T08:00:00.000Z',
    },
    recentSessions: [],
    activities: [],
    now: new Date(2026, 8, 7, 10, 0),
  })
  const briefing: AxisBriefing = buildBriefing(context, decide(context), [])

  for (const message of [
    'hoy no quiero hacer piernas',
    'ponme algo más duro',
    'prefiero algo más suave',
    'hoy prefiero descansar',
    'voy justo de tiempo',
    'quiero hacer tren superior',
    'ayer hice 20 km de bici por montaña, hoy piernas no',
  ]) {
    const verdict = evaluateChange(parseChangeRequest(message), briefing)
    const check = checkModelText(verdict.text, {
      text: verdict.text,
      intent: 'change',
      verdict: verdict.outcome,
      proposedTarget: verdict.proposedTarget,
    })
    // La longitud no se exige al determinista: sus textos son la referencia,
    // no una redacción externa. Todo lo demás, sí.
    if (!check.ok) assert.equal(check.reason, 'too_long', `«${message}» → ${check.reason}: ${verdict.text}`)
  }
})
