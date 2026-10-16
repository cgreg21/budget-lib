import { describe, expect, it } from 'vitest'
import {
  MAX_OCCURRENCES,
  MIN_OCCURRENCES,
  appliesTo,
  endDate,
  endMonth,
  occurrenceDates,
  isRecurrenceFrequency,
  isRecurrenceList,
  missingOccurrences,
  occurrenceDate,
  occurrenceOf,
  recurrenceFromTransaction,
  recurrencesFor,
  sortRecurrences,
  type Recurrence,
} from '../../src/domain/recurrence.js'
import type { Transaction } from '../../src/domain/transaction.js'

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
    expect(isRecurrenceFrequency('fortnightly')).toBe(false)
    expect(isRecurrenceFrequency('weekly')).toBe(true)
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
    ['frequency', { frequency: 'fortnightly' }],
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

describe('activeMonths', () => {
  const edf = makeRecurrence({ startMonth: '2026-03', activeMonths: 10, occurrences: undefined })

  it('is due in the first months of each yearly cycle only', () => {
    const due = (m: string): boolean => appliesTo(edf, m)
    expect(due('2026-02')).toBe(false)
    expect(due('2026-03')).toBe(true)
    expect(due('2026-12')).toBe(true)
    expect(due('2027-01')).toBe(false)
    expect(due('2027-02')).toBe(false)
    expect(due('2027-03')).toBe(true)
  })

  it('counts only the due months toward the occurrences and the end', () => {
    const limited = makeRecurrence({ startMonth: '2026-03', activeMonths: 10, occurrences: 12 })
    expect(appliesTo(limited, '2027-04')).toBe(true)
    expect(appliesTo(limited, '2027-05')).toBe(false)
    expect(endMonth(limited)).toBe('2027-04')
  })

  it('ignores the cycle for day-based and custom-interval series', () => {
    expect(appliesTo(makeRecurrence({ startMonth: '2026-03', activeMonths: 10, interval: 2 }), '2027-01')).toBe(true)
    expect(occurrenceDates(makeRecurrence({ frequency: 'weekly', startMonth: '2026-03', activeMonths: 1 }), '2026-05').length).toBeGreaterThan(0)
  })

  it('is copied from the settings and validated', () => {
    const transaction = { date: '2026-03-05', description: 'EDF', category: 'Logement', kind: 'expense', amount: 180 } as const
    expect(recurrenceFromTransaction(transaction, { frequency: 'monthly', activeMonths: 10 })).toMatchObject({ activeMonths: 10 })
    expect(isRecurrenceList([makeRecurrence({ activeMonths: 11 })])).toBe(true)
    expect(isRecurrenceList([makeRecurrence({ activeMonths: 0 })])).toBe(false)
    expect(isRecurrenceList([makeRecurrence({ activeMonths: 12 })])).toBe(false)
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

  it('supports bimonthly and semiannual frequencies', () => {
    const bimonthly = makeRecurrence({ frequency: 'bimonthly', startMonth: '2026-01' })
    expect(appliesTo(bimonthly, '2026-02')).toBe(false)
    expect(appliesTo(bimonthly, '2026-03')).toBe(true)
    const semiannual = makeRecurrence({ frequency: 'semiannual', startMonth: '2026-01' })
    expect(appliesTo(semiannual, '2026-06')).toBe(false)
    expect(appliesTo(semiannual, '2026-07')).toBe(true)
  })

  it('applies a custom interval over the frequency one', () => {
    const recurrence = makeRecurrence({ interval: 5, startMonth: '2026-01' })
    expect(appliesTo(recurrence, '2026-05')).toBe(false)
    expect(appliesTo(recurrence, '2026-06')).toBe(true)
    expect(endMonth({ ...recurrence, occurrences: 3 })).toBe('2026-11')
  })

  it('stops after the until month, even for a never-ending series', () => {
    const recurrence = makeRecurrence({ startMonth: '2026-01', until: '2026-03' })
    expect(appliesTo(recurrence, '2026-03')).toBe(true)
    expect(appliesTo(recurrence, '2026-04')).toBe(false)
    expect(endMonth(recurrence)).toBe('2026-03')
  })

  it('ends at the earliest of the count and the until month', () => {
    expect(endMonth(makeRecurrence({ startMonth: '2026-01', occurrences: 3, until: '2026-12' }))).toBe('2026-03')
    expect(endMonth(makeRecurrence({ startMonth: '2026-01', occurrences: 12, until: '2026-04' }))).toBe('2026-04')
    const both = makeRecurrence({ startMonth: '2026-01', occurrences: 12, until: '2026-04' })
    expect(appliesTo(both, '2026-05')).toBe(false)
  })

  it('copies the interval and the until month from the settings', () => {
    const transaction = { date: '2026-02-10', description: 'x', category: 'c', kind: 'expense' as const, amount: 1 }
    expect(recurrenceFromTransaction(transaction, { frequency: 'monthly', interval: 4, until: '2027-01' })).toMatchObject({
      interval: 4,
      until: '2027-01',
    })
  })

  it.each([
    ['zero interval', { interval: 0 }],
    ['too large interval', { interval: 61 }],
    ['fractional interval', { interval: 1.5 }],
    ['malformed until', { until: '2026-13' }],
  ])('rejects %s', (_label, overrides) => {
    expect(isRecurrenceList([makeRecurrence(overrides as Partial<Recurrence>)])).toBe(false)
  })

  it('accepts a valid interval and until month', () => {
    expect(isRecurrenceList([makeRecurrence({ interval: 60, until: '2030-01' })])).toBe(true)
  })

  it('supports daily and weekly frequencies with several dates per month', () => {
    const weekly = makeRecurrence({ frequency: 'weekly', startMonth: '2026-10', day: 7 })
    expect(occurrenceDates(weekly, '2026-10')).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'])
    expect(occurrenceDates(weekly, '2026-11')).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'])
    expect(occurrenceDates(weekly, '2026-09')).toEqual([])
    const daily = makeRecurrence({ frequency: 'daily', startMonth: '2026-02', day: 27 })
    expect(occurrenceDates(daily, '2026-02')).toEqual(['2026-02-27', '2026-02-28'])
    expect(occurrenceDates(daily, '2026-03')).toHaveLength(31)
  })

  it('bounds a daily or weekly series by count and last month', () => {
    const counted = makeRecurrence({ frequency: 'weekly', startMonth: '2026-10', day: 21, occurrences: 3 })
    expect(occurrenceDates(counted, '2026-10')).toEqual(['2026-10-21', '2026-10-28'])
    expect(occurrenceDates(counted, '2026-11')).toEqual(['2026-11-04'])
    expect(occurrenceDates(counted, '2026-12')).toEqual([])
    expect(endDate(counted)).toBe('2026-11-04')
    expect(endMonth(counted)).toBe('2026-11')

    const bounded = makeRecurrence({ frequency: 'daily', startMonth: '2026-10', day: 30, until: '2026-11' })
    expect(occurrenceDates(bounded, '2026-11')).toHaveLength(30)
    expect(occurrenceDates(bounded, '2026-12')).toEqual([])
    expect(endDate(bounded)).toBe('2026-11-30')
    expect(appliesTo(bounded, '2026-12')).toBe(false)
  })

  it('fills only the missing dates of a weekly series', () => {
    const weekly = makeRecurrence({ frequency: 'weekly', startMonth: '2026-10', day: 7 })
    expect(missingOccurrences([weekly], '2026-10', []).map((o) => o.date)).toEqual([
      '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28',
    ])
    const existing = ['2026-10-07', '2026-10-21'].map((date, i) => ({ ...occurrenceOf(weekly, '2026-10', date), id: `t${i}` }))
    expect(missingOccurrences([weekly], '2026-10', existing).map((o) => o.date)).toEqual(['2026-10-14', '2026-10-28'])
    const complete = [...existing, ...['2026-10-14', '2026-10-28'].map((date, i) => ({ ...occurrenceOf(weekly, '2026-10', date), id: `u${i}` }))]
    expect(missingOccurrences([weekly], '2026-10', complete)).toEqual([])
  })

  it('counts a custom interval in periods of the frequency', () => {
    const everyTwoYears = makeRecurrence({ frequency: 'yearly', interval: 2, startMonth: '2026-03' })
    expect(appliesTo(everyTwoYears, '2027-03')).toBe(false)
    expect(appliesTo(everyTwoYears, '2028-03')).toBe(true)
    const everyTwoQuarters = makeRecurrence({ frequency: 'quarterly', interval: 2, startMonth: '2026-01' })
    expect(appliesTo(everyTwoQuarters, '2026-04')).toBe(false)
    expect(appliesTo(everyTwoQuarters, '2026-07')).toBe(true)
  })

  it('applies a custom interval to daily and weekly series', () => {
    const everyTenDays = makeRecurrence({ frequency: 'daily', interval: 10, startMonth: '2026-10', day: 5 })
    expect(occurrenceDates(everyTenDays, '2026-10')).toEqual(['2026-10-05', '2026-10-15', '2026-10-25'])
    expect(occurrenceDates(everyTenDays, '2026-11')).toEqual(['2026-11-04', '2026-11-14', '2026-11-24'])
    const everyTwoWeeks = makeRecurrence({ frequency: 'weekly', interval: 2, startMonth: '2026-10', day: 1, occurrences: 3 })
    expect(occurrenceDates(everyTwoWeeks, '2026-10')).toEqual(['2026-10-01', '2026-10-15', '2026-10-29'])
    expect(endDate(everyTwoWeeks)).toBe('2026-10-29')
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

describe('installments', () => {
  const tax = {
    id: 'tax', description: 'Tax', category: 'Taxes', kind: 'expense' as const, amount: 100, day: 15,
    frequency: 'yearly' as const, startMonth: '2026-02',
    installments: [{ offset: 3, day: 15, amount: 150 }, { offset: 7, day: 1, amount: 200 }],
  }

  it('falls on every date of the period with its own amount', async () => {
    const { occurrencesIn } = await import('../../src/domain/recurrence.js')
    expect(occurrencesIn(tax, '2026-02')).toEqual([{ date: '2026-02-15', amount: 100 }])
    expect(occurrencesIn(tax, '2026-05')).toEqual([{ date: '2026-05-15', amount: 150 }])
    expect(occurrencesIn(tax, '2026-09')).toEqual([{ date: '2026-09-01', amount: 200 }])
    expect(occurrencesIn(tax, '2027-05')).toEqual([{ date: '2027-05-15', amount: 150 }])
    expect(occurrencesIn(tax, '2026-03')).toEqual([])
  })

  it('counts periods and stops at the last month', async () => {
    const { endMonth, occurrencesIn } = await import('../../src/domain/recurrence.js')
    const limited = { ...tax, occurrences: 1 }
    expect(endMonth(limited)).toBe('2026-09')
    expect(occurrencesIn(limited, '2027-02')).toEqual([])
    expect(occurrencesIn({ ...tax, until: '2026-06' }, '2026-09')).toEqual([])
  })

  it('creates each missing occurrence once, with the right amount', async () => {
    const { missingOccurrences } = await import('../../src/domain/recurrence.js')
    const [first] = missingOccurrences([tax], '2026-05', [])
    expect(first).toMatchObject({ date: '2026-05-15', amount: 150, recurrenceId: 'tax' })
    expect(missingOccurrences([tax], '2026-05', [{ ...first, id: 't1' }])).toEqual([])
  })

  it('is validated with the list of recurrences', () => {
    expect(isRecurrenceList([tax])).toBe(true)
    expect(isRecurrenceList([{ ...tax, installments: [{ offset: 12, day: 1, amount: 5 }] }])).toBe(false)
    expect(isRecurrenceList([{ ...tax, frequency: 'weekly' }])).toBe(false)
  })
})
