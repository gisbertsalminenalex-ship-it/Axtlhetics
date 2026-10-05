import assert from 'node:assert/strict'
import test from 'node:test'

import { completed, started } from '../assessment/test-fixtures'
import { emptyDayMemory } from '../axis/memory'
import { PRIMARY_PROFILE_ID, type ScheduledActivity, type UserProfile } from '../profile/types'
import type { RecoveryInputs } from '../recovery/types'
import type { WorkoutSession } from '../workouts/types'
import {
  BACKUP_KIND,
  BACKUP_SCHEMA,
  backupFileName,
  buildBackup,
  countsOf,
  isEmptyBackup,
  parseBackup,
  type BackupContents,
} from './backup'

const NOW = '2026-09-22T10:00:00.000Z'

const profile: UserProfile = {
  id: PRIMARY_PROFILE_ID,
  name: 'Alex',
  age: 16,
  heightCm: 175,
  weightKg: 68,
  goals: ['fuerza'],
  experience: 'principiante',
  availableWeekdays: [0, 2, 4],
  typicalSessionMinutes: 45,
  createdAt: NOW,
  updatedAt: NOW,
}

const activity: ScheduledActivity = {
  id: 'act-1',
  name: 'Baloncesto',
  weekday: 2,
  startMinute: 1200,
  endMinute: 1320,
  intensity: 'alta',
  loadsMuscleGroups: ['piernas'],
  createdAt: NOW,
  updatedAt: NOW,
}

const recovery: RecoveryInputs = {
  dayKey: '2026-09-22',
  sleepHours: 8,
  energy: 4,
  muscleFatigue: 2,
  stress: 2,
  hydrationGlasses: 5,
  updatedAt: NOW,
}

const session: WorkoutSession = {
  id: 'ses-1',
  dayKey: '2026-09-21',
  startedAt: '2026-09-21T18:00:00.000Z',
  completedAt: '2026-09-21T18:45:00.000Z',
  durationSeconds: 2700,
  focus: 'tren_superior',
  title: 'Fuerza · Tren superior',
  intensity: 'moderada',
  muscleGroups: ['pecho', 'espalda'],
  exercises: [
    { exerciseId: 'flexiones-inclinadas', name: 'Flexiones inclinadas', sets: [{ reps: 10, weightKg: null, completed: true }] },
  ],
  totalVolumeKg: 0,
  status: 'completed',
  perceivedEffort: 4,
  proposal: null,
  modifications: [],
  notes: null,
}

function fullContents(): BackupContents {
  return {
    profile,
    activities: [activity],
    recovery: [recovery],
    sessions: [session],
    axisMemory: [emptyDayMemory('2026-09-22', NOW)],
    assessments: [completed('2026-09-20')],
  }
}

/** Un archivo como el que se descarga, pasado por JSON como pasaría de verdad. */
function roundTrip(contents: BackupContents): unknown {
  return JSON.parse(JSON.stringify(buildBackup(contents, { exportedAt: NOW, appSchema: 7 })))
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

test('la copia lleva marca, versión y fecha', () => {
  const backup = buildBackup(fullContents(), { exportedAt: NOW, appSchema: 7 })
  assert.equal(backup.kind, BACKUP_KIND)
  assert.equal(backup.schema, BACKUP_SCHEMA)
  assert.equal(backup.exportedAt, NOW)
  assert.equal(backup.appSchema, 7)
})

test('el nombre del archivo lleva el día delante', () => {
  assert.equal(backupFileName(NOW), 'axtlhetics-2026-09-22.json')
})

test('un `exportedAt` que no es una fecha no produce un nombre roto', () => {
  assert.equal(backupFileName(''), 'axtlhetics-copia.json')
  assert.equal(backupFileName('ayer'), 'axtlhetics-copia.json')
})

test('el recuento distingue no tener perfil de no tener sesiones', () => {
  const counts = countsOf({ ...fullContents(), profile: null, sessions: [] })
  assert.equal(counts.profile, false)
  assert.equal(counts.sessions, 0)
  assert.equal(counts.activities, 1)
})

test('una copia sin absolutamente nada se reconoce como vacía', () => {
  const empty: BackupContents = {
    profile: null,
    activities: [],
    recovery: [],
    sessions: [],
    axisMemory: [],
    assessments: [],
  }
  assert.equal(isEmptyBackup(countsOf(empty)), true)
  assert.equal(isEmptyBackup(countsOf(fullContents())), false)
})

// ---------------------------------------------------------------------------
// Importar: la vuelta completa
// ---------------------------------------------------------------------------

test('lo exportado se vuelve a leer igual', () => {
  const result = parseBackup(roundTrip(fullContents()))
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.contents, fullContents())
  assert.equal(result.discarded, 0)
  assert.equal(result.exportedAt, NOW)
  assert.deepEqual(result.counts, {
    profile: true,
    activities: 1,
    recovery: 1,
    sessions: 1,
    axisMemory: 1,
    assessments: 1,
  })
})

