import { type Transaction } from './transaction.js';
/** A month identifier in ISO form, e.g. "2026-09". */
export type MonthKey = string;
/** Navigable range. Wide enough for any budget, narrow enough to stay finite. */
export declare const FIRST_MONTH: MonthKey;
export declare const LAST_MONTH: MonthKey;
export declare function isMonthKey(value: unknown): value is MonthKey;
/** The month an ISO date ("2026-09-17") belongs to. */
export declare function monthKeyOf(isoDate: string): MonthKey;
/** The day an ISO date ("2026-09-17") falls on, 1 to 31. */
export declare function dayOf(isoDate: string): number;
/** The month that is on screen by default, and where "today" belongs. */
export declare function currentMonthKey(): MonthKey;
export declare function yearOf(month: MonthKey): number;
/** The month number, 1 (January) to 12 (December). */
export declare function monthNumberOf(month: MonthKey): number;
export declare function monthKeyFrom(year: number, monthNumber: number): MonthKey;
/** Keeps a month inside the navigable range. */
export declare function clampMonth(month: MonthKey): MonthKey;
/** The month `delta` steps away: negative towards the past, positive towards the future. */
export declare function shiftMonth(month: MonthKey, delta: number): MonthKey;
/** Comparator ordering months from the most recent to the oldest. */
export declare function compareMonthsDesc(a: MonthKey, b: MonthKey): number;
/** How many months separate two keys; negative when `to` comes first. */
export declare function monthsBetween(from: MonthKey, to: MonthKey): number;
/** 28, 29, 30 or 31, depending on the month and on leap years. */
export declare function daysInMonth(month: MonthKey): number;
/**
 * The date a transaction gets when it is created while `month` is on screen:
 * today when that month is the current one, its first day otherwise — so a
 * new transaction always lands in the month being edited.
 */
export declare function defaultDateInMonth(month: MonthKey): string;
/** Splits transactions into one bucket per month; used to migrate old data. */
export declare function groupByMonth(transactions: readonly Transaction[]): Map<MonthKey, Transaction[]>;
//# sourceMappingURL=month.d.ts.map