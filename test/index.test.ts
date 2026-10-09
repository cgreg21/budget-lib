import { describe, expect, it } from 'vitest'

import * as lib from '../src/index.js'

describe('public API', () => {
  it('exposes every module through the entry point', () => {
    for (const name of [
      'createArchive', 'balanceLevel', 'CATEGORY_ICON_CHOICES', 'DEFAULT_CATEGORIES', 'transactionsToCsv',
      'DEFAULT_GENERAL_SETTINGS', 'monthKeyFrom', 'buildPieSlices', 'sortRecurrences', 'normalizeRemoteConfig',
      'mergeMonth', 'filterTransactions', 'toBudgetTransactions', 'EnableBankingClient',
    ]) {
      expect(lib, name).toHaveProperty(name)
    }
  })

  it('reads a month with the accents stripped, on any JavaScript engine', () => {
    const transactions = [
      { id: '1', date: '2026-09-01', description: 'Électricité', category: 'Logement', kind: 'expense' as const, amount: 40 },
      { id: '2', date: '2026-09-02', description: 'Courses', category: 'Alimentation', kind: 'expense' as const, amount: 20 },
    ]
    const found = lib.filterTransactions(transactions, { ...lib.NO_FILTER, search: 'electricite' })
    expect(found.map((t) => t.id)).toEqual(['1'])
  })
})
