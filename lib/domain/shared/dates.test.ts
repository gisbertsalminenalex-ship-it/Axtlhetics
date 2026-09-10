import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addMonths,
  addYears,
  daysInMonth,
  endOfMonth,
  endOfYear,
  formatMonthName,
  formatYearName,
  monthDayKeys,
  startOfMonth,
  startOfYear,
  yearMonthKeys,
} from './dates'

// ---------------------------------------------------------------------------
// Límites de mes
// ---------------------------------------------------------------------------

test('el mes empieza el día 1 y acaba el último, sea cual sea el día de partida', () => {
  assert.equal(startOfMonth('2026-09-17'), '2026-09-01')
  assert.equal(endOfMonth('2026-09-17'), '2026-09-30')
  assert.equal(startOfMonth('2026-01-01'), '2026-01-01')
  assert.equal(endOfMonth('2026-12-31'), '2026-12-31')
})

test('cada mes tiene los días que le tocan, incluidos los bisiestos', () => {
  assert.equal(daysInMonth('2026-01-15'), 31)
  assert.equal(daysInMonth('2026-04-15'), 30)
  assert.equal(daysInMonth('2026-02-15'), 28)
  // 2028 es bisiesto; 2100 no lo es pese a ser múltiplo de 4.
  assert.equal(daysInMonth('2028-02-15'), 29)
  assert.equal(daysInMonth('2100-02-15'), 28)
})

test('el mes se enumera entero, del 1 al último día', () => {
  const septiembre = monthDayKeys('2026-09-17')
  assert.equal(septiembre.length, 30)
  assert.equal(septiembre[0], '2026-09-01')
  assert.equal(septiembre.at(-1), '2026-09-30')

  const febreroBisiesto = monthDayKeys('2028-02-01')
  assert.equal(febreroBisiesto.length, 29)
  assert.equal(febreroBisiesto.at(-1), '2028-02-29')
})

test('los días del mes son consecutivos y sin huecos', () => {
  for (const anyDay of ['2026-01-10', '2026-02-10', '2028-02-10', '2026-12-10']) {
    const keys = monthDayKeys(anyDay)
    keys.forEach((key, index) => {
      const day = Number(key.split('-')[2])
      assert.equal(day, index + 1, `${anyDay}: el punto ${index} debería ser el día ${index + 1}`)
    })
    assert.equal(new Set(keys).size, keys.length, `${anyDay}: hay días repetidos`)
  }
})

// ---------------------------------------------------------------------------
// Límites de año
// ---------------------------------------------------------------------------

test('el año va del 1 de enero al 31 de diciembre', () => {
  assert.equal(startOfYear('2026-09-17'), '2026-01-01')
  assert.equal(endOfYear('2026-09-17'), '2026-12-31')
})

test('el año se enumera con sus doce meses, empezando por enero', () => {
  const meses = yearMonthKeys('2026-09-17')
  assert.equal(meses.length, 12)
  assert.equal(meses[0], '2026-01-01')
  assert.equal(meses[11], '2026-12-01')
})

// ---------------------------------------------------------------------------
// Desplazamientos: el caso que rompe con Date a pelo
// ---------------------------------------------------------------------------

test('restar un mes al día 31 cae en el último día del mes corto, no se desborda', () => {
  // Sin recorte, `Date` convertiría el 31 de febrero en el 3 de marzo.
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28')
  assert.equal(addMonths('2028-03-31', -1), '2028-02-29')
  assert.equal(addMonths('2026-05-31', -1), '2026-04-30')
})

test('desplazar meses conserva el día cuando cabe', () => {
  assert.equal(addMonths('2026-09-17', -1), '2026-08-17')
  assert.equal(addMonths('2026-09-17', 1), '2026-10-17')
})

test('desplazar meses cruza el cambio de año', () => {
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15')
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15')
})

test('el 29 de febrero retrocede al 28 en un año no bisiesto', () => {
  assert.equal(addYears('2028-02-29', -1), '2027-02-28')
  assert.equal(addYears('2026-09-17', -1), '2025-09-17')
})

// ---------------------------------------------------------------------------
// Nombres del periodo
// ---------------------------------------------------------------------------

test('el periodo se nombra en castellano', () => {
  assert.equal(formatMonthName('2026-09-17'), 'Septiembre de 2026')
  assert.equal(formatMonthName('2026-01-01'), 'Enero de 2026')
  assert.equal(formatYearName('2026-09-17'), '2026')
})
