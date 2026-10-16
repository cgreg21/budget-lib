import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  filterTransactions,
  isFilterActive,
  isTransactionArray,
  NO_FILTER,
  sortByDateDesc,
  sumByCategory,
  todayIsoDate,
  type Transaction,
} from '../../src/domain/transaction.js'

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: '1',
  date: '2026-09-01',
  description: 'Test',
  category: 'Autres',
  kind: 'expense',
  amount: 10,
  ...overrides,
})

describe('isTransactionArray', () => {
  it('accepts a valid array', () => {
    expect(isTransactionArray([makeTransaction()])).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(isTransactionArray([])).toBe(true)
  })

  it('rejects non-arrays', () => {
    expect(isTransactionArray({})).toBe(false)
    expect(isTransactionArray(null)).toBe(false)
  })

  it('rejects an array with a malformed entry', () => {
    expect(isTransactionArray([{ id: '1' }])).toBe(false)
  })

  it('rejects an array holding a non-object', () => {
    expect(isTransactionArray(['nope'])).toBe(false)
    expect(isTransactionArray([null])).toBe(false)
  })

  it.each([
    ['id', { id: 1 }],
    ['date', { date: 20260901 }],
    ['description', { description: null }],
    ['category', { category: 7 }],
    ['amount', { amount: '10' }],
    ['recurrenceId', { recurrenceId: 12 }],
  ])('rejects a wrong %s', (_field, override) => {
    expect(isTransactionArray([{ ...makeTransaction(), ...override }])).toBe(false)
  })

  it('rejects an invalid kind', () => {
    expect(isTransactionArray([makeTransaction({ kind: 'other' as never })])).toBe(false)
  })

  it('rejects a non-finite amount', () => {
    expect(isTransactionArray([makeTransaction({ amount: NaN })])).toBe(false)
  })

  it('accepts an optional recurrenceId', () => {
    expect(isTransactionArray([makeTransaction({ recurrenceId: 'r1' })])).toBe(true)
  })
})

describe('sortByDateDesc', () => {
  it('orders transactions from the most recent to the oldest', () => {
    const transactions = [
      makeTransaction({ id: '1', date: '2026-09-01' }),
      makeTransaction({ id: '2', date: '2026-09-30' }),
      makeTransaction({ id: '3', date: '2026-08-15' }),
    ]

    expect(sortByDateDesc(transactions).map((t) => t.id)).toEqual(['2', '1', '3'])
  })

  it('does not mutate the input array', () => {
    const transactions = [makeTransaction({ id: '1', date: '2026-09-01' }), makeTransaction({ id: '2', date: '2026-09-30' })]
    const original = [...transactions]
    sortByDateDesc(transactions)
    expect(transactions).toEqual(original)
  })
})

describe('computeTotals', () => {
  it('sums income and expense separately and computes the balance', () => {
    const transactions = [
      makeTransaction({ kind: 'income', amount: 1000 }),
      makeTransaction({ kind: 'expense', amount: 300 }),
      makeTransaction({ kind: 'expense', amount: 200 }),
    ]

    expect(computeTotals(transactions)).toEqual({ income: 1000, expense: 500, balance: 500 })
  })

  it('returns zeroes for an empty list', () => {
    expect(computeTotals([])).toEqual({ income: 0, expense: 0, balance: 0 })
  })
})

describe('sumByCategory', () => {
  it('sums amounts per category for the given kind, largest first', () => {
    const transactions = [
      makeTransaction({ kind: 'expense', category: 'Alimentation', amount: 50 }),
      makeTransaction({ kind: 'expense', category: 'Transport', amount: 100 }),
      makeTransaction({ kind: 'expense', category: 'Alimentation', amount: 30 }),
      makeTransaction({ kind: 'income', category: 'Salaire', amount: 2000 }),
    ]

    expect(sumByCategory(transactions, 'expense')).toEqual([
      { category: 'Transport', amount: 100 },
      { category: 'Alimentation', amount: 80 },
    ])
  })

  it('returns an empty array when no transaction matches the kind', () => {
    expect(sumByCategory([makeTransaction({ kind: 'income' })], 'expense')).toEqual([])
  })
})

describe('todayIsoDate', () => {
  it('returns an ISO date string', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

const filter = (overrides: Partial<typeof NO_FILTER> = {}) => ({ ...NO_FILTER, ...overrides })

describe('isFilterActive', () => {
  it('is false for the resting filter', () => {
    expect(isFilterActive(NO_FILTER)).toBe(false)
  })

  it('is false for blanks only', () => {
    expect(isFilterActive(filter({ search: '   ' }))).toBe(false)
  })

  it('is true once a term, a kind or a category is set', () => {
    expect(isFilterActive(filter({ search: 'loyer' }))).toBe(true)
    expect(isFilterActive(filter({ kind: 'income' }))).toBe(true)
    expect(isFilterActive(filter({ categories: ['Logement'] }))).toBe(true)
  })
})

describe('filterTransactions', () => {
  const loyer = makeTransaction({ id: '1', description: 'Loyer', category: 'Logement' })
  const salaire = makeTransaction({
    id: '2',
    description: 'Salaire',
    category: 'Revenus',
    kind: 'income',
  })
  const edf = makeTransaction({ id: '3', description: 'Facture EDF', category: 'Électricité' })
  const all = [loyer, salaire, edf]

  it('keeps everything when nothing is filtered', () => {
    expect(filterTransactions(all, NO_FILTER)).toEqual(all)
  })

  it('keeps the input order', () => {
    expect(filterTransactions(all, filter({ kind: 'expense' }))).toEqual([loyer, edf])
  })

  it('filters by kind', () => {
    expect(filterTransactions(all, filter({ kind: 'income' }))).toEqual([salaire])
  })

  it('filters by category, on the exact name', () => {
    expect(filterTransactions(all, filter({ categories: ['Logement'] }))).toEqual([loyer])
    expect(filterTransactions(all, filter({ categories: ['logement'] }))).toEqual([])
  })

  it('keeps every listed category', () => {
    expect(filterTransactions(all, filter({ categories: ['Logement', 'Revenus'] })))
      .toEqual([loyer, salaire])
  })

  it('treats an empty category list as no category filter', () => {
    expect(filterTransactions(all, filter({ categories: [] }))).toEqual(all)
  })

  it('matches the description, ignoring case', () => {
    expect(filterTransactions(all, filter({ search: 'LOY' }))).toEqual([loyer])
  })

  it('matches the category too', () => {
    expect(filterTransactions(all, filter({ search: 'logement' }))).toEqual([loyer])
  })

  it('ignores accents on both sides', () => {
    expect(filterTransactions(all, filter({ search: 'electricite' }))).toEqual([edf])
    expect(filterTransactions(all, filter({ search: 'Électricité' }))).toEqual([edf])
  })

  it('ignores surrounding blanks in the term', () => {
    expect(filterTransactions(all, filter({ search: '  loyer  ' }))).toEqual([loyer])
  })

  it('combines every criterion', () => {
    expect(filterTransactions(all, filter({ search: 'a', kind: 'income' }))).toEqual([salaire])
    expect(filterTransactions(all, filter({ search: 'loyer', categories: ['Revenus'] }))).toEqual([])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterTransactions(all, filter({ search: 'zzz' }))).toEqual([])
  })

  it('leaves the input untouched', () => {
    const input = [...all]
    filterTransactions(input, filter({ search: 'loyer' }))
    expect(input).toEqual(all)
  })
})
