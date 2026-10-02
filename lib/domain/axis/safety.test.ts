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

/** Lo mínimo para que las cifras de los ejemplos estén respaldadas. */
const SAMPLE_BRIEFING = { recovery: { known: true, value: 84 } }

function reasonOf(
  text: string,
  domain: DomainAnswerForSafety = PLAIN,
  briefing: unknown = SAMPLE_BRIEFING,
): string | null {
  const check = checkModelText(text, domain, { briefing })
  return check.ok ? null : check.reason
}

// ---------------------------------------------------------------------------
// Lo que pasa
// ---------------------------------------------------------------------------

test('una redacción sobria, corta y fiel pasa', () => {
  assert.equal(reasonOf('Hoy toca tren inferior: tu recuperación está en 84 y da para cargar piernas.'), null)
  assert.equal(reasonOf('No. Tu recuperación está en 84, pero subir la carga solo acumula fatiga.', DECLINED), null)
  assert.equal(reasonOf('Cambio a tren superior: esa zona está descansada.', ACCEPTED), null)
})

test('los decimales no cuentan como fin de frase', () => {
  assert.equal(countSentences('Sube a 2.5 kg. Mantén las 8 repeticiones.'), 2)
  assert.equal(countSentences('Una sola frase sin punto final'), 1)
  assert.equal(countSentences(''), 0)
})

test('el máximo de frases sale de la personalidad', () => {
  const max = AXIS_PERSONALITY.limits.maxSentences
  const exact = Array.from({ length: max }, (_, i) => `Frase ${String.fromCharCode(65 + i)}.`).join(' ')
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
  assert.equal(reasonOf('«Claro» que no: tu recuperación está en 84.'), 'forbidden_opener')
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
  assert.equal(reasonOf('De acuerdo, y no por gusto: esa zona necesita descanso.', ACCEPTED), null)
  assert.equal(reasonOf('De acuerdo con tus datos, hoy toca tren inferior.', PLAIN), null)
})

test('con un accept, el texto no puede negarse ni anunciar otro foco', () => {
  assert.equal(reasonOf('No lo cambio: la sesión se queda como está.', ACCEPTED), 'contradicts_proposal')
  assert.equal(reasonOf('Cambio a tren inferior, que está descansado.', ACCEPTED), 'contradicts_proposal')
})

test('mencionar otra zona al explicar no es anunciar un cambio a esa zona', () => {
  assert.equal(
    reasonOf('Cambio a tren superior: las piernas necesitan descanso.', ACCEPTED),
    null,
  )
  assert.equal(reasonOf('Las piernas se quedan tranquilas hoy.', ACCEPTED), null)
})

test('el orden de gravedad: el fondo se detecta antes que la forma', () => {
  assert.equal(reasonOf('¡De acuerdo, cambiamos!', DECLINED), 'contradicts_verdict')
  assert.equal(reasonOf('¡Tu recuperación está en 91!'), 'invented_number')
})

// ---------------------------------------------------------------------------
// Fondo: las cifras
// ---------------------------------------------------------------------------

test('una cifra que no está en el briefing ni en el dominio es inventada', () => {
  assert.equal(reasonOf('Tu recuperación está en 82, así que hoy piernas.'), 'invented_number')
  assert.equal(reasonOf('Haz 5 series de sentadillas.'), 'invented_number')
  assert.equal(reasonOf('Tu recuperación está en 84.', PLAIN, {}), 'invented_number', 'sin briefing, solo vale el dominio')
})

test('las cifras del dominio y del briefing están respaldadas', () => {
  assert.equal(reasonOf('Tu recuperación está en 84, buena para cargar.'), null)
  assert.equal(reasonOf('Sigo en lo mismo: tu recuperación está en 84.', DECLINED, {}), null, 'el 84 viene del dominio')
  assert.equal(reasonOf('Sin cifras no hay nada que respaldar.'), null)
})

test('se encuentran las cifras en cualquier nivel del briefing, también dentro de textos', () => {
  const briefing = {
    proposal: { session: { estimatedMinutes: 45, exercises: [{ name: 'Remo', sets: 3, reps: 12, weightKg: 2.5 }] } },
    activitiesToday: [{ name: 'Baloncesto', window: '18:00–19:30' }],
  }
  assert.equal(reasonOf('Son 45 minutos: 3 series de 12 con 2,5 kg.', PLAIN, briefing), null)
  assert.equal(reasonOf('Tienes baloncesto a las 18:00, termina a las 19:30.', PLAIN, briefing), null)
  assert.equal(reasonOf('Tienes baloncesto a las 20:00.', PLAIN, briefing), 'invented_number')
})

