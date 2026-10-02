/**
 * Actividades recurrentes y de un día concreto (D-018).
 *
 * Un entrenamiento de un deporte se repite cada semana; un partido puede caer
 * en sábado una semana, en domingo la siguiente, o no haberlo. Lo segundo se
 * guarda con fecha, y la fecha manda sobre el día de la semana.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activityOccursOn,
  isDatedActivity,
  isScheduledActivity,
  sportsFromActivities,
  withActivityChanges,
  type ScheduledActivity,
} from './types'

const NOW = '2026-09-01T10:00:00.000Z'
const LATER = '2026-09-10T18:30:00.000Z'

// 2026-09-12 es sábado; 2026-09-13, domingo.
const SATURDAY = '2026-09-12'
const SUNDAY = '2026-09-13'

/** Un registro tal y como se guardaba antes de D-018: sin `date`. */
function legacyTraining(partial: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id: 'training-1',
    name: 'Baloncesto',
    weekday: 0,
    startMinute: null,
    endMinute: null,
    intensity: 'media',
    loadsMuscleGroups: ['piernas'],
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

function match(date: string, partial: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id: 'match-1',
    name: 'Partido',
    weekday: 5,
    date,
    startMinute: null,
    endMinute: null,
    intensity: 'alta',
    loadsMuscleGroups: ['piernas', 'gluteos'],
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Cuándo ocurre
// ---------------------------------------------------------------------------

test('una actividad recurrente ocurre cada semana en su día', () => {
  const training = legacyTraining({ weekday: 5 })
  assert.equal(activityOccursOn(training, SATURDAY), true)
  assert.equal(activityOccursOn(training, '2026-09-19'), true, 'el sábado siguiente también')
  assert.equal(activityOccursOn(training, SUNDAY), false)
})

test('un partido con fecha solo ocurre ese día, no cada semana', () => {
  const saturdayMatch = match(SATURDAY)
  assert.equal(activityOccursOn(saturdayMatch, SATURDAY), true)
  assert.equal(activityOccursOn(saturdayMatch, '2026-09-19'), false, 'el sábado siguiente no')
  assert.equal(activityOccursOn(saturdayMatch, SUNDAY), false)
})

test('la fecha manda sobre el día de la semana', () => {
  // Un registro incoherente —fecha de domingo, weekday de sábado— sigue la fecha.
  const inconsistent = match(SUNDAY, { weekday: 5 })
  assert.equal(activityOccursOn(inconsistent, SUNDAY), true)
  assert.equal(activityOccursOn(inconsistent, SATURDAY), false)
})

test('un registro sin `date` o con `date: null` es recurrente', () => {
  assert.equal(isDatedActivity(legacyTraining()), false)
  assert.equal(isDatedActivity(legacyTraining({ date: null })), false)
  assert.equal(isDatedActivity(match(SATURDAY)), true)
})

// ---------------------------------------------------------------------------
// Datos antiguos y comprobación de forma
// ---------------------------------------------------------------------------

test('los registros anteriores a D-018, sin `date`, siguen siendo válidos', () => {
  const stored = JSON.parse(JSON.stringify(legacyTraining()))
  assert.equal('date' in stored, false)
  assert.equal(isScheduledActivity(stored), true)
})

test('`date` puede ser null o una fecha local, y nada más', () => {
  assert.equal(isScheduledActivity(legacyTraining({ date: null })), true)
  assert.equal(isScheduledActivity(match(SATURDAY)), true)

  for (const bad of ['sábado', '2026-9-12', '2026-09-12T10:00:00.000Z', 20260912, true]) {
    assert.equal(
      isScheduledActivity({ ...match(SATURDAY), date: bad }),
      false,
      `date: ${JSON.stringify(bad)}`,
    )
  }
})

// ---------------------------------------------------------------------------
// Deportes
// ---------------------------------------------------------------------------

test('los deportes recurrentes no cuentan los partidos de un día', () => {
  const sports = sportsFromActivities([
    legacyTraining({ id: 't-0', weekday: 0 }),
    legacyTraining({ id: 't-2', weekday: 2 }),
    match(SATURDAY),
  ])

  assert.deepEqual(
    sports.map((sport) => sport.name),
    ['Baloncesto'],
    'el partido no se convierte en «un deporte que juegas los sábados»',
  )
  assert.deepEqual(sports[0].weekdays, [0, 2])
})

test('un partido con el mismo nombre que un entrenamiento no añade su día al deporte', () => {
  const sports = sportsFromActivities([
    legacyTraining({ weekday: 1 }),
    match(SATURDAY, { name: 'Baloncesto' }),
  ])
  assert.deepEqual(sports[0].weekdays, [1])
})

// ---------------------------------------------------------------------------
// Cambiar una actividad sin recrearla
// ---------------------------------------------------------------------------

test('cambiar la fecha de un partido conserva la actividad y alinea el día de la semana', () => {
  const original = match(SATURDAY)
  const moved = withActivityChanges(original, { date: SUNDAY }, LATER)

  assert.equal(moved.id, original.id, 'la misma actividad, no una nueva')
  assert.equal(moved.createdAt, original.createdAt)
  assert.equal(moved.updatedAt, LATER)
  assert.equal(moved.date, SUNDAY)
  assert.equal(moved.weekday, 6, 'domingo')
  assert.equal(activityOccursOn(moved, SUNDAY), true)
  assert.equal(activityOccursOn(moved, SATURDAY), false)
})

test('cambiar una actividad recurrente no la convierte en una de un día', () => {
  const original = legacyTraining()
  const changed = withActivityChanges(original, { intensity: 'alta' }, LATER)

  assert.equal(isDatedActivity(changed), false)
  assert.equal('date' in changed, false, 'no aparece una fecha que no tenía')
  assert.equal(changed.weekday, original.weekday)
  assert.equal(changed.intensity, 'alta')
})

test('el id y la fecha de alta no se pueden pisar al cambiar', () => {
  const original = match(SATURDAY)
  const changed = withActivityChanges(
    original,
    { id: 'otro', createdAt: LATER } as unknown as Parameters<typeof withActivityChanges>[1],
    LATER,
  )
  assert.equal(changed.id, original.id)
  assert.equal(changed.createdAt, original.createdAt)
})
