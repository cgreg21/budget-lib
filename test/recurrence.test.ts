import { describe, expect, it } from 'vitest'
import {
  MAX_OCCURRENCES,
  MIN_OCCURRENCES,
  appliesTo,
  endMonth,
  isRecurrenceFrequency,
  isRecurrenceList,
  missingOccurrences,
  occurrenceDate,
  occurrenceOf,
  recurrenceFromTransaction,
  recurrencesFor,
  sortRecurrences,
  type Recurrence,
} from '../src/recurrence.js'
import type { Transaction } from '../src/transaction.js'

const makeRecurrence = (overrides: Partial<Recurrence> = {}): Recurrence => ({
  id: 'r1',
  description: 'Loyer',
  category: 'Logement',
  kind: 'expense',
  amount: 800,
  day: 1,
  frequency: 'monthly',
  startMonth: '2026-01',
  ...overrides,
})

describe('isRecurrenceFrequency', () => {
  it('accepts known frequencies', () => {
    expect(isRecurrenceFrequency('monthly')).toBe(true)
    expect(isRecurrenceFrequency('quarterly')).toBe(true)
    expect(isRecurrenceFrequency('yearly')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isRecurrenceFrequency('weekly')).toBe(false)
    expect(isRecurrenceFrequency(undefined)).toBe(false)
  })
})

describe('isRecurrenceList', () => {
  it('accepts a valid list, including empty', () => {
    expect(isRecurrenceList([])).toBe(true)
    expect(isRecurrenceList([makeRecurrence()])).toBe(true)
  })

  it('rejects a malformed entry', () => {
    expect(isRecurrenceList([{ ...makeRecurrence(), day: 40 }])).toBe(false)
  })

  it('rejects an entry that is not an object', () => {
    expect(isRecurrenceList(['nope'])).toBe(false)
    expect(isRecurrenceList([null])).toBe(false)
  })

  it.each([
    ['id', { id: 1 }],
    ['description', { description: null }],
    ['category', { category: 7 }],
    ['kind', { kind: 'other' }],
    ['amount', { amount: '800' }],
    ['non-finite amount', { amount: Number.POSITIVE_INFINITY }],
    ['non-integer day', { day: 1.5 }],
    ['day below the first one', { day: 0 }],
    ['day past the last one', { day: 32 }],
    ['frequency', { frequency: 'weekly' }],
    ['start month', { startMonth: '2026-13' }],
    ['non-integer occurrences', { occurrences: 2.5 }],
    ['non-numeric occurrences', { occurrences: 'trois' }],
  ])('rejects a wrong %s', (_field, override) => {
    expect(isRecurrenceList([{ ...makeRecurrence(), ...override }])).toBe(false)
  })

  it('rejects a non-array', () => {
    expect(isRecurrenceList({})).toBe(false)
  })

  it('accepts an occurrences count at the minimum', () => {
    expect(isRecurrenceList([makeRecurrence({ occurrences: MIN_OCCURRENCES })])).toBe(true)
  })

  it('rejects an occurrences count below the minimum', () => {
    expect(isRecurrenceList([makeRecurrence({ occurrences: 0 })])).toBe(false)
  })
})

describe('sortRecurrences', () => {
  it('orders recurrences alphabetically by description', () => {
    const recurrences = [
      makeRecurrence({ id: '1', description: 'Loyer' }),
      makeRecurrence({ id: '2', description: 'Assurance' }),
      makeRecurrence({ id: '3', description: 'Électricité' }),
    ]

    expect(sortRecurrences(recurrences).map((r) => r.description)).toEqual([
      'Assurance',
      'Électricité',
      'Loyer',
    ])
  })
})

describe('appliesTo', () => {
  it('is false before the start month', () => {
    expect(appliesTo(makeRecurrence({ startMonth: '2026-03' }), '2026-02')).toBe(false)
  })

  it('is true on the start month', () => {
    expect(appliesTo(makeRecurrence({ startMonth: '2026-03' }), '2026-03')).toBe(true)
  })

  it('respects the frequency interval', () => {
    const recurrence = makeRecurrence({ frequency: 'quarterly', startMonth: '2026-01' })
    expect(appliesTo(recurrence, '2026-03')).toBe(false)
    expect(appliesTo(recurrence, '2026-04')).toBe(true)
  })

  it('stops once the occurrence count is exhausted', () => {
    const recurrence = makeRecurrence({ startMonth: '2026-01', occurrences: 2 })
    expect(appliesTo(recurrence, '2026-01')).toBe(true)
    expect(appliesTo(recurrence, '2026-02')).toBe(true)
    expect(appliesTo(recurrence, '2026-03')).toBe(false)
  })

  it('never ends when occurrences is undefined', () => {
    const recurrence = makeRecurrence({ startMonth: '2026-01' })
    expect(appliesTo(recurrence, '2099-12')).toBe(true)
  })
})

