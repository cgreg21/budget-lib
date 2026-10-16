/*
 * domain/recurrence.ts — transactions that come back every month, quarter or
 * year: rent, salary, insurance…
 *
 * A recurrence is a template, not a transaction. It produces one occurrence
 * per due month, stamped with its id so the same month is never filled twice
 * — that stamp is what makes applying a recurrence idempotent.
 */
import { dayOf, daysInMonth, isMonthKey, monthKeyOf, monthsBetween, shiftMonth, } from './month.js';
export const RECURRENCE_FREQUENCIES = [
    'daily',
    'weekly',
    'monthly',
    'bimonthly',
    'quarterly',
    'semiannual',
    'yearly',
];
/** Months separating two occurrences of a monthly-based frequency. */
export const OCCURRENCE_INTERVAL = {
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    semiannual: 6,
    yearly: 12,
};
/** Days separating two occurrences of a daily or weekly frequency. */
export const DAY_STEP = {
    daily: 1,
    weekly: 7,
};
/** Daily and weekly series can hold several occurrences in one month. */
export function isDayBased(frequency) {
    return frequency === 'daily' || frequency === 'weekly';
}
export const FIRST_DAY = 1;
/** Longest month; shorter months clamp the day down (a 31 becomes the 30th). */
export const LAST_DAY = 31;
export const MIN_OCCURRENCES = 1;
/** 600 monthly occurrences: fifty years, far beyond any budget plan. */
export const MAX_OCCURRENCES = 600;
export const MIN_INTERVAL = 1;
/** A custom rhythm of up to five years between two occurrences. */
export const MAX_INTERVAL = 60;
/** Days for a daily or weekly series, months otherwise, between two occurrences: `interval` counts periods of the frequency. */
export function intervalOf(recurrence) {
    const { frequency } = recurrence;
    const count = recurrence.interval ?? 1;
    return count * (isDayBased(frequency) ? DAY_STEP[frequency] : OCCURRENCE_INTERVAL[frequency]);
}
export function isRecurrenceFrequency(value) {
    return RECURRENCE_FREQUENCIES.includes(value);
}
export function isRecurrenceList(value) {
    return Array.isArray(value) && value.every(isRecurrence);
}
/** Alphabetical, so the options list keeps a stable order. */
export function sortRecurrences(recurrences) {
    return [...recurrences].sort((a, b) => a.description.localeCompare(b.description, 'fr'));
}
/** True when the recurrence produces an occurrence in that month. */
export function appliesTo(recurrence, month) {
    return occurrenceDates(recurrence, month).length > 0;
}
/** Every date the recurrence falls on in that month: one for a monthly-based series, several for a daily or weekly one. */
export function occurrenceDates(recurrence, month) {
    if (isDayBased(recurrence.frequency))
        return dayOccurrenceDates(recurrence, month);
    const rank = occurrenceRank(recurrence, month);
    if (rank === null)
        return [];
    if (recurrence.until !== undefined && monthsBetween(month, recurrence.until) < 0)
        return [];
    if (recurrence.occurrences !== undefined && rank >= recurrence.occurrences)
        return [];
    return [occurrenceDate(recurrence, month)];
}
const MS_PER_DAY = 86_400_000;
function dayNumber(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}
function isoDateOfDayNumber(day) {
    return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}
