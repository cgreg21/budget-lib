/*
 * domain/recurrence.ts — transactions that come back every month, quarter or
 * year: rent, salary, insurance…
 *
 * A recurrence is a template, not a transaction. It produces one occurrence
 * per due month, stamped with its id so the same month is never filled twice
 * — that stamp is what makes applying a recurrence idempotent.
 */
import {
  dayOf,
  daysInMonth,
  isMonthKey,
  monthKeyOf,
  monthsBetween,
  shiftMonth,
  type MonthKey,
} from './month.js'
import type { Transaction, TransactionInput, TransactionKind } from './transaction.js'

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly'

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  'monthly',
  'quarterly',
  'yearly',
]

/** Months separating two occurrences. */
const OCCURRENCE_INTERVAL: Record<RecurrenceFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

export const FIRST_DAY = 1
/** Longest month; shorter months clamp the day down (a 31 becomes the 30th). */
export const LAST_DAY = 31

export const MIN_OCCURRENCES = 1
/** 600 monthly occurrences: fifty years, far beyond any budget plan. */
export const MAX_OCCURRENCES = 600

export interface Recurrence {
  id: string
  description: string
  category: string
  kind: TransactionKind
  /** Always positive; the sign is derived from `kind`. */
  amount: number
  /** Day of the month the occurrence is dated. */
  day: number
  frequency: RecurrenceFrequency
  /** First month it applies to; earlier months are left alone. */
  startMonth: MonthKey
  /** How many occurrences the series counts. Absent means it never ends. */
  occurrences?: number
}

/** A recurrence that has not been persisted yet (no id assigned). */
export type RecurrenceInput = Omit<Recurrence, 'id'>

/** The rhythm a transaction form asks for; `null` stands for a one-off transaction. */
export interface RecurrenceSettings {
  frequency: RecurrenceFrequency
  occurrences?: number
}

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency)
}

export function isRecurrenceList(value: unknown): value is Recurrence[] {
  return Array.isArray(value) && value.every(isRecurrence)
}

/** Alphabetical, so the options list keeps a stable order. */
export function sortRecurrences(recurrences: readonly Recurrence[]): Recurrence[] {
  return [...recurrences].sort((a, b) => a.description.localeCompare(b.description, 'fr'))
}

/** True when the recurrence produces an occurrence in that month. */
export function appliesTo(recurrence: Recurrence, month: MonthKey): boolean {
  const rank = occurrenceRank(recurrence, month)
  if (rank === null) return false
  return recurrence.occurrences === undefined || rank < recurrence.occurrences
}

/** The last month of a limited series; `undefined` when it never ends. */
export function endMonth(recurrence: Recurrence): MonthKey | undefined {
  if (recurrence.occurrences === undefined) return undefined
  const steps = (recurrence.occurrences - 1) * OCCURRENCE_INTERVAL[recurrence.frequency]
  return shiftMonth(recurrence.startMonth, steps)
}

/** Position of a month in the series, 0 for the first one; `null` when it is not due. */
function occurrenceRank(recurrence: Recurrence, month: MonthKey): number | null {
  const distance = monthsBetween(recurrence.startMonth, month)
  if (distance < 0) return null

  const interval = OCCURRENCE_INTERVAL[recurrence.frequency]
  return distance % interval === 0 ? distance / interval : null
}

/** The occurrence's date, clamped to the length of the month. */
export function occurrenceDate(recurrence: Recurrence, month: MonthKey): string {
  const day = Math.min(recurrence.day, daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

export function occurrenceOf(recurrence: Recurrence, month: MonthKey): TransactionInput {
  return {
    date: occurrenceDate(recurrence, month),
    description: recurrence.description,
    category: recurrence.category,
    kind: recurrence.kind,
    amount: recurrence.amount,
    recurrenceId: recurrence.id,
  }
}

/**
 * The series a transaction stands for when it is made recurring: it repeats on
 * its own day, from its own month on. Everything else is copied over, so the
 * transaction on screen is exactly the first occurrence.
 */
export function recurrenceFromTransaction(
  transaction: TransactionInput,
  settings: RecurrenceSettings,
): RecurrenceInput {
  return {
    description: transaction.description,
    category: transaction.category,
    kind: transaction.kind,
    amount: transaction.amount,
    day: dayOf(transaction.date),
    frequency: settings.frequency,
    startMonth: monthKeyOf(transaction.date),
    occurrences: settings.occurrences,
  }
}

export function recurrencesFor(
  recurrences: readonly Recurrence[],
  month: MonthKey,
): Recurrence[] {
  return recurrences.filter((recurrence) => appliesTo(recurrence, month))
}

/**
 * The occurrences a month is still missing. Transactions already stamped with
 * a recurrence id are left untouched, however they were edited since.
 */
export function missingOccurrences(
  recurrences: readonly Recurrence[],
  month: MonthKey,
  transactions: readonly Transaction[],
): TransactionInput[] {
  const applied = new Set(
    transactions
      .map((transaction) => transaction.recurrenceId)
      .filter((id): id is string => id !== undefined),
  )

  return recurrencesFor(recurrences, month)
    .filter((recurrence) => !applied.has(recurrence.id))
    .map((recurrence) => occurrenceOf(recurrence, month))
}

function isRecurrence(value: unknown): value is Recurrence {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<Recurrence>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.category === 'string' &&
    (candidate.kind === 'income' || candidate.kind === 'expense') &&
    typeof candidate.amount === 'number' &&
    Number.isFinite(candidate.amount) &&
    typeof candidate.day === 'number' &&
    Number.isInteger(candidate.day) &&
    candidate.day >= FIRST_DAY &&
    candidate.day <= LAST_DAY &&
    isRecurrenceFrequency(candidate.frequency) &&
    isMonthKey(candidate.startMonth) &&
    (candidate.occurrences === undefined ||
      (typeof candidate.occurrences === 'number' &&
        Number.isInteger(candidate.occurrences) &&
        candidate.occurrences >= MIN_OCCURRENCES))
  )
}
