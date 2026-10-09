/*
 * Covers the import of bank transactions: what is kept, how it is described and
 * categorised, the stability of the ids (the guarantee against duplicates), and
 * the reading of the address the bank sends the user back to.
 */
import { describe, expect, it } from 'vitest'

import {
  bankImportStart,
  describeBankTransaction,
  guessCategory,
  isBankRedirect,
  parseBankRedirect,
  toBudgetTransactions,
  type BankTransaction,
  type Category,
} from '../src/index.js'

const categories: Category[] = [
  { name: 'Alimentation', icon: 'a' },
  { name: 'Salaire', icon: 's' },
  { name: 'Santé', icon: 'h' },
  { name: 'Autres', icon: 'o' },
]

const entry = (patch: Partial<BankTransaction>): BankTransaction => ({
  transaction_amount: { currency: 'EUR', amount: '10.00' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-10-03',
  ...patch,
})

describe('describeBankTransaction', () => {
  it('puts the counterparty first, then the reason', () => {
    const tx = entry({ creditor: { name: 'CARREFOUR' }, remittance_information: ['CARTE 03/10 RENNES'] })
    expect(describeBankTransaction(tx)).toBe('CARREFOUR - CARTE 03/10 RENNES')
  })

  it('does not repeat the counterparty found in the reason', () => {
    const tx = entry({ creditor: { name: 'Carrefour' }, remittance_information: ['CARTE CARREFOUR RENNES'] })
    expect(describeBankTransaction(tx)).toBe('Carrefour')
  })

  it('keeps the reason when there is no counterparty', () => {
    expect(describeBankTransaction(entry({ remittance_information: ['PHARMACIE DU PORT'] }))).toBe('PHARMACIE DU PORT')
  })

  it('falls back to the note, and shortens very long texts', () => {
    expect(describeBankTransaction(entry({ note: 'memo' }))).toBe('memo')
    expect(describeBankTransaction(entry({ note: 'x'.repeat(300) }))).toHaveLength(120)
  })
})

describe('guessCategory', () => {
  it('uses a keyword rule when the category exists', () => {
    expect(guessCategory('CARREFOUR RENNES', 'expense', categories)).toBe('Alimentation')
    expect(guessCategory('PHARMACIE DU PORT', 'expense', categories)).toBe('Santé')
    expect(guessCategory('ACME - SALAIRE SEPTEMBRE', 'income', categories)).toBe('Salaire')
  })

  it('never gives an income an expense category, nor the reverse', () => {
    expect(guessCategory('CARREFOUR', 'income', categories)).toBe('Autres')
    expect(guessCategory('SALAIRE', 'expense', categories)).toBe('Autres')
  })

  it('falls back when the rule targets a category the user does not have', () => {
    expect(guessCategory('SNCF', 'expense', categories)).toBe('Autres')
  })

  it('uses the first category when even the fallback is missing', () => {
    expect(guessCategory('???', 'expense', [{ name: 'Seule', icon: 'x' }])).toBe('Seule')
  })
})

describe('toBudgetTransactions', () => {
  it('maps credits to incomes and debits to expenses with positive amounts', () => {
    const [income, expense] = toBudgetTransactions('acc', [
      entry({ entry_reference: 'A', credit_debit_indicator: 'CRDT', transaction_amount: { currency: 'EUR', amount: '2000.00' } }),
      entry({ entry_reference: 'B', transaction_amount: { currency: 'EUR', amount: '-12.505' } }),
    ], categories)
    expect(income).toMatchObject({ kind: 'income', amount: 2000, date: '2026-10-03' })
    expect(expense).toMatchObject({ kind: 'expense', amount: 12.51 })
  })

  it('leaves out pending, undated, zero and invalid entries', () => {
    const list = toBudgetTransactions('acc', [
      entry({ entry_reference: '1', status: 'PDNG' }),
      entry({ entry_reference: '2', booking_date: null }),
      entry({ entry_reference: '3', transaction_amount: { currency: 'EUR', amount: '0' } }),
      entry({ entry_reference: '4', transaction_amount: { currency: 'EUR', amount: 'abc' } }),
      entry({ entry_reference: '5' }),
    ], categories)
    expect(list).toHaveLength(1)
  })

  it('takes the first usable date among booking, value and transaction dates', () => {
    const [tx] = toBudgetTransactions('acc', [entry({ booking_date: null, value_date: '2026-10-05T00:00:00Z' })], categories)
    expect(tx.date).toBe('2026-10-05')
  })

  it('gives the same ids on every run, and different ones per account', () => {
    const entries = [entry({ entry_reference: 'A' }), entry({ remittance_information: ['CAFE'] })]
    const first = toBudgetTransactions('acc', entries, categories).map((tx) => tx.id)
    expect(toBudgetTransactions('acc', entries, categories).map((tx) => tx.id)).toEqual(first)
    expect(toBudgetTransactions('other', entries, categories).map((tx) => tx.id)).not.toEqual(first)
  })

  it('tells identical entries apart so none is lost', () => {
    const twice = toBudgetTransactions('acc', [
      entry({ remittance_information: ['CAFE'] }),
      entry({ remittance_information: ['CAFE'] }),
    ], categories)
    expect(new Set(twice.map((tx) => tx.id)).size).toBe(2)
  })
})

describe('parseBankRedirect', () => {
  it('reads code and state from the return address', () => {
    expect(parseBankRedirect('budgetmobile://bank?code=abc%20d&state=xyz#frag'))
      .toEqual({ code: 'abc d', state: 'xyz', error: '' })
  })

  it('reports the bank\'s refusal', () => {
    expect(parseBankRedirect('budgetmobile://bank?error=access_denied&error_description=Cancelled+by+user').error)
      .toBe('Cancelled by user')
  })

  it('accepts a bare code', () => {
    expect(parseBankRedirect('  abc123 ')).toEqual({ code: 'abc123', state: '', error: '' })
  })

  it('survives a malformed escape', () => {
    expect(parseBankRedirect('x://y?code=%E0%A4%A&state=s').state).toBe('s')
  })
})

describe('isBankRedirect', () => {
  it('compares the address without its query string', () => {
    expect(isBankRedirect('budgetmobile://bank?code=1', 'budgetmobile://bank')).toBe(true)
    expect(isBankRedirect('https://other.example', 'budgetmobile://bank')).toBe(false)
    expect(isBankRedirect('anything', '')).toBe(false)
  })
})

describe('bankImportStart', () => {
  it('starts at the configured day the first time', () => {
    expect(bankImportStart('2026-10-01', '')).toBe('2026-10-01')
  })

  it('looks back a week before the last import', () => {
    expect(bankImportStart('2026-10-01', '2026-10-20T08:00:00.000Z')).toBe('2026-10-13')
  })

  it('never goes before the configured day', () => {
    expect(bankImportStart('2026-10-01', '2026-10-03T08:00:00.000Z')).toBe('2026-10-01')
  })
})
