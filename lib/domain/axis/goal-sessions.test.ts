/**
 * Los objetivos en la conversación (D-047): pedir cardio lleva a los intervalos,
 * y no quererlo lleva a otra cosa.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { UserProfile } from '../profile/types'
import { buildBriefing } from './briefing'
import { buildAxisContext } from './context'
import { answerFromBriefing } from './conversation/deterministic'
import { decide } from './engine'

const MONDAY = new Date(2026, 8, 7, 10, 0)
const CHANGE_MODE = { lastIntent: null, changeMode: true, lastChangeRequest: null }

function profile(goals: UserProfile['goals']): UserProfile {
  return {
    id: 'primary',
    name: 'Alex',
    age: 15,
    heightCm: 175,
    weightKg: 68,
    goals,
    experience: 'intermedio',
    availableWeekdays: [0, 2, 4],
    typicalSessionMinutes: 45,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  }
}

function setup(goals: UserProfile['goals']) {
  const context = buildAxisContext({
    profile: profile(goals),
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
    now: MONDAY,
  })
  const decision = decide(context)
  return { decision, briefing: buildBriefing(context, decision, [], decision.primary, null, [], null) }
}

test('«hoy quiero cardio» propone la sesión de acondicionamiento', () => {
  const { briefing, decision } = setup(['fuerza'])
  assert.notEqual(decision.primary.session?.focus, 'acondicionamiento')
  const answer = answerFromBriefing('hoy quiero hacer cardio', briefing, CHANGE_MODE)
  assert.equal(answer.proposedTarget?.focus, 'acondicionamiento')
})

test('con la resistencia de hoy, «no quiero cardio» propone otra sesión', () => {
  const { briefing, decision } = setup(['resistencia'])
  assert.equal(decision.primary.session?.focus, 'acondicionamiento')
  const answer = answerFromBriefing('hoy no quiero hacer cardio', briefing, CHANGE_MODE)
  assert.ok(answer.proposedTarget, answer.text)
  assert.notEqual(answer.proposedTarget?.focus, 'acondicionamiento')
})