// ---------------------------------------------------------------------------
// Importar: envoltura
// ---------------------------------------------------------------------------

test('lo que no es una copia de AXTHLETICS se rechaza entero', () => {
  for (const value of [null, 42, 'texto', [], {}, { kind: 'otra-app', schema: 1, data: {} }]) {
    const result = parseBackup(value)
    assert.equal(result.ok, false, `debería rechazar ${JSON.stringify(value)}`)
  }
})

test('una copia de una versión futura no se interpreta a medias', () => {
  const future = { ...(roundTrip(fullContents()) as object), schema: BACKUP_SCHEMA + 1 }
  const result = parseBackup(future)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'version_desconocida')
})

test('una copia válida pero sin nada dentro se rechaza en vez de borrarlo todo', () => {
  /*
   * Importante: sin esto, importar una copia vacía pasaría la validación y
   * `replaceAll` dejaría el dispositivo en blanco. Es el peor resultado posible
   * de una función cuyo objetivo es no perder datos.
   */
  const result = parseBackup({
    kind: BACKUP_KIND,
    schema: BACKUP_SCHEMA,
    exportedAt: NOW,
    appSchema: 7,
    data: { profile: null, activities: [], recovery: [], sessions: [], axisMemory: [] },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'sin_datos')
})

// ---------------------------------------------------------------------------
// Importar: registros dañados
// ---------------------------------------------------------------------------

test('un registro corrupto se descarta y el resto se importa', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.sessions = [session, { id: 'roto' }, { ...session, id: 'ses-2' }]

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.counts.sessions, 2, 'las dos buenas entran')
  assert.equal(result.discarded, 1, 'y la mala se cuenta')
})

test('un perfil corrupto no arrastra al historial', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.profile = { id: 'primary', name: 'Alex' }

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.contents.profile, null)
  assert.equal(result.counts.sessions, 1)
  assert.equal(result.discarded, 1)
})

test('una escala imposible descarta ese día de recuperación, no el archivo', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.recovery = [{ ...recovery, energy: 9 }, { ...recovery, dayKey: '2026-09-20' }]

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.counts.recovery, 1)
  assert.equal(result.contents.recovery[0].dayKey, '2026-09-20')
  assert.equal(result.discarded, 1)
})

test('una lista que no es una lista no rompe la lectura', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.activities = 'no soy una lista'

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.counts.activities, 0)
})

// ---------------------------------------------------------------------------
// Actividades con fecha (D-018)
// ---------------------------------------------------------------------------

test('una copia antigua, con actividades sin `date`, se importa entera', () => {
  const file = roundTrip(fullContents()) as { data: { activities: Record<string, unknown>[] } }
  assert.equal('date' in file.data.activities[0], false, 'como las escribía la versión anterior')

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.discarded, 0)
  assert.equal(result.counts.activities, 1)
  assert.equal(result.contents.activities[0].date ?? null, null, 'sigue siendo recurrente')
})

test('una copia nueva conserva la fecha de un partido', () => {
  const match: ScheduledActivity = { ...activity, id: 'match-1', name: 'Partido', weekday: 5, date: '2026-09-26' }
  const contents = { ...fullContents(), activities: [activity, match] }

  const result = parseBackup(roundTrip(contents))
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.contents.activities, [activity, match])
  assert.equal(result.discarded, 0)
})

