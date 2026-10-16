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

export type DayFrequency = 'daily' | 'weekly'
export type MonthlyFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly'
export type RecurrenceFrequency = DayFrequency | MonthlyFrequency

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
]

/** Months separating two occurrences of a monthly-based frequency. */
export const OCCURRENCE_INTERVAL: Record<MonthlyFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
}

/** Days separating two occurrences of a daily or weekly frequency. */
export const DAY_STEP: Record<DayFrequency, number> = {
  daily: 1,
  weekly: 7,
}

/** Daily and weekly series can hold several occurrences in one month. */
export function isDayBased(frequency: RecurrenceFrequency): frequency is DayFrequency {
  return frequency === 'daily' || frequency === 'weekly'
}

export const FIRST_DAY = 1
/** Longest month; shorter months clamp the day down (a 31 becomes the 30th). */
export const LAST_DAY = 31

export const MIN_OCCURRENCES = 1
/** 600 monthly occurrences: fifty years, far beyond any budget plan. */
export const MAX_OCCURRENCES = 600

export const MIN_INTERVAL = 1
/** A custom rhythm of up to five years between two occurrences. */
export const MAX_INTERVAL = 60

/** An extra date of each period of a series, with its own amount (a tax paid in three instalments). */
export interface Installment {
  /** Months after the first occurrence of the period; 0 is the same month, on another day. */
  offset: number
  day: number
  /** Always positive; the sign is derived from the series' `kind`. */
  amount: number
}

/** A date a series falls on, with the amount due that day. */
export interface Occurrence {
  date: string
  amount: number
}

export const MAX_INSTALLMENTS = 12

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
  /** Custom rhythm: every `interval` periods of `frequency` (days, weeks, months, quarters, years…). */
  interval?: number
  /** First month it applies to; earlier months are left alone. */
  startMonth: MonthKey
  /** How many occurrences the series counts. Absent means it never ends. */
  occurrences?: number
  /** Last month the series applies to; combined with `occurrences`, the earliest end wins. */
  until?: MonthKey
  /**
   * Monthly series paid only part of the year: it is due in the first `activeMonths` months of each
   * 12-month cycle counted from `startMonth` (10 for a bill spread over ten months, then two months off).
   */
  activeMonths?: number
  /** Extra dates in each period, on top of the main one; only for monthly-based series due all year. */
  installments?: Installment[]
}

/** A recurrence that has not been persisted yet (no id assigned). */
export type RecurrenceInput = Omit<Recurrence, 'id'>

/** The rhythm a transaction form asks for; `null` stands for a one-off transaction. */
export interface RecurrenceSettings {
  frequency: RecurrenceFrequency
  interval?: number
  occurrences?: number
  until?: MonthKey
  activeMonths?: number
  installments?: Installment[]
}

export const MIN_ACTIVE_MONTHS = 1
/** Fewer than twelve: a series due every month of the year has no cycle. */
export const MAX_ACTIVE_MONTHS = 11

/** The months a monthly series is due in each 12-month cycle; `undefined` when it is due all year. */
export function cycleOf(recurrence: Pick<Recurrence, 'frequency' | 'interval' | 'activeMonths'>): number | undefined {
  const { activeMonths } = recurrence
  if (activeMonths === undefined || activeMonths >= 12 || isDayBased(recurrence.frequency) || intervalOf(recurrence) !== 1) {
    return undefined
  }
  return activeMonths
}

/** Whether a series can hold installments: monthly-based and due all year. */
export function canHaveInstallments(recurrence: Pick<Recurrence, 'frequency' | 'interval' | 'activeMonths'>): boolean {
  return !isDayBased(recurrence.frequency) && (recurrence.activeMonths === undefined || recurrence.activeMonths >= 12)
}

/** The latest month offset an installment can have: it must stay inside its period. */
export function maxInstallmentOffset(recurrence: Pick<Recurrence, 'frequency' | 'interval'>): number {
  return isDayBased(recurrence.frequency) ? 0 : intervalOf(recurrence) - 1
}

/** Days for a daily or weekly series, months otherwise, between two occurrences: `interval` counts periods of the frequency. */
export function intervalOf(recurrence: Pick<Recurrence, 'frequency' | 'interval'>): number {
  const { frequency } = recurrence
  const count = recurrence.interval ?? 1
  return count * (isDayBased(frequency) ? DAY_STEP[frequency] : OCCURRENCE_INTERVAL[frequency])
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
  return occurrenceDates(recurrence, month).length > 0
}

