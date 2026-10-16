import { type MonthKey } from './month.js';
import type { Transaction, TransactionInput, TransactionKind } from './transaction.js';
export type DayFrequency = 'daily' | 'weekly';
export type MonthlyFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly';
export type RecurrenceFrequency = DayFrequency | MonthlyFrequency;
export declare const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[];
/** Months separating two occurrences of a monthly-based frequency. */
export declare const OCCURRENCE_INTERVAL: Record<MonthlyFrequency, number>;
/** Days separating two occurrences of a daily or weekly frequency. */
export declare const DAY_STEP: Record<DayFrequency, number>;
/** Daily and weekly series can hold several occurrences in one month. */
export declare function isDayBased(frequency: RecurrenceFrequency): frequency is DayFrequency;
export declare const FIRST_DAY = 1;
/** Longest month; shorter months clamp the day down (a 31 becomes the 30th). */
export declare const LAST_DAY = 31;
export declare const MIN_OCCURRENCES = 1;
/** 600 monthly occurrences: fifty years, far beyond any budget plan. */
export declare const MAX_OCCURRENCES = 600;
export declare const MIN_INTERVAL = 1;
/** A custom rhythm of up to five years between two occurrences. */
export declare const MAX_INTERVAL = 60;
/** An extra date of each period of a series, with its own amount (a tax paid in three instalments). */
export interface Installment {
    /** Months after the first occurrence of the period; 0 is the same month, on another day. */
    offset: number;
    day: number;
    /** Always positive; the sign is derived from the series' `kind`. */
    amount: number;
}
/** A date a series falls on, with the amount due that day. */
export interface Occurrence {
    date: string;
    amount: number;
}
export declare const MAX_INSTALLMENTS = 12;
export interface Recurrence {
    id: string;
    description: string;
    category: string;
    kind: TransactionKind;
    /** Always positive; the sign is derived from `kind`. */
    amount: number;
    /** Day of the month the occurrence is dated. */
    day: number;
    frequency: RecurrenceFrequency;
    /** Custom rhythm: every `interval` periods of `frequency` (days, weeks, months, quarters, years…). */
    interval?: number;
    /** First month it applies to; earlier months are left alone. */
    startMonth: MonthKey;
    /** How many occurrences the series counts. Absent means it never ends. */
    occurrences?: number;
    /** Last month the series applies to; combined with `occurrences`, the earliest end wins. */
    until?: MonthKey;
    /**
     * Monthly series paid only part of the year: it is due in the first `activeMonths` months of each
     * 12-month cycle counted from `startMonth` (10 for a bill spread over ten months, then two months off).
     */
    activeMonths?: number;
    /** Extra dates in each period, on top of the main one; only for monthly-based series due all year. */
    installments?: Installment[];
}
/** A recurrence that has not been persisted yet (no id assigned). */
export type RecurrenceInput = Omit<Recurrence, 'id'>;
/** The rhythm a transaction form asks for; `null` stands for a one-off transaction. */
export interface RecurrenceSettings {
    frequency: RecurrenceFrequency;
    interval?: number;
    occurrences?: number;
    until?: MonthKey;
    activeMonths?: number;
    installments?: Installment[];
}
export declare const MIN_ACTIVE_MONTHS = 1;
/** Fewer than twelve: a series due every month of the year has no cycle. */
export declare const MAX_ACTIVE_MONTHS = 11;
/** The months a monthly series is due in each 12-month cycle; `undefined` when it is due all year. */
export declare function cycleOf(recurrence: Pick<Recurrence, 'frequency' | 'interval' | 'activeMonths'>): number | undefined;
/** Whether a series can hold installments: monthly-based and due all year. */
export declare function canHaveInstallments(recurrence: Pick<Recurrence, 'frequency' | 'interval' | 'activeMonths'>): boolean;
/** The latest month offset an installment can have: it must stay inside its period. */
export declare function maxInstallmentOffset(recurrence: Pick<Recurrence, 'frequency' | 'interval'>): number;
/** Days for a daily or weekly series, months otherwise, between two occurrences: `interval` counts periods of the frequency. */
export declare function intervalOf(recurrence: Pick<Recurrence, 'frequency' | 'interval'>): number;
export declare function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency;
export declare function isRecurrenceList(value: unknown): value is Recurrence[];
/** Alphabetical, so the options list keeps a stable order. */
export declare function sortRecurrences(recurrences: readonly Recurrence[]): Recurrence[];
/** True when the recurrence produces an occurrence in that month. */
export declare function appliesTo(recurrence: Recurrence, month: MonthKey): boolean;
/** Every date the recurrence falls on in that month: one for a plain monthly-based series, several for a daily or weekly one or one with installments. */
export declare function occurrenceDates(recurrence: Recurrence, month: MonthKey): string[];
/** The dates the recurrence falls on in that month, with the amount due each time. */
export declare function occurrencesIn(recurrence: Recurrence, month: MonthKey): Occurrence[];
/** The date of the last occurrence of a limited series; `undefined` when it never ends. */
export declare function endDate(recurrence: Recurrence): string | undefined;
/** The last month of a limited series; `undefined` when it never ends. */
export declare function endMonth(recurrence: Recurrence): MonthKey | undefined;
/** The occurrence's date, clamped to the length of the month. */
export declare function occurrenceDate(recurrence: Recurrence, month: MonthKey): string;
export declare function occurrenceOf(recurrence: Recurrence, month: MonthKey, date?: string, amount?: number): TransactionInput;
/**
 * The series a transaction stands for when it is made recurring: it repeats on
 * its own day, from its own month on. Everything else is copied over, so the
 * transaction on screen is exactly the first occurrence.
 */
export declare function recurrenceFromTransaction(transaction: TransactionInput, settings: RecurrenceSettings): RecurrenceInput;
export declare function recurrencesFor(recurrences: readonly Recurrence[], month: MonthKey): Recurrence[];
/**
 * The occurrences a month is still missing. Transactions already stamped with
 * a recurrence id are left untouched, however they were edited since: a
 * monthly-based series is complete as soon as one is stamped, a daily or
 * weekly one once as many are stamped as the month has dates.
 */
export declare function missingOccurrences(recurrences: readonly Recurrence[], month: MonthKey, transactions: readonly Transaction[]): TransactionInput[];
//# sourceMappingURL=recurrence.d.ts.map