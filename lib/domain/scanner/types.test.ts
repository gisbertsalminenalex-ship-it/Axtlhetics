/**
 * Escaneos guardados (D-023): forma, validación y fotos que nunca viajan.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createMemoryRepositories } from '../../data/memory-repositories'
import { buildBackup, parseBackup, type BackupContents } from '../backup/backup'
import { isScanRecord, scanDue, sortScans, withoutThumbnails, type ScanRecord } from './types'

const THUMB = 'data:image/jpeg;base64,/9j/AAAA'

function scan(dayKey: string, patch: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: `scan-${dayKey}`,
    dayKey,
    createdAt: `${dayKey}T18:00:00.000Z`,
    protocolVersion: 1,
    selfReport: { build: 'media', strongZones: ['brazos'], weakZones: ['espalda'], priority: 'musculo' },
    measurements: { front: [{ shoulderTiltDeg: { value: 1.2 }, shoulderToWaist: { value: null, reason: 'no_silhouette' } }] },
    result: { index: 81, scores: { symmetry: 90, postureMobility: 75, proportion: null } },
    thumbnails: { front: THUMB },
    ...patch,
  }
}

const empty: BackupContents = { profile: null, activities: [], recovery: [], sessions: [], axisMemory: [], assessments: [], scans: [] }

test('un escaneo bien formado se acepta; uno raro, no', () => {
  assert.equal(isScanRecord(scan('2026-10-08')), true)
  assert.equal(isScanRecord({ ...scan('2026-10-08'), dayKey: 'ayer' }), false)
  assert.equal(isScanRecord({ ...scan('2026-10-08'), measurements: { espalda: [] } }), false, 'pose desconocida')
  assert.equal(isScanRecord({ ...scan('2026-10-08'), result: { index: 140, scores: {} } }), false, 'índice fuera de 0–100')
  assert.equal(isScanRecord({ ...scan('2026-10-08'), selfReport: { build: 'gorda', strongZones: [], weakZones: [], priority: null } }), false)
  assert.equal(isScanRecord({ ...scan('2026-10-08'), thumbnails: { front: 'https://otro.sitio/foto.jpg' } }), false, 'solo miniaturas locales')
})

test('del más reciente al más antiguo', () => {
  assert.deepEqual(sortScans([scan('2026-08-01'), scan('2026-10-08'), scan('2026-09-05')]).map((s) => s.dayKey), ['2026-10-08', '2026-09-05', '2026-08-01'])
})

test('la copia de seguridad lleva los resultados pero nunca las fotos (P-016)', async () => {
  const repositories = createMemoryRepositories()
  await repositories.scans.save(scan('2026-10-08'))
  assert.equal((await repositories.scans.list())[0].thumbnails?.front, THUMB, 'en el dispositivo sí están')

  const contents = await repositories.backup.readAll()
  assert.equal(contents.scans.length, 1)
  assert.equal('thumbnails' in contents.scans[0], false)
  assert.doesNotMatch(JSON.stringify(buildBackup(contents, { exportedAt: '2026-10-08T20:00:00.000Z', appSchema: 9 })), /data:image/)
})

test('importar una copia que trae fotos no las importa', () => {
  const file = JSON.parse(JSON.stringify(buildBackup({ ...empty, scans: [scan('2026-10-08')] }, { exportedAt: '2026-10-08T20:00:00.000Z', appSchema: 9 })))
  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.counts.scans, 1)
  assert.equal('thumbnails' in result.contents.scans[0], false)
  assert.deepEqual(result.contents.scans[0], withoutThumbnails(scan('2026-10-08')))
})

test('una copia de schema 2 se sigue importando: no trae escaneos y no se descarta nada', () => {
  const file = JSON.parse(JSON.stringify(buildBackup({ ...empty, scans: [] }, { exportedAt: '2026-10-08T20:00:00.000Z', appSchema: 8 })))
  file.schema = 2
  delete file.data.scans
  file.data.profile = null
  file.data.assessments = []
  // Con algo que restaurar.
  file.data.recovery = [{ dayKey: '2026-10-08', sleepHours: 8, energy: 4, muscleFatigue: 2, stress: 2, hydrationGlasses: 5, updatedAt: '2026-10-08T08:00:00.000Z' }]
  const result = parseBackup(file)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.contents.scans, [])
  assert.equal(result.discarded, 0)
})

test('importar reemplaza: una copia sin escaneos deja el dispositivo sin escaneos', async () => {
  const repositories = createMemoryRepositories()
  await repositories.scans.save(scan('2026-10-08'))
  await repositories.backup.replaceAll(empty)
  assert.deepEqual(await repositories.scans.list(), [])
})

test('cuándo toca el escáner: el primero, a los 28 días, o todavía no', () => {
  assert.deepEqual(scanDue([], '2026-10-08'), { kind: 'first' })
  const recent = scanDue([scan('2026-10-01')], '2026-10-08')
  assert.equal(recent.kind, 'recent')
  if (recent.kind === 'recent') assert.equal(recent.nextDay, '2026-10-29')
  assert.equal(scanDue([scan('2026-09-10'), scan('2026-08-01')], '2026-10-08').kind, 'due')
})

test('el sexo para la fórmula y la grasa estimada se guardan; los escaneos anteriores, sin ellos, siguen valiendo', () => {
  const withFat = scan('2026-10-14', {
    selfReport: { build: 'media', strongZones: [], weakZones: [], priority: 'musculo', sex: 'hombre' },
    result: { index: 70, scores: {}, bodyFatPct: 16.4 },
  })
  assert.equal(isScanRecord(withFat), true)
  assert.equal(isScanRecord(scan('2026-10-08')), true, 'sin sexo ni grasa')
  assert.equal(isScanRecord({ ...withFat, selfReport: { ...withFat.selfReport, sex: 'otro' } }), false)
  assert.equal(isScanRecord({ ...withFat, result: { ...withFat.result, bodyFatPct: 140 } }), false)
})
