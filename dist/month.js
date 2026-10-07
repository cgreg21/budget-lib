/*
 * domain/month.ts — months are the unit the budget is organised in: one
 * month, one file. A month is identified by its ISO prefix ("2026-09"), which
 * sorts chronologically as plain text.
 *
 * Any month can be browsed, past or future, whether or not it holds data —
 * hence the arithmetic below and the bounds that keep keys four digits wide.
 */
import { todayIsoDate } from './transaction.js';
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_IN_YEAR = 12;
/** Navigable range. Wide enough for any budget, narrow enough to stay finite. */
export const FIRST_MONTH = '1970-01';
export const LAST_MONTH = '2099-12';
export function isMonthKey(value) {
    return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}
/** The month an ISO date ("2026-09-17") belongs to. */
export function monthKeyOf(isoDate) {
    return isoDate.slice(0, 7);
}
/** The day an ISO date ("2026-09-17") falls on, 1 to 31. */
export function dayOf(isoDate) {
    return Number(isoDate.slice(8, 10));
}
/** The month that is on screen by default, and where "today" belongs. */
export function currentMonthKey() {
    return monthKeyOf(todayIsoDate());
}
export function yearOf(month) {
    return Number(month.slice(0, 4));
}
/** The month number, 1 (January) to 12 (December). */
export function monthNumberOf(month) {
    return Number(month.slice(5, 7));
}
export function monthKeyFrom(year, monthNumber) {
    return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`;
}
/** Keeps a month inside the navigable range. */
export function clampMonth(month) {
    if (month < FIRST_MONTH)
        return FIRST_MONTH;
    return month > LAST_MONTH ? LAST_MONTH : month;
}
/** The month `delta` steps away: negative towards the past, positive towards the future. */
export function shiftMonth(month, delta) {
    const index = monthIndex(month) + delta;
    const clamped = Math.min(Math.max(index, monthIndex(FIRST_MONTH)), monthIndex(LAST_MONTH));
    const year = Math.floor(clamped / MONTHS_IN_YEAR);
    return monthKeyFrom(year, clamped - year * MONTHS_IN_YEAR + 1);
}
/** Comparator ordering months from the most recent to the oldest. */
export function compareMonthsDesc(a, b) {
    return b.localeCompare(a);
}
/** How many months separate two keys; negative when `to` comes first. */
export function monthsBetween(from, to) {
    return monthIndex(to) - monthIndex(from);
}
/** 28, 29, 30 or 31, depending on the month and on leap years. */
export function daysInMonth(month) {
    return new Date(yearOf(month), monthNumberOf(month), 0).getDate();
}
/**
 * The date a transaction gets when it is created while `month` is on screen:
 * today when that month is the current one, its first day otherwise — so a
 * new transaction always lands in the month being edited.
 */
export function defaultDateInMonth(month) {
    const today = todayIsoDate();
    return monthKeyOf(today) === month ? today : `${month}-01`;
}
/** Splits transactions into one bucket per month; used to migrate old data. */
export function groupByMonth(transactions) {
    const months = new Map();
    for (const transaction of transactions) {
        const month = monthKeyOf(transaction.date);
        const bucket = months.get(month);
        if (bucket)
            bucket.push(transaction);
        else
            months.set(month, [transaction]);
    }
    return months;
}
/** Position of a month on a continuous scale, so months can be added up. */
function monthIndex(month) {
    return yearOf(month) * MONTHS_IN_YEAR + monthNumberOf(month) - 1;
}
//# sourceMappingURL=month.js.map