test('una actividad con una fecha que no es un día local se descarta sola', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.activities = [activity, { ...activity, id: 'act-2', date: '2026-09-26T10:00:00.000Z' }]

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.counts.activities, 1)
  assert.equal(result.discarded, 1)
})

// ---------------------------------------------------------------------------
// Sesiones con esfuerzo y objetivo (D-019)
// ---------------------------------------------------------------------------

test('una copia antigua, sin esfuerzo ni objetivos en sus sesiones, se importa entera', () => {
  const file = roundTrip(fullContents()) as { data: { sessions: Record<string, unknown>[] } }
  assert.equal('effort' in file.data.sessions[0], false)

  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.discarded, 0)
  assert.equal(result.counts.sessions, 1)
})

test('una copia nueva conserva el esfuerzo y el objetivo de cada ejercicio', () => {
  const rated: WorkoutSession = {
    ...session,
    id: 'ses-2',
    effort: 4,
    exercises: [{ ...session.exercises[0], targetSets: 3, targetReps: 10 }],
  }
  const result = parseBackup(roundTrip({ ...fullContents(), sessions: [session, rated] }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.contents.sessions, [session, rated])
  assert.equal(result.discarded, 0)
})

test('un esfuerzo fuera de escala o un objetivo negativo descartan solo esa sesión', () => {
  const file = roundTrip(fullContents()) as { data: Record<string, unknown> }
  file.data.sessions = [
    session,
    { ...session, id: 'ses-2', effort: 9 },
    { ...session, id: 'ses-3', exercises: [{ ...session.exercises[0], targetSets: -1 }] },
  ]
  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.counts.sessions, 1)
  assert.equal(result.discarded, 2)
})

// ---------------------------------------------------------------------------
// Schema 2: tests de evolución (D-021)
// ---------------------------------------------------------------------------

/** Una copia exportada por la versión anterior: schema 1 y sin `assessments`. */
function schemaOneFile(): Record<string, unknown> {
  const file = roundTrip(fullContents()) as { schema: number; data: Record<string, unknown> }
  delete file.data.assessments
  return { ...file, schema: 1 }
}

test('las copias nuevas son de schema 2', () => {
  assert.equal(BACKUP_SCHEMA, 2)
  assert.equal(buildBackup(fullContents(), { exportedAt: NOW, appSchema: 8 }).schema, 2)
})

test('una copia de schema 1 se sigue importando entera, sin tests', () => {
  const result = parseBackup(schemaOneFile())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.contents.assessments, [])
  assert.equal(result.discarded, 0, 'que falte la lista no es descartar nada')
  assert.deepEqual(result.contents.sessions, fullContents().sessions)
  assert.deepEqual(result.contents.axisMemory, fullContents().axisMemory)
  assert.equal(result.counts.assessments, 0)
})

test('los tests de evolución hacen el viaje completo: completados, interrumpidos y en curso', () => {
  const interrupted = { ...started('2026-09-25'), status: 'interrupted' as const, endedAt: '2026-09-25T18:30:00.000Z' }
  const contents = { ...fullContents(), assessments: [completed('2026-09-20'), interrupted, started('2026-09-26')] }
  const result = parseBackup(roundTrip(contents))
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.contents.assessments, contents.assessments)
})

test('un test roto se descarta y se cuenta; los demás datos entran', () => {
  const file = roundTrip(fullContents()) as { data: { assessments: unknown[] } }
  file.data.assessments.push({ id: 'roto', status: 'completed', results: [] })
  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.discarded, 1)
  assert.equal(result.contents.assessments.length, 1)
  assert.equal(result.contents.sessions.length, 1)
})

test('una copia con solo tests de evolución no cuenta como vacía', () => {
  const onlyTests: BackupContents = {
    profile: null,
    activities: [],
    recovery: [],
    sessions: [],
    axisMemory: [],
    assessments: [completed('2026-09-20')],
  }
  assert.equal(isEmptyBackup(countsOf(onlyTests)), false)
})

test('una copia de schema 3 no se interpreta a medias', () => {
  const result = parseBackup({ ...(roundTrip(fullContents()) as object), schema: 3 })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'version_desconocida')
})
