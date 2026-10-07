import { describe, expect, it } from 'vitest'
import { csvToTransactions, transactionsToCsv } from '../src/csv.js'
import type { Transaction } from '../src/transaction.js'

describe('transactionsToCsv', () => {
  it('writes a header row followed by the sorted transactions', () => {
    const transactions: Transaction[] = [
      { id: '1', date: '2026-09-15', description: 'Salaire', category: 'Salaire', kind: 'income', amount: 2000 },
      { id: '2', date: '2026-09-01', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 800.5 },
    ]

    const csv = transactionsToCsv(transactions)
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe('Date;Description;Catégorie;Type;Montant')
    expect(lines[1]).toBe('2026-09-01;Loyer;Logement;Dépense;"800,50"')
    expect(lines[2]).toBe('2026-09-15;Salaire;Salaire;Revenu;"2000,00"')
  })

  it('quotes fields containing the separator', () => {
    const transactions: Transaction[] = [
      { id: '1', date: '2026-09-01', description: 'Restaurant; midi', category: 'Alimentation', kind: 'expense', amount: 20 },
    ]

    expect(transactionsToCsv(transactions)).toContain('"Restaurant; midi"')
  })
})

describe('csvToTransactions', () => {
  it('reads a file exported by the app', () => {
    const csv = 'Date;Description;Catégorie;Type;Montant\r\n2026-09-01;Loyer;Logement;Dépense;800,50\r\n'
    const result = csvToTransactions(csv)

    expect(result.ignored).toBe(0)
    expect(result.transactions).toEqual([
      { date: '2026-09-01', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 800.5 },
    ])
  })

  it('detects a comma separator', () => {
    const csv = 'Date,Description,Catégorie,Type,Montant\n2026-09-01,Loyer,Logement,Dépense,800.50\n'
    const result = csvToTransactions(csv)

    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]?.amount).toBe(800.5)
  })

  it('reads French dates', () => {
    const csv = '17/09/2026;Course;Alimentation;Dépense;45,00\n'
    const result = csvToTransactions(csv)

    expect(result.transactions[0]?.date).toBe('2026-09-17')
  })

  it('derives the kind from the sign of the amount when the type column is missing', () => {
    const csv = '2026-09-01;Loyer;Logement;-800,50\n2026-09-05;Salaire;Salaire;2000\n'
    const result = csvToTransactions(csv)

    expect(result.transactions[0]).toMatchObject({ kind: 'expense', amount: 800.5 })
    expect(result.transactions[1]).toMatchObject({ kind: 'income', amount: 2000 })
  })

  it('falls back to the default category when it is missing', () => {
    const csv = '2026-09-01;Loyer;;Dépense;800\n'
    const result = csvToTransactions(csv)

    expect(result.transactions[0]?.category).toBe('Autres')
  })

  it('skips rows with an unreadable date or amount', () => {
    const csv = 'not-a-date;Loyer;Logement;Dépense;800\n2026-09-01;Loyer;Logement;Dépense;not-a-number\n'
    const result = csvToTransactions(csv)

    expect(result.transactions).toEqual([])
    expect(result.ignored).toBe(2)
  })

  it('ignores blank lines', () => {
    const csv = '2026-09-01;Loyer;Logement;Dépense;800\n\n\n'
    const result = csvToTransactions(csv)

    expect(result.transactions).toHaveLength(1)
    expect(result.ignored).toBe(0)
  })

  it('handles quoted fields containing the separator', () => {
    const csv = '2026-09-01;"Restaurant; midi";Alimentation;Dépense;20\n'
    const result = csvToTransactions(csv)

    expect(result.transactions[0]?.description).toBe('Restaurant; midi')
  })

  it('strips a byte-order mark', () => {
    const csv = '\uFEFF2026-09-01;Loyer;Logement;Dépense;800\n'
    const result = csvToTransactions(csv)

    expect(result.transactions).toHaveLength(1)
  })

  it('round-trips an export back through the import', () => {
    const transactions: Transaction[] = [
      { id: '1', date: '2026-09-01', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 800.5 },
      { id: '2', date: '2026-09-05', description: 'Salaire', category: 'Salaire', kind: 'income', amount: 2000 },
    ]

    const result = csvToTransactions(transactionsToCsv(transactions))

    expect(result.ignored).toBe(0)
    expect(result.transactions).toEqual(
      transactions.map(({ date, description, category, kind, amount }) => ({
        date,
        description,
        category,
        kind,
        amount,
      })),
    )
  })
})

describe('separator detection', () => {
  it('detects a tab separator', () => {
    const result = csvToTransactions('2026-09-01\tLoyer\tLogement\tDépense\t800\n')
    expect(result.transactions).toHaveLength(1)
  })

  it('does not count separators sitting inside a quoted field', () => {
    const csv = '"a;b;c;d",Description,Catégorie,Type,Montant\n2026-09-01,Loyer,Logement,Dépense,800\n'
    const result = csvToTransactions(csv)

    expect(result.transactions).toHaveLength(1)
    expect(result.ignored).toBe(0)
  })

  it('falls back to the default separator when the first line has none', () => {
    const result = csvToTransactions('2026-09-01\n')
    expect(result.transactions).toEqual([])
  })
})

describe('quoted fields', () => {
  it('escapes an embedded quote on export', () => {
    const transactions: Transaction[] = [
      { id: '1', date: '2026-09-01', description: 'Dit "bonjour"', category: 'Autres', kind: 'expense', amount: 5 },
    ]

    expect(transactionsToCsv(transactions)).toContain('"Dit ""bonjour"""')
  })

  it('reads an escaped quote back', () => {
    const result = csvToTransactions('2026-09-01;"Dit ""bonjour""";Autres;Dépense;5\n')
    expect(result.transactions[0]?.description).toBe('Dit "bonjour"')
  })

  it('reads a quoted field spanning several lines', () => {
    const result = csvToTransactions('2026-09-01;"Ligne 1\nLigne 2";Autres;Dépense;5\n')
    expect(result.transactions[0]?.description).toBe('Ligne 1\nLigne 2')
  })

  it('reads a last row that has no trailing newline', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;800')
    expect(result.transactions).toHaveLength(1)
  })

  it('closes a last row ending on a separator', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;800;')
    expect(result.transactions).toHaveLength(1)
  })

  it('returns nothing for an empty text', () => {
    expect(csvToTransactions('')).toEqual({ transactions: [], ignored: 0 })
  })
})

describe('amount parsing', () => {
  it('reads a dot as the decimal mark and a comma as the thousands separator', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;"1,234.56"\n')
    expect(result.transactions[0]?.amount).toBe(1234.56)
  })

  it('reads a comma as the decimal mark and a dot as the thousands separator', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;"1.234,56"\n')
    expect(result.transactions[0]?.amount).toBe(1234.56)
  })

  it('ignores spaces and a currency sign', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;1 234,56 €\n')
    expect(result.transactions[0]?.amount).toBe(1234.56)
  })

  it('skips a row whose amount holds no digit at all', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;abc\n')

    expect(result.transactions).toEqual([])
    expect(result.ignored).toBe(1)
  })

  it('skips a row whose amount cannot be turned into a number', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Dépense;1-2-3\n')
    expect(result.transactions).toEqual([])
  })
})

describe('kind detection', () => {
  it.each([
    ['Revenu', 'income'],
    ['recettes', 'income'],
    ['Crédit', 'income'],
    ['+', 'income'],
    ['Dépense', 'expense'],
    ['achat', 'expense'],
    ['Débit', 'expense'],
    ['-', 'expense'],
  ])('reads "%s" as a %s', (label, expected) => {
    const result = csvToTransactions(`2026-09-01;Loyer;Logement;${label};800\n`)
    expect(result.transactions[0]?.kind).toBe(expected)
  })

  it('falls back to the sign when the type column says something else', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement;Inconnu;-800\n')
    expect(result.transactions[0]?.kind).toBe('expense')
  })
})

describe('date parsing', () => {
  it('reads a French date written with dots', () => {
    const result = csvToTransactions('17.09.2026;Course;Alimentation;Dépense;45\n')
    expect(result.transactions[0]?.date).toBe('2026-09-17')
  })

  it('pads a single-digit day and month', () => {
    const result = csvToTransactions('2026-9-7;Course;Alimentation;Dépense;45\n')
    expect(result.transactions[0]?.date).toBe('2026-09-07')
  })

  it('refuses a month outside 1–12', () => {
    expect(csvToTransactions('2026-13-01;Course;Alimentation;Dépense;45\n').transactions).toEqual([])
  })

  it('refuses a day below 1', () => {
    expect(csvToTransactions('2026-01-00;Course;Alimentation;Dépense;45\n').transactions).toEqual([])
  })

  it('refuses a day the month does not have', () => {
    expect(csvToTransactions('2026-02-30;Course;Alimentation;Dépense;45\n').transactions).toEqual([])
  })
})

describe('row shape', () => {
  it('skips a row with fewer than four columns', () => {
    const result = csvToTransactions('2026-09-01;Loyer;Logement\n')

    expect(result.transactions).toEqual([])
    expect(result.ignored).toBe(1)
  })

  it('counts the header as noise only when the rest of the file was readable', () => {
    const readable = csvToTransactions(
      'Date;Description;Catégorie;Type;Montant\n2026-09-01;Loyer;Logement;Dépense;800\nn importe quoi;;;;\n',
    )
    expect(readable.ignored).toBe(1)

    const unreadable = csvToTransactions('Date;Description;Catégorie;Type;Montant\nn importe quoi;;;;\n')
    expect(unreadable.transactions).toEqual([])
    expect(unreadable.ignored).toBe(2)
  })

  it('does not treat a first data row as a header', () => {
    const result = csvToTransactions(
      '2026-09-01;Loyer;Logement;Dépense;800\nn importe quoi;;;;\n',
    )

    expect(result.transactions).toHaveLength(1)
    expect(result.ignored).toBe(1)
  })
})
