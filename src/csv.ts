/*
 * domain/csv.ts — transactions as a spreadsheet sees them.
 *
 * The export is aimed at Excel and LibreOffice in a French locale: a
 * semicolon separator and a comma as the decimal mark. Dates stay in ISO form
 * ("2026-09-01") because that is the one notation every spreadsheet — and this
 * parser — reads the same way.
 *
 * Reading is deliberately forgiving, because the file may well come from a
 * bank: the separator is detected, quoted fields are honoured, the header is
 * optional, dates may be French, amounts may carry spaces or a currency sign,
 * and the type column may be missing — in which case the sign of the amount
 * decides. A row that still makes no sense is skipped rather than guessed at.
 *
 * A CSV carries no identity: imported rows become ordinary one-off
 * transactions, never occurrences of a recurrence.
 */
import { daysInMonth, monthKeyFrom } from './month.js'
import { FALLBACK_CATEGORY } from './category.js'
import type { Transaction, TransactionInput, TransactionKind } from './transaction.js'

export const CSV_SEPARATOR = ';'

export const CSV_HEADER: readonly string[] = ['Date', 'Description', 'Catégorie', 'Type', 'Montant']

export const CSV_INCOME_LABEL = 'Revenu'
export const CSV_EXPENSE_LABEL = 'Dépense'

/** Separators tried when reading a file written elsewhere. */
const CANDIDATE_SEPARATORS = [';', ',', '\t']

const ISO_DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const FRENCH_DATE_PATTERN = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/

const INCOME_WORDS = ['revenu', 'revenus', 'recette', 'recettes', 'income', 'credit', 'entree', '+']
const EXPENSE_WORDS = ['depense', 'depenses', 'expense', 'debit', 'sortie', 'achat', '-']

export interface CsvImport {
  transactions: TransactionInput[]
  /** Rows that could not be read — a missing date or an unreadable amount. */
  ignored: number
}

/** Chronological order: a spreadsheet is read from the oldest row down. */
export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const rows = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const lines = [CSV_HEADER.join(CSV_SEPARATOR)]

  for (const transaction of rows) {
    lines.push([
      transaction.date,
      transaction.description,
      transaction.category,
      transaction.kind === 'income' ? CSV_INCOME_LABEL : CSV_EXPENSE_LABEL,
      formatAmount(transaction.amount),
    ].map(escapeField).join(CSV_SEPARATOR))
  }

  return lines.join('\r\n') + '\r\n'
}

export function csvToTransactions(text: string): CsvImport {
  const content = text.replace(/^\uFEFF/, '')
  const rows = parseRows(content, detectSeparator(content))

  const transactions: TransactionInput[] = []
  let ignored = 0

  for (const row of rows) {
    if (row.every((field) => field.trim() === '')) continue // blank line

    const transaction = parseRow(row)
    if (transaction) transactions.push(transaction)
    else ignored += 1
  }

  // A header only counts as noise when the rest of the file was readable:
  // otherwise every row failed and the file simply isn't one of ours.
  if (transactions.length > 0 && ignored > 0 && rows.length > 0 && isHeaderRow(rows[0])) ignored -= 1

  return { transactions, ignored }
}

function formatAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',')
}

function escapeField(value: string): string {
  return /["\r\n;,\t]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function isHeaderRow(row: readonly string[] | undefined): boolean {
  return row !== undefined && row.length > 0 && parseDate(row[0] ?? '') === null
}

/** The separator that splits the first line into the most fields. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''

  let best = CSV_SEPARATOR
  let bestCount = 0
  for (const separator of CANDIDATE_SEPARATORS) {
    const count = countOutsideQuotes(firstLine, separator)
    if (count > bestCount) {
      best = separator
      bestCount = count
    }
  }
  return best
}

function countOutsideQuotes(line: string, separator: string): number {
  let count = 0
  let quoted = false
  for (const character of line) {
    if (character === '"') quoted = !quoted
    else if (!quoted && character === separator) count += 1
  }
  return count
}

/**
 * Splits the whole text at once rather than line by line: a quoted field may
 * legally contain the separator *and* line breaks.
 */
function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (quoted) {
      if (character !== '"') field += character
      else if (text[index + 1] === '"') {
        field += '"'
        index += 1 // an escaped quote inside a quoted field
      } else quoted = false
      continue
    }

    if (character === '"') quoted = true
    else if (character === separator) endField()
    else if (character === '\n') endRow()
    else if (character !== '\r') field += character
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

function parseRow(row: readonly string[]): TransactionInput | null {
  const date = parseDate(row[0] ?? '')
  if (date === null) return null

  // Five columns is our own layout; four is the same without the type, which
  // the sign of the amount then stands in for.
  const hasKindColumn = row.length >= 5
  if (!hasKindColumn && row.length < 4) return null

  const amount = parseAmount(row[hasKindColumn ? 4 : 3] ?? '')
  if (amount === null) return null

  const description = (row[1] ?? '').trim()
  const category = (row[2] ?? '').trim() || FALLBACK_CATEGORY
  const kind = parseKind(hasKindColumn ? row[3] ?? '' : '', amount)

  return { date, description, category, kind, amount: Math.abs(amount) }
}

/** ISO or French dates; anything that is not a real calendar day is refused. */
function parseDate(value: string): string | null {
  const trimmed = value.trim()

  const iso = ISO_DATE_PATTERN.exec(trimmed)
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const french = FRENCH_DATE_PATTERN.exec(trimmed)
  if (french) return buildDate(Number(french[3]), Number(french[2]), Number(french[1]))

  return null
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null

  const monthKey = monthKeyFrom(year, month)
  if (day > daysInMonth(monthKey)) return null

  return `${monthKey}-${String(day).padStart(2, '0')}`
}

/**
 * Accepts "1 234,56", "1.234,56", "1,234.56", "-45€"… When both a comma and a
 * dot are present, the last one is the decimal mark and the other groups the
 * thousands.
 */
function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d,.+-]/g, '')
  if (cleaned === '') return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const grouping = decimal === ',' ? '.' : ','
    normalized = cleaned.split(grouping).join('').replace(decimal, '.')
  } else {
    normalized = cleaned.replace(',', '.')
  }

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function parseKind(value: string, amount: number): TransactionKind {
  const word = normalizeWord(value)
  if (INCOME_WORDS.includes(word)) return 'income'
  if (EXPENSE_WORDS.includes(word)) return 'expense'

  // No usable type column: a negative amount is money going out.
  return amount < 0 ? 'expense' : 'income'
}

/** Lower-cased and stripped of its accents, so "Dépense" matches "depense". */
function normalizeWord(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