/** Every date the recurrence falls on in that month: one for a plain monthly-based series, several for a daily or weekly one or one with installments. */
export function occurrenceDates(recurrence: Recurrence, month: MonthKey): string[] {
  return occurrencesIn(recurrence, month).map((occurrence) => occurrence.date)
}

/** The dates the recurrence falls on in that month, with the amount due each time. */
export function occurrencesIn(recurrence: Recurrence, month: MonthKey): Occurrence[] {
  if (isDayBased(recurrence.frequency)) {
    return dayOccurrenceDates(recurrence, month).map((date) => ({ date, amount: recurrence.amount }))
  }
  if (recurrence.until !== undefined && monthsBetween(month, recurrence.until) < 0) return []

  const parts = [{ offset: 0, day: recurrence.day, amount: recurrence.amount }, ...(recurrence.installments ?? [])]
  const found: Occurrence[] = []
  for (const part of parts) {
    const rank = occurrenceRank(recurrence, shiftMonth(month, -part.offset))
    if (rank === null) continue
    if (recurrence.occurrences !== undefined && rank >= recurrence.occurrences) continue
    found.push({ date: occurrenceDate({ ...recurrence, day: part.day }, month), amount: part.amount })
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))
}

const MS_PER_DAY = 86_400_000

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

function isoDateOfDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Day number of the last day a daily or weekly series can reach, bounded by its count and its last month. */
function lastDayNumber(recurrence: Recurrence): number | undefined {
  const step = intervalOf(recurrence)
  const start = dayNumber(occurrenceDate(recurrence, recurrence.startMonth))
  const byCount = recurrence.occurrences === undefined ? undefined : start + (recurrence.occurrences - 1) * step
  const byMonth =
    recurrence.until === undefined ? undefined : dayNumber(`${recurrence.until}-${daysInMonth(recurrence.until)}`)
  if (byCount === undefined) return byMonth
  return byMonth === undefined ? byCount : Math.min(byCount, byMonth)
}

function dayOccurrenceDates(recurrence: Recurrence, month: MonthKey): string[] {
  const step = intervalOf(recurrence)
  const start = dayNumber(occurrenceDate(recurrence, recurrence.startMonth))
  const monthStart = dayNumber(`${month}-01`)
  const monthEnd = monthStart + daysInMonth(month) - 1
  const limit = Math.min(monthEnd, lastDayNumber(recurrence) ?? monthEnd)

  const first = start + Math.max(0, Math.ceil((monthStart - start) / step)) * step
  const dates: string[] = []
  for (let day = first; day <= limit; day += step) dates.push(isoDateOfDayNumber(day))
  return dates
}

/** The date of the last occurrence of a limited series; `undefined` when it never ends. */
export function endDate(recurrence: Recurrence): string | undefined {
  if (isDayBased(recurrence.frequency)) {
    const last = lastDayNumber(recurrence)
    return last === undefined ? undefined : isoDateOfDayNumber(last)
  }
  const month = endMonth(recurrence)
  return month === undefined ? undefined : occurrenceDate({ ...recurrence, day: LAST_DAY }, month)
}

/** The last month of a limited series; `undefined` when it never ends. */
export function endMonth(recurrence: Recurrence): MonthKey | undefined {
  if (isDayBased(recurrence.frequency)) {
    const last = lastDayNumber(recurrence)
    return last === undefined ? undefined : monthKeyOf(isoDateOfDayNumber(last))
  }
  const cycle = cycleOf(recurrence)
  const periodEnd =
    recurrence.occurrences === undefined
      ? undefined
      : cycle === undefined
        ? shiftMonth(recurrence.startMonth, (recurrence.occurrences - 1) * intervalOf(recurrence))
        : shiftMonth(
            recurrence.startMonth,
            Math.floor((recurrence.occurrences - 1) / cycle) * 12 + ((recurrence.occurrences - 1) % cycle),
          )
  const spread = Math.max(0, ...(recurrence.installments ?? []).map((installment) => installment.offset))
  const byCount = periodEnd === undefined || spread === 0 ? periodEnd : shiftMonth(periodEnd, spread)
  if (recurrence.until === undefined) return byCount
  if (byCount === undefined) return recurrence.until
  return monthsBetween(byCount, recurrence.until) < 0 ? recurrence.until : byCount
}