/** Day number of the last day a daily or weekly series can reach, bounded by its count and its last month. */
function lastDayNumber(recurrence) {
    const step = intervalOf(recurrence);
    const start = dayNumber(occurrenceDate(recurrence, recurrence.startMonth));
    const byCount = recurrence.occurrences === undefined ? undefined : start + (recurrence.occurrences - 1) * step;
    const byMonth = recurrence.until === undefined ? undefined : dayNumber(`${recurrence.until}-${daysInMonth(recurrence.until)}`);
    if (byCount === undefined)
        return byMonth;
    return byMonth === undefined ? byCount : Math.min(byCount, byMonth);
}
function dayOccurrenceDates(recurrence, month) {
    const step = intervalOf(recurrence);
    const start = dayNumber(occurrenceDate(recurrence, recurrence.startMonth));
    const monthStart = dayNumber(`${month}-01`);
    const monthEnd = monthStart + daysInMonth(month) - 1;
    const limit = Math.min(monthEnd, lastDayNumber(recurrence) ?? monthEnd);
    const first = start + Math.max(0, Math.ceil((monthStart - start) / step)) * step;
    const dates = [];
    for (let day = first; day <= limit; day += step)
        dates.push(isoDateOfDayNumber(day));
    return dates;
}
/** The date of the last occurrence of a limited series; `undefined` when it never ends. */
export function endDate(recurrence) {
    if (isDayBased(recurrence.frequency)) {
        const last = lastDayNumber(recurrence);
        return last === undefined ? undefined : isoDateOfDayNumber(last);
    }
    const month = endMonth(recurrence);
    return month === undefined ? undefined : occurrenceDate({ ...recurrence, day: LAST_DAY }, month);
}
/** The last month of a limited series; `undefined` when it never ends. */
export function endMonth(recurrence) {
    if (isDayBased(recurrence.frequency)) {
        const last = lastDayNumber(recurrence);
        return last === undefined ? undefined : monthKeyOf(isoDateOfDayNumber(last));
    }
    const byCount = recurrence.occurrences === undefined
        ? undefined
        : shiftMonth(recurrence.startMonth, (recurrence.occurrences - 1) * intervalOf(recurrence));
    if (recurrence.until === undefined)
        return byCount;
    if (byCount === undefined)
        return recurrence.until;
    return monthsBetween(byCount, recurrence.until) < 0 ? recurrence.until : byCount;
}
/** Position of a month in the series, 0 for the first one; `null` when it is not due. */
function occurrenceRank(recurrence, month) {
    const distance = monthsBetween(recurrence.startMonth, month);
    if (distance < 0)
        return null;
    const interval = intervalOf(recurrence);
    return distance % interval === 0 ? distance / interval : null;
}
/** The occurrence's date, clamped to the length of the month. */
export function occurrenceDate(recurrence, month) {
    const day = Math.min(recurrence.day, daysInMonth(month));
    return `${month}-${String(day).padStart(2, '0')}`;
}
export function occurrenceOf(recurrence, month, date = occurrenceDate(recurrence, month)) {
    return {
        date,
        description: recurrence.description,
        category: recurrence.category,
        kind: recurrence.kind,
        amount: recurrence.amount,
        recurrenceId: recurrence.id,
    };
}
/**
 * The series a transaction stands for when it is made recurring: it repeats on
 * its own day, from its own month on. Everything else is copied over, so the
 * transaction on screen is exactly the first occurrence.
 */
export function recurrenceFromTransaction(transaction, settings) {
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
    };
}
export function recurrencesFor(recurrences, month) {
    return recurrences.filter((recurrence) => appliesTo(recurrence, month));
}
/**
 * The occurrences a month is still missing. Transactions already stamped with
 * a recurrence id are left untouched, however they were edited since: a
 * monthly-based series is complete as soon as one is stamped, a daily or
 * weekly one once as many are stamped as the month has dates.
 */
export function missingOccurrences(recurrences, month, transactions) {
    const missing = [];
    for (const recurrence of recurrences) {
        const dates = occurrenceDates(recurrence, month);
        if (dates.length === 0)
            continue;
        const stamped = transactions.filter((transaction) => transaction.recurrenceId === recurrence.id);
        if (!isDayBased(recurrence.frequency)) {
            if (stamped.length === 0)
                missing.push(occurrenceOf(recurrence, month, dates[0]));
            continue;
        }
        const taken = new Set(stamped.map((transaction) => transaction.date));
        let room = dates.length - stamped.length;
        for (const date of dates) {
            if (room <= 0)
                break;
            if (taken.has(date))
                continue;
            missing.push(occurrenceOf(recurrence, month, date));
            room--;
        }
    }
    return missing;
}
function isRecurrence(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return (typeof candidate.id === 'string' &&
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
                candidate.occurrences >= MIN_OCCURRENCES)) &&
        (candidate.interval === undefined ||
            (typeof candidate.interval === 'number' &&
                Number.isInteger(candidate.interval) &&
                candidate.interval >= MIN_INTERVAL &&
                candidate.interval <= MAX_INTERVAL)) &&
        (candidate.until === undefined || isMonthKey(candidate.until)));
}
//# sourceMappingURL=recurrence.js.map