test('equivalencias explicables: decimal redondeado, segundos en minutos, signo y coma decimal', () => {
  const briefing = { load: { value: 67.6 }, lastSession: { durationSeconds: 3600 }, week: { performancePercent: -12 }, recovery: { known: true, sleepHours: 7.5 } }
  assert.equal(reasonOf('Tu carga está en 68.', PLAIN, briefing), null)
  assert.equal(reasonOf('Tu carga está en 67,6.', PLAIN, briefing), null)
  assert.equal(reasonOf('Tu última sesión duró 60 minutos.', PLAIN, briefing), null)
  assert.equal(reasonOf('Rindes un 12 % menos que la semana pasada.', PLAIN, briefing), null)
  assert.equal(reasonOf('Dormiste 7,5 horas.', PLAIN, briefing), null)
  assert.equal(reasonOf('Tu carga está en 70.', PLAIN, briefing), 'invented_number')
})

test('las referencias de escala no son datos, pero solo en su forma exacta', () => {
  assert.equal(reasonOf('Tu recuperación está en 84/100.'), null)
  assert.equal(reasonOf('Tu recuperación está en 84 de 100.'), null)
  assert.equal(reasonOf('Llevas 6/8 vasos.', PLAIN, { recovery: { hydrationGlasses: 6 } }), null)
  assert.equal(reasonOf('Llevas 6 de 8 vasos.', PLAIN, { recovery: { hydrationGlasses: 6 } }), null)
  // Un 100 o un 8 sueltos siguen teniendo que estar respaldados.
  assert.equal(reasonOf('Tu recuperación está en 100.'), 'invented_number')
  assert.equal(reasonOf('Haz 8 repeticiones.'), 'invented_number')
})

test('los ids y las marcas de tiempo del briefing no respaldan cifras', () => {
  const briefing = {
    proposal: { alternatives: [{ id: '1ea9100a-27b2-4a97-a666-d6a297bd4c67', label: 'Más ligera' }] },
    reportedLoads: [{ messageId: 'msg-91', reportedAt: '2026-09-07T09:15:00.000Z', quote: 'bici' }],
  }
  assert.equal(reasonOf('Tu recuperación está en 91.', PLAIN, briefing), 'invented_number')
  assert.equal(reasonOf('Son las 9:15.', PLAIN, briefing), 'invented_number')
})

// ---------------------------------------------------------------------------
// Fondo: lo que se afirma del usuario
// ---------------------------------------------------------------------------

/** La respuesta real del motor al pedir una zona sin historial registrado (D-016). */
const WANT_NO_HISTORY: DomainAnswerForSafety = {
  text: 'No tengo registrada ninguna sesión estos días que haya cargado esa zona. Cambio a «la sesión que te recomendaba».',
  intent: 'change',
  verdict: 'accept',
  proposedTarget: null,
}

test('el caso de producción: «esa zona no la has tocado estos días» sin respaldo se rechaza', () => {
  assert.equal(
    reasonOf('Se puede: esa zona no la has tocado estos días. Cambio a la sesión que te recomendaba.', PLAIN, {}),
    'unsupported_claim',
  )
  // Aunque el dominio hable de «estos días», el modelo no puede afirmar que no la ha tocado.
  for (const text of [
    'Se puede: esa zona no la has tocado estos días. Cambio a la sesión que te recomendaba.',
    'No has entrenado esa zona estos días, así que cambio a la sesión que te recomendaba.',
    'Esa zona está libre estos días. Cambio a la sesión que te recomendaba.',
    'Llevas estos días sin cargar esa zona. Cambio a la sesión que te recomendaba.',
  ]) {
    assert.equal(reasonOf(text, WANT_NO_HISTORY, {}), 'unsupported_claim', text)
  }
  // Repetir lo que sí dice el dominio pasa.
  assert.equal(
    reasonOf('No tengo registrada ninguna sesión estos días que haya cargado esa zona, así que cambio a la sesión que te recomendaba.', WANT_NO_HISTORY, {}),
    null,
  )
})

