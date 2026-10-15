/*
 * calendar-ics.ts — a transaction as an iCalendar event, and back.
 *
 * Each transaction is one all-day VEVENT, so it shows up in any calendar
 * application. The budget-specific fields travel in X-BUDGET-* properties; an
 * event without them is not ours and is ignored.
 */
import { isCategoryList } from './category.js';
import { occurrenceDate } from './recurrence.js';
export const UID_SUFFIX = '@budget';
const FOLD_AT = 70;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function escapeText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}
function unescapeText(value) {
    return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}
function fold(line) {
    const chars = Array.from(line);
    if (chars.length <= FOLD_AT)
        return line;
    const parts = [];
    for (let i = 0; i < chars.length; i += FOLD_AT)
        parts.push(chars.slice(i, i + FOLD_AT).join(''));
    return parts.join('\r\n ');
}
function compactDate(isoDate) {
    return isoDate.replace(/-/g, '');
}
function nextDay(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return next.toISOString().slice(0, 10);
}
function stamp(now) {
    return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
/** Colour of an event (RFC 7986 COLOR, a CSS colour name): green for income, red for expenses. */
function eventColor(kind) {
    return kind === 'income' ? 'green' : 'red';
}
/** The iCalendar text of a transaction. `now` only feeds DTSTAMP. */
export function transactionToIcs(transaction, now = new Date()) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Budget//Transactions//FR',
        'BEGIN:VEVENT',
        `UID:${escapeText(transaction.id)}${UID_SUFFIX}`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${compactDate(transaction.date)}`,
        `DTEND;VALUE=DATE:${compactDate(nextDay(transaction.date))}`,
        `SUMMARY:${escapeText(transaction.description)}`,
        `CATEGORIES:${escapeText(transaction.category)}`,
        `DESCRIPTION:${transaction.kind === 'income' ? '+' : '-'}${transaction.amount}`,
        `COLOR:${eventColor(transaction.kind)}`,
        'TRANSP:TRANSPARENT',
        `X-BUDGET-KIND:${transaction.kind}`,
        `X-BUDGET-AMOUNT:${transaction.amount}`,
    ];
    if (transaction.recurrenceId !== undefined) {
        lines.push(`X-BUDGET-RECURRENCE:${escapeText(transaction.recurrenceId)}`);
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
}
function unfold(text) {
    return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}
function parseLine(line) {
    const colon = line.indexOf(':');
    if (colon < 1)
        return null;
    const head = line.slice(0, colon);
    const semi = head.indexOf(';');
    return {
        name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(),
        params: semi < 0 ? '' : head.slice(semi + 1).toUpperCase(),
        value: line.slice(colon + 1),
    };
}
function isoFromCompact(value) {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (match === null)
        return null;
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    return ISO_DATE.test(iso) ? iso : null;
}
function eventProperties(ics) {
    let inEvent = false;
    const props = new Map();
    for (const line of unfold(ics)) {
        if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            continue;
        }
        if (line === 'END:VEVENT')
            break;
        if (!inEvent)
            continue;
        const prop = parseLine(line);
        if (prop !== null && !props.has(prop.name))
            props.set(prop.name, prop);
    }
    return props;
}
/** UID of the single event that carries the category list (without `UID_SUFFIX`). */
export const CATEGORIES_EVENT_ID = 'categories';
/** Where the category event sits in the calendar: far from any real month, but still a valid all-day date. */
const CATEGORIES_EVENT_DATE = '2000-01-01';
const CATEGORIES_VERSION = 1;
/**
 * The iCalendar text of the category list: one all-day event, understood by
 * every application of the suite and ignored by older ones (it has no
 * X-BUDGET-KIND). The list itself is JSON in X-BUDGET-CATEGORIES; the
 * description only makes it readable in a calendar application.
 */
export function categoriesToIcs(categories, now = new Date()) {
    const payload = JSON.stringify({ version: CATEGORIES_VERSION, categories: categories.map(({ name, icon }) => ({ name, icon })) });
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Budget//Categories//FR',
        'BEGIN:VEVENT',
        `UID:${CATEGORIES_EVENT_ID}${UID_SUFFIX}`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${compactDate(CATEGORIES_EVENT_DATE)}`,
        `DTEND;VALUE=DATE:${compactDate(nextDay(CATEGORIES_EVENT_DATE))}`,
        'SUMMARY:Budget - categories (do not delete)',
        `DESCRIPTION:${escapeText(categories.map((category) => category.name).join(', '))}`,
        'TRANSP:TRANSPARENT',
        `X-BUDGET-CATEGORIES:${escapeText(payload)}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return `${lines.map(fold).join('\r\n')}\r\n`;
}
const RECURRENCE_INTERVAL = { monthly: 1, quarterly: 3, yearly: 12 };
/** UID of the recurring event of a series (without `UID_SUFFIX`). */
export function recurrenceEventId(recurrenceId) {
    return `recurrence-${recurrenceId}`;
}
/** The RRULE of a series; days past the 28th fall back on the last day of shorter months, like the app does. */
function recurrenceRule(recurrence) {
    const parts = ['FREQ=MONTHLY', `INTERVAL=${RECURRENCE_INTERVAL[recurrence.frequency]}`];
    if (recurrence.day > 28) {
        const days = Array.from({ length: recurrence.day - 27 }, (_, i) => 28 + i);
        parts.push(`BYMONTHDAY=${days.join(',')}`, 'BYSETPOS=-1');
    }
    if (recurrence.occurrences !== undefined)
        parts.push(`COUNT=${recurrence.occurrences}`);
    return parts.join(';');
}
/**
 * The iCalendar text of a series: one recurring all-day event, so the calendar
 * shows it ahead of time. It has no X-BUDGET-KIND, so it is never read back as
 * a transaction; the occurrences stay individual events.
 */
export function recurrenceToIcs(recurrence, now = new Date()) {
    const first = occurrenceDate(recurrence, recurrence.startMonth);
    const sign = recurrence.kind === 'income' ? '+' : '-';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Budget//Recurrences//FR',
        'BEGIN:VEVENT',
        `UID:${escapeText(recurrenceEventId(recurrence.id))}${UID_SUFFIX}`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${compactDate(first)}`,
        `DTEND;VALUE=DATE:${compactDate(nextDay(first))}`,
        `RRULE:${recurrenceRule(recurrence)}`,
        `SUMMARY:${escapeText(recurrence.description)}`,
        `CATEGORIES:${escapeText(recurrence.category)}`,
        `DESCRIPTION:${sign}${recurrence.amount}`,
        `COLOR:${eventColor(recurrence.kind)}`,
        'TRANSP:TRANSPARENT',
        'X-BUDGET-SERIES:1',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return `${lines.map(fold).join('\r\n')}\r\n`;
}
/** The category list an iCalendar text holds, or `null` when the event is not the category event or is malformed. */
export function icsToCategories(ics) {
    const raw = eventProperties(ics).get('X-BUDGET-CATEGORIES')?.value;
    if (raw === undefined)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(unescapeText(raw));
    }
    catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return null;
    const { version, categories } = parsed;
    if (version !== CATEGORIES_VERSION || !isCategoryList(categories))
        return null;
    return categories.map(({ name, icon }) => ({ name, icon }));
}
/** The transaction an iCalendar text holds, or `null` when the event is not one of ours. */
export function icsToTransaction(ics) {
    const props = eventProperties(ics);
    const uid = props.get('UID')?.value;
    const kind = props.get('X-BUDGET-KIND')?.value.trim();
    const amountText = props.get('X-BUDGET-AMOUNT')?.value.trim();
    const start = props.get('DTSTART')?.value.trim();
    if (uid === undefined || kind === undefined || amountText === undefined || start === undefined)
        return null;
    if (kind !== 'income' && kind !== 'expense')
        return null;
    const amount = Number(amountText);
    const date = isoFromCompact(start);
    if (!Number.isFinite(amount) || date === null)
        return null;
    const rawId = unescapeText(uid);
    const id = rawId.endsWith(UID_SUFFIX) ? rawId.slice(0, -UID_SUFFIX.length) : rawId;
    if (id === '')
        return null;
    const recurrence = props.get('X-BUDGET-RECURRENCE')?.value;
    const transaction = {
        id,
        date,
        description: unescapeText(props.get('SUMMARY')?.value ?? ''),
        category: unescapeText(props.get('CATEGORIES')?.value ?? ''),
        kind: kind,
        amount,
    };
    if (recurrence !== undefined && recurrence !== '')
        transaction.recurrenceId = unescapeText(recurrence);
    return transaction;
}
//# sourceMappingURL=calendar-ics.js.map