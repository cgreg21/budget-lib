import { describe, expect, it } from 'vitest'

import { DEFAULT_BALANCE_THRESHOLDS } from '../src/balance.js'
import type { Category } from '../src/category.js'
import type { Recurrence } from '../src/recurrence.js'
import {
  canonical,
  mergeCategories,
  mergeKeyed,
  mergeMonth,
  mergeRecurrences,
  mergeThresholds,
  orderTransactions,
  sameValue,
} from '../src/sync-merge.js'
import type { Transaction } from '../src/transaction.js'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return { id, date: '2026-09-10', description: id, category: 'Autres', kind: 'expense', amount: 10, ...overrides }
}

describe('canonical / sameValue', () => {
  it('ignores the order of the keys', () => {
    expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonical({ a: [{ c: 2, d: 1 }], b: 1 }))
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })

  it('ignores undefined properties but not undefined values', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameValue(undefined, null)).toBe(false)
    expect(sameValue(undefined, undefined)).toBe(true)
  })

  it('tells different values apart', () => {
    expect(sameValue([1, 2], [2, 1])).toBe(false)
    expect(sameValue({ a: 1 }, { a: '1' })).toBe(false)
  })
})

describe('mergeKeyed', () => {
  const merge = (base: string[], local: string[], remote: string[], preferRemote = false): string[] =>
    mergeKeyed(base, local, remote, (item) => item.split(':')[0] as string, preferRemote)

  it('takes what changed on one side only', () => {
    expect(merge(['a:1', 'b:1'], ['a:2', 'b:1'], ['a:1', 'b:3'])).toEqual(['a:2', 'b:3'])
  })

  it('keeps additions from both sides, the remote ones first', () => {
    expect(merge([], ['l:1'], ['r:1'])).toEqual(['r:1', 'l:1'])
  })

  it('applies a deletion made on one side', () => {
    expect(merge(['a:1', 'b:1'], ['b:1'], ['a:1', 'b:1'])).toEqual(['b:1'])
    expect(merge(['a:1', 'b:1'], ['a:1', 'b:1'], ['a:1'])).toEqual(['a:1'])
  })

  it('does not let a deletion beat an edit made on the other side', () => {
    expect(merge(['a:1'], [], ['a:2'])).toEqual(['a:2'])
    expect(merge(['a:1'], ['a:2'], [])).toEqual(['a:2'])
  })

  it('keeps the local version of an item edited on both sides', () => {
    expect(merge(['a:1'], ['a:2'], ['a:3'])).toEqual(['a:2'])
  })

  it('keeps the remote one when the server is the reference', () => {
    expect(merge(['a:1'], ['a:2'], ['a:3'], true)).toEqual(['a:3'])
  })

  it('has nothing to decide when both sides made the same edit', () => {
    expect(merge(['a:1'], ['a:2'], ['a:2'])).toEqual(['a:2'])
  })
})

describe('orderTransactions', () => {
  it('sorts by date descending, then by id', () => {
    const list = [tx('b'), tx('c', { date: '2026-09-12' }), tx('a'), tx('d', { date: '2026-09-01' })]
    expect(orderTransactions(list).map((t) => t.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('does not touch its input', () => {
    const list = [tx('b'), tx('a')]
    orderTransactions(list)
    expect(list.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('mergeMonth', () => {
  it('merges per transaction id and orders the result', () => {
    const base = [tx('a'), tx('b')]
    const local = [tx('a', { amount: 99 }), tx('b'), tx('l', { date: '2026-09-20' })]
    const remote = [tx('a'), tx('r', { date: '2026-09-15' })]

    expect(mergeMonth(base, local, remote, false).map((t) => [t.id, t.amount])).toEqual([
      ['l', 10],
      ['r', 10],
      ['a', 99],
    ])
  })

  it('keeps a single occurrence of a recurrence generated on two devices', () => {
    const local = [tx('z-local', { recurrenceId: 'rent' })]
    const remote = [tx('a-remote', { recurrenceId: 'rent' })]

    expect(mergeMonth([], local, remote, true).map((t) => t.id)).toEqual(['a-remote'])
    expect(mergeMonth([], remote, local, false).map((t) => t.id)).toEqual(['a-remote'])
  })

  it('keeps one occurrence per recurrence and every one-off transaction', () => {
    const merged = mergeMonth([], [tx('a', { recurrenceId: 'r1' }), tx('b', { recurrenceId: 'r2' }), tx('c')], [], false)
    expect(merged.map((t) => t.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('mergeCategories', () => {
  const food: Category = { name: 'Alimentation', icon: 'emoji-food-symbolic' }
  const home: Category = { name: 'Logement', icon: 'user-home-symbolic' }

  it('identifies categories by name', () => {
    const renamedIcon = { ...food, icon: 'tabler:basket' }
    expect(mergeCategories([food], [renamedIcon], [food, home], false)).toEqual([renamedIcon, home])
  })
})

describe('mergeRecurrences', () => {
  const rent: Recurrence = {
    id: 'r1', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 700,
    day: 5, frequency: 'monthly', startMonth: '2026-01',
  }

  it('identifies recurrences by id', () => {
    const local = { ...rent, amount: 720 }
    expect(mergeRecurrences([rent], [local], [rent], false)).toEqual([local])
  })
})

describe('mergeThresholds', () => {
  const edited = { ...DEFAULT_BALANCE_THRESHOLDS, low: 123 }

  it('takes the side that changed', () => {
    expect(mergeThresholds(DEFAULT_BALANCE_THRESHOLDS, edited, DEFAULT_BALANCE_THRESHOLDS, false)).toEqual(edited)
    expect(mergeThresholds(DEFAULT_BALANCE_THRESHOLDS, DEFAULT_BALANCE_THRESHOLDS, edited, false)).toEqual(edited)
  })

  it('settles a conflict by the preference', () => {
    const other = { ...DEFAULT_BALANCE_THRESHOLDS, low: 456 }
    expect(mergeThresholds(DEFAULT_BALANCE_THRESHOLDS, edited, other, false)).toEqual(edited)
    expect(mergeThresholds(DEFAULT_BALANCE_THRESHOLDS, edited, other, true)).toEqual(other)
  })

  it('compares with the remote on a first synchronisation (no base)', () => {
    expect(mergeThresholds(undefined, edited, DEFAULT_BALANCE_THRESHOLDS, true)).toEqual(DEFAULT_BALANCE_THRESHOLDS)
  })
})