test('historial: lo que el modelo añade sobre sesiones pasadas se rechaza', () => {
  for (const text of [
    'Hoy toca tren inferior porque ayer entrenaste tren superior.',
    'Hoy toca tren inferior: no has entrenado piernas esta semana.',
    'Hoy toca tren inferior: llevas tres días sin cargar piernas.',
    'Hoy toca tren inferior, ya has trabajado el resto hace poco.',
    'Hoy toca tren inferior: la sesión que hiciste fue suave.',
  ]) {
    assert.equal(reasonOf(text, PLAIN, {}), 'unsupported_claim', text)
  }
  // Si el dominio ya lo afirma, el modelo puede decirlo con sus palabras.
  const backed: DomainAnswerForSafety = { ...PLAIN, text: 'Hoy toca tren inferior: ya llevas pecho trabajado estos días.' }
  assert.equal(reasonOf('Hoy toca tren inferior, porque el pecho ya lo has trabajado estos días.', backed, {}), null)
})

test('la última sesión y la comparación semanal pasan si el briefing las tiene registradas', () => {
  assert.equal(reasonOf('Tu última sesión fue de tren superior.', PLAIN, {}), 'unsupported_claim')
  assert.equal(reasonOf('Tu última sesión fue de tren superior.', PLAIN, { lastSession: { focus: 'tren_superior' } }), null)
  assert.equal(reasonOf('Rindes menos que la semana pasada.', PLAIN, { week: { performancePercent: null } }), 'unsupported_claim')
  assert.equal(reasonOf('Rindes menos que la semana pasada.', PLAIN, { week: { performancePercent: -5 } }), null)
})

test('recuperación: el sueño solo si está registrado, el estado solo si lo dice el dominio', () => {
  assert.equal(reasonOf('Hoy toca tren inferior: dormiste bien.', PLAIN, { recovery: { known: false } }), 'unsupported_claim')
  assert.equal(reasonOf('Hoy toca tren inferior: dormiste 9 horas.', PLAIN, { recovery: { known: true, sleepHours: 9 } }), null)
  for (const text of ['Hoy toca tren inferior aunque estás cansado.', 'Hoy toca tren inferior: te sientes con fuerza.', 'Hoy toca tren inferior, tienes energía de sobra.']) {
    assert.equal(reasonOf(text, PLAIN, { recovery: { known: true, value: 84, sleepHours: 9 } }), 'unsupported_claim', text)
  }
})

test('molestias: el modelo no puede atribuir dolor ni molestias al usuario', () => {
  for (const text of ['Hoy toca tren superior, que no te duele.', 'Evitamos piernas por esa molestia.', 'Con esas agujetas mejor tren superior.', 'Hay algo de sobrecarga en la espalda.']) {
    assert.equal(reasonOf(text, PLAIN, {}), 'unsupported_claim', text)
  }
  // «lesión» sigue siendo lenguaje médico, que se rechaza siempre.
  assert.equal(reasonOf('Parece una lesión de rodilla.', PLAIN, {}), 'medical_language')
})

test('preferencias: el modelo no puede atribuir gustos al usuario', () => {
  for (const text of ['Hoy toca tren superior, que es lo que prefieres.', 'Sé que te gusta el tren superior.', 'Como siempre, empezamos por empuje.', 'Sueles rendir mejor por la tarde.']) {
    assert.equal(reasonOf(text, PLAIN, {}), 'unsupported_claim', text)
  }
  // Lo que prefiere AXIS no es una afirmación sobre el usuario.
  assert.equal(reasonOf('Prefiero una sesión corta hecha que una larga a medias.', PLAIN, {}), null)
})

test('con un briefing real, las cifras del propio briefing pasan y una inventada no', () => {
  const context = buildAxisContext({
    profile: {
      id: 'primary', name: 'Alex', age: 15, heightCm: 175, weightKg: 68, goals: ['fuerza'], experience: 'intermedio',
      availableWeekdays: [0, 1, 2, 3, 4, 5, 6], typicalSessionMinutes: 60,
      createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
    },
    recoveryInputs: { dayKey: '2026-09-07', sleepHours: 9, energy: 4, muscleFatigue: 2, stress: 2, hydrationGlasses: 6, updatedAt: '2026-09-07T08:00:00.000Z' },
    recentSessions: [],
    activities: [],
    now: new Date(2026, 8, 7, 10, 0),
  })
  const briefing = buildBriefing(context, decide(context), [])
  assert.equal(briefing.recovery.known, true)
  const score = briefing.recovery.known ? briefing.recovery.value : -1

  assert.equal(reasonOf(`Tu recuperación está en ${score}/100 y dormiste 9 horas.`, PLAIN, briefing), null)
  assert.equal(reasonOf(`Tu recuperación está en ${score + 7}.`, PLAIN, briefing), 'invented_number')
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