/** Position of a month in the series, 0 for the first one; `null` when it is not due. */
function occurrenceRank(recurrence: Recurrence, month: MonthKey): number | null {
  const distance = monthsBetween(recurrence.startMonth, month)
  if (distance < 0) return null

  const interval = intervalOf(recurrence)
  if (distance % interval !== 0) return null

  const cycle = cycleOf(recurrence)
  if (cycle === undefined) return distance / interval
  const position = distance % 12
  return position < cycle ? Math.floor(distance / 12) * cycle + position : null
}

/** The occurrence's date, clamped to the length of the month. */
export function occurrenceDate(recurrence: Recurrence, month: MonthKey): string {
  const day = Math.min(recurrence.day, daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

export function occurrenceOf(
  recurrence: Recurrence,
  month: MonthKey,
  date: string = occurrenceDate(recurrence, month),
  amount: number = recurrence.amount,
): TransactionInput {
  return {
    date,
    description: recurrence.description,
    category: recurrence.category,
    kind: recurrence.kind,
    amount,
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
    ...(settings.interval === undefined ? {} : { interval: settings.interval }),
    ...(settings.until === undefined ? {} : { until: settings.until }),
    ...(settings.activeMonths === undefined ? {} : { activeMonths: settings.activeMonths }),
    ...(settings.installments === undefined || settings.installments.length === 0 ? {} : { installments: settings.installments.map((installment) => ({ ...installment })) }),
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
 * a recurrence id are left untouched, however they were edited since: a
 * monthly-based series is complete as soon as one is stamped, a daily or
 * weekly one once as many are stamped as the month has dates.
 */
export function missingOccurrences(
  recurrences: readonly Recurrence[],
  month: MonthKey,
  transactions: readonly Transaction[],
): TransactionInput[] {
  const missing: TransactionInput[] = []

  for (const recurrence of recurrences) {
    const due = occurrencesIn(recurrence, month)
    if (due.length === 0) continue

    const stamped = transactions.filter((transaction) => transaction.recurrenceId === recurrence.id)
    if (!isDayBased(recurrence.frequency) && due.length === 1) {
      if (stamped.length === 0) missing.push(occurrenceOf(recurrence, month, due[0].date, due[0].amount))
      continue
    }

    const taken = new Set(stamped.map((transaction) => transaction.date))
    let room = due.length - stamped.length
    for (const { date, amount } of due) {
      if (room <= 0) break
      if (taken.has(date)) continue
      missing.push(occurrenceOf(recurrence, month, date, amount))
      room--
    }
  }

  return missing
}

function isIntegerIn(value: unknown, min: number, max = Infinity): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
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
    isIntegerIn(candidate.day, FIRST_DAY, LAST_DAY) &&
    isRecurrenceFrequency(candidate.frequency) &&
    isMonthKey(candidate.startMonth) &&
    (candidate.occurrences === undefined || isIntegerIn(candidate.occurrences, MIN_OCCURRENCES)) &&
    (candidate.interval === undefined || isIntegerIn(candidate.interval, MIN_INTERVAL, MAX_INTERVAL)) &&
    (candidate.until === undefined || isMonthKey(candidate.until)) &&
    (candidate.activeMonths === undefined || isIntegerIn(candidate.activeMonths, MIN_ACTIVE_MONTHS, MAX_ACTIVE_MONTHS)) &&
    (candidate.installments === undefined || isInstallmentList(candidate.installments, candidate as Recurrence))
  )
}

function isInstallmentList(value: unknown, recurrence: Recurrence): value is Installment[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_INSTALLMENTS &&
    canHaveInstallments(recurrence) &&
    value.every((item) => {
      if (typeof item !== 'object' || item === null) return false
      const { offset, day, amount } = item as Partial<Installment>
      return (
        isIntegerIn(offset, 0, maxInstallmentOffset(recurrence)) &&
        isIntegerIn(day, FIRST_DAY, LAST_DAY) &&
        typeof amount === 'number' && Number.isFinite(amount)
      )
    })
  )
}
