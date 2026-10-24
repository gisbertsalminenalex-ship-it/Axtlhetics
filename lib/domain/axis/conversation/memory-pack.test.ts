import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyDayMemory, type AxisDayMemory } from '../memory'
import type { UserProfile } from '../../profile/types'
import { EXERCISE_CATALOG } from '../../workouts/catalog'
import type { WorkoutSession } from '../../workouts/types'
import { buildAiMemory, MEMORY_DAYS, MEMORY_MESSAGES_PER_DAY, type AxisAiMemoryInput } from './memory-pack'

const TODAY = '2026-10-24'

function day(dayKey: string, said: string[], extra: Partial<AxisDayMemory> = {}): AxisDayMemory {
  return {
    ...emptyDayMemory(dayKey),
    messages: said.map((text, index) => ({ id: `${dayKey}-${index}`, role: 'user' as const, text, createdAt: `${dayKey}T10:00:00.000Z` })),
    ...extra,
  }
}

function session(dayKey: string): WorkoutSession {
  return {
    id: `s-${dayKey}`, dayKey, startedAt: `${dayKey}T18:00:00.000Z`, completedAt: `${dayKey}T18:45:00.000Z`, durationSeconds: 2700,
    focus: 'tren_superior', title: 'Tren superior', intensity: 'moderada', muscleGroups: ['pecho'], exercises: [], totalVolumeKg: 0,
    status: 'completed', perceivedEffort: 7, proposal: null, modifications: [], notes: null,
  }
}

const base: AxisAiMemoryInput = {
  today: TODAY,
  name: 'Alex',
  pastDays: [],
  sessions: [],
  profile: null,
  catalog: EXERCISE_CATALOG,
  nutrition: null,
  weeklyReview: null,
  scan: null,
  assessments: [],
}

test('D-070: recuerda lo que dijo los días anteriores, sin su nombre, recortado y solo los últimos días', () => {
  const memory = buildAiMemory({
    ...base,
    pastDays: [
      day('2026-10-22', ['Hola', 'Ayer me fue fatal en el examen, Alex está cansado', 'Hoy no puedo entrenar', 'Mañana sí']),
      day('2026-10-23', [], { discomforts: [{ zone: 'rodilla', at: '2026-10-23T10:00:00.000Z' }] }),
      day('2026-10-10', ['Esto es muy antiguo']),
      day(TODAY, ['Esto es de hoy: va en el historial, no aquí']),
      day('2026-10-21', []),
    ],
  })
  assert.deepEqual(memory.recentDays.map((d) => d.dayKey), ['2026-10-23', '2026-10-22'], 'del más reciente al más antiguo, sin hoy, sin lo antiguo ni lo vacío')
  assert.deepEqual(memory.recentDays[0].discomforts, ['rodilla'])
  const said = memory.recentDays[1].said
  assert.equal(said.length, MEMORY_MESSAGES_PER_DAY)
  assert.equal(said[0], 'Ayer me fue fatal en el examen, {nombre} está cansado')
  assert.ok(MEMORY_DAYS >= 5)
})

test('D-070: sesiones, objetivos, lo aprendido y la alimentación de hoy, con las cifras de la app', () => {
  const profile = { goals: ['hipertrofia'], dislikedExercises: ['plancha'], careZones: ['rodilla'] } as unknown as UserProfile
  const memory = buildAiMemory({
    ...base,
    profile,
    sessions: [session('2026-10-23'), session('2026-09-01')],
    nutrition: {
      targets: { kcal: 2600, maintenanceKcal: 2400, proteinGrams: [110, 140], fatGrams: [60, 90], carbsGrams: [300, 380] } as never,
      todayMeals: [{ id: 'm1', kind: 'desayuno', kcal: 500, proteinG: 30, carbsG: 60, fatG: 15, createdAt: `${TODAY}T08:00:00.000Z` } as never],
    },
  })
  assert.deepEqual(memory.recentSessions, [{ dayKey: '2026-10-23', title: 'Tren superior', minutes: 45, effort: 7 }])
  assert.equal(memory.goals.length, 1)
  assert.equal(memory.learned.dislikedExercises[0], EXERCISE_CATALOG.find((e) => e.id === 'plancha')?.name)
  assert.equal(memory.learned.careZones.length, 1)
  assert.deepEqual(memory.nutrition, { todayKcal: 500, todayProteinG: 30, meals: 1, targetKcal: 2600, targetProteinG: [110, 140] })
})

test('D-070: del escáner solo el resumen; nada de fotos ni medidas', () => {
  const memory = buildAiMemory({
    ...base,
    scan: {
      dayKey: '2026-10-20',
      index: 74,
      overview: 'Tu físico: complexión mesomorfa.',
      strongZones: ['hombros'],
      weakZones: ['piernas'],
      priority: null,
      improvements: ['Más desarrollo en piernas'],
      actions: ['Dar prioridad a piernas'],
      comparison: null,
      plan: 'priorizo piernas y glúteos',
    },
  })
  assert.deepEqual(Object.keys(memory.scan ?? {}).sort(), ['dayKey', 'improvements', 'overview', 'plan', 'strongZones', 'weakZones'])
  assert.doesNotMatch(JSON.stringify(memory), /data:image|measurements|thumbnails/)
})
