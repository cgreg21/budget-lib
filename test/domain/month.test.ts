import { describe, expect, it, vi } from 'vitest'
import {
  FIRST_MONTH,
  LAST_MONTH,
  clampMonth,
  compareMonthsDesc,
  currentMonthKey,
  dayOf,
  daysInMonth,
  defaultDateInMonth,
  groupByMonth,
  isMonthKey,
  monthKeyFrom,
  monthKeyOf,
  monthNumberOf,
  monthsBetween,
  shiftMonth,
  yearOf,
} from '../../src/domain/month.js'
import type { Transaction } from '../../src/domain/transaction.js'

describe('isMonthKey', () => {
  it('accepts a valid month key', () => {
    expect(isMonthKey('2026-09')).toBe(true)
    expect(isMonthKey('1970-01')).toBe(true)
    expect(isMonthKey('2026-12')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('26-09')).toBe(false)
    expect(isMonthKey('2026-9')).toBe(false)
    expect(isMonthKey(42)).toBe(false)
  })
})

describe('monthKeyOf / dayOf', () => {
  it('extracts the month and the day from an ISO date', () => {
    expect(monthKeyOf('2026-09-17')).toBe('2026-09')
    expect(dayOf('2026-09-17')).toBe(17)
  })
})

describe('currentMonthKey', () => {
  it('matches the current system date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))
    expect(currentMonthKey()).toBe('2026-09')
    vi.useRealTimers()
  })
})

describe('yearOf / monthNumberOf / monthKeyFrom', () => {
  it('round-trips a month key', () => {
    expect(yearOf('2026-09')).toBe(2026)
    expect(monthNumberOf('2026-09')).toBe(9)
    expect(monthKeyFrom(2026, 9)).toBe('2026-09')
  })

  it('pads single-digit months', () => {
    expect(monthKeyFrom(2026, 1)).toBe('2026-01')
  })
})

describe('clampMonth', () => {
  it('keeps a month inside the range untouched', () => {
    expect(clampMonth('2026-09')).toBe('2026-09')
  })

  it('clamps below the first month', () => {
    expect(clampMonth('1900-01')).toBe(FIRST_MONTH)
  })

  it('clamps above the last month', () => {
    expect(clampMonth('2200-01')).toBe(LAST_MONTH)
  })
})

describe('shiftMonth', () => {
  it('moves forward within the same year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
  })

  it('moves backward across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('moves forward across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('clamps at the bounds of the navigable range', () => {
    expect(shiftMonth(FIRST_MONTH, -1)).toBe(FIRST_MONTH)
    expect(shiftMonth(LAST_MONTH, 1)).toBe(LAST_MONTH)
  })
})

describe('compareMonthsDesc', () => {
  it('orders the most recent month first', () => {
    const months = ['2026-01', '2026-09', '2025-12']
    expect([...months].sort(compareMonthsDesc)).toEqual(['2026-09', '2026-01', '2025-12'])
  })
})

describe('monthsBetween', () => {
  it('counts positive distance forward', () => {
    expect(monthsBetween('2026-01', '2026-09')).toBe(8)
  })

  it('counts negative distance backward', () => {
    expect(monthsBetween('2026-09', '2026-01')).toBe(-8)
  })

  it('is zero for the same month', () => {
    expect(monthsBetween('2026-09', '2026-09')).toBe(0)
  })
})

describe('daysInMonth', () => {
  it('returns 31 for a long month', () => {
    expect(daysInMonth('2026-01')).toBe(31)
  })

  it('returns 30 for a short month', () => {
    expect(daysInMonth('2026-04')).toBe(30)
  })

  it('handles February on a leap year', () => {
    expect(daysInMonth('2024-02')).toBe(29)
  })

  it('handles February on a non-leap year', () => {
    expect(daysInMonth('2026-02')).toBe(28)
  })
})

describe('defaultDateInMonth', () => {
  it('returns today when the month is the current one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))
    expect(defaultDateInMonth('2026-09')).toBe('2026-09-17')
    vi.useRealTimers()
  })

  it('returns the first day of the month otherwise', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))
    expect(defaultDateInMonth('2026-01')).toBe('2026-01-01')
    vi.useRealTimers()
  })
})

describe('groupByMonth', () => {
  const makeTransaction = (id: string, date: string): Transaction => ({
    id,
    date,
    description: 'x',
    category: 'Autres',
    kind: 'expense',
    amount: 1,
  })

  it('buckets transactions by their month', () => {
    const transactions = [
      makeTransaction('1', '2026-09-01'),
      makeTransaction('2', '2026-09-15'),
      makeTransaction('3', '2026-10-01'),
    ]

    const grouped = groupByMonth(transactions)
    expect(grouped.get('2026-09')).toHaveLength(2)
    expect(grouped.get('2026-10')).toHaveLength(1)
  })

  it('returns an empty map for no transactions', () => {
    expect(groupByMonth([]).size).toBe(0)
  })
})