describe('endMonth', () => {
  it('is undefined for an unlimited recurrence', () => {
    expect(endMonth(makeRecurrence())).toBeUndefined()
  })

  it('computes the last month of a limited monthly series', () => {
    expect(endMonth(makeRecurrence({ startMonth: '2026-01', occurrences: 3 }))).toBe('2026-03')
  })

  it('computes the last month of a limited yearly series', () => {
    expect(endMonth(makeRecurrence({ frequency: 'yearly', startMonth: '2026-01', occurrences: 2 }))).toBe(
      '2027-01',
    )
  })
})

describe('occurrenceDate', () => {
  it('uses the recurrence day when it fits the month', () => {
    expect(occurrenceDate(makeRecurrence({ day: 15 }), '2026-04')).toBe('2026-04-15')
  })

  it('clamps the day to the length of a shorter month', () => {
    expect(occurrenceDate(makeRecurrence({ day: 31 }), '2026-04')).toBe('2026-04-30')
  })
})

describe('occurrenceOf', () => {
  it('builds a transaction input stamped with the recurrence id', () => {
    const recurrence = makeRecurrence({ id: 'r42', day: 5 })
    expect(occurrenceOf(recurrence, '2026-06')).toEqual({
      date: '2026-06-05',
      description: 'Loyer',
      category: 'Logement',
      kind: 'expense',
      amount: 800,
      recurrenceId: 'r42',
    })
  })
})

describe('recurrenceFromTransaction', () => {
  it('derives a recurrence from a transaction', () => {
    const transaction = {
      date: '2026-06-15',
      description: 'Loyer',
      category: 'Logement',
      kind: 'expense' as const,
      amount: 800,
    }

    expect(recurrenceFromTransaction(transaction, { frequency: 'monthly', occurrences: 12 })).toEqual({
      description: 'Loyer',
      category: 'Logement',
      kind: 'expense',
      amount: 800,
      day: 15,
      frequency: 'monthly',
      startMonth: '2026-06',
      occurrences: 12,
    })
  })
})

describe('recurrencesFor', () => {
  it('returns only the recurrences due in the given month', () => {
    const recurrences = [
      makeRecurrence({ id: 'a', startMonth: '2026-01' }),
      makeRecurrence({ id: 'b', startMonth: '2026-05' }),
    ]

    expect(recurrencesFor(recurrences, '2026-03').map((r) => r.id)).toEqual(['a'])
  })
})

describe('missingOccurrences', () => {
  const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 't1',
    date: '2026-01-01',
    description: 'Loyer',
    category: 'Logement',
    kind: 'expense',
    amount: 800,
    ...overrides,
  })

  it('returns an occurrence for a due recurrence with no matching transaction', () => {
    const recurrence = makeRecurrence({ id: 'r1' })
    expect(missingOccurrences([recurrence], '2026-01', [])).toEqual([occurrenceOf(recurrence, '2026-01')])
  })

  it('excludes a recurrence already applied in that month', () => {
    const recurrence = makeRecurrence({ id: 'r1' })
    const transaction = makeTransaction({ recurrenceId: 'r1' })
    expect(missingOccurrences([recurrence], '2026-01', [transaction])).toEqual([])
  })

  it('ignores transactions without a recurrence id', () => {
    const recurrence = makeRecurrence({ id: 'r1' })
    const transaction = makeTransaction({ recurrenceId: undefined })
    expect(missingOccurrences([recurrence], '2026-01', [transaction])).toHaveLength(1)
  })
})

describe('bounds', () => {
  it('exposes sane MIN and MAX occurrence bounds', () => {
    expect(MIN_OCCURRENCES).toBe(1)
    expect(MAX_OCCURRENCES).toBeGreaterThan(MIN_OCCURRENCES)
  })
})
