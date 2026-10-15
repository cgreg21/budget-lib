/*
 * caldav.ts — a minimal CalDAV client for one calendar collection.
 *
 * No I/O of its own: the application hands over an `HttpTransport` (fetch on
 * the web and desktop, the http module on mobile). That keeps this file pure
 * TypeScript and testable. Authentication is HTTP Basic.
 */
import { base64Utf8 } from './bytes.js';
import { CATEGORIES_EVENT_ID, categoriesToIcs, icsToCategories, icsToTransaction, icsToTrashed, recurrenceEventId, recurrenceToIcs, transactionToIcs, trashedToIcs } from './calendar-ics.js';
/** The password is deliberately absent: it belongs to each platform's secure storage. */
export const DEFAULT_CALENDAR_CONFIG = { enabled: false, calendarUrl: '', username: '', syncIntervalMinutes: 0 };
export const DISABLED_CALENDAR_STATUS = { state: 'disabled' };
export function isCalendarConfig(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const c = value;
    return typeof c.enabled === 'boolean' && typeof c.calendarUrl === 'string' && typeof c.username === 'string'
        && (c.syncIntervalMinutes === undefined || typeof c.syncIntervalMinutes === 'number');
}
/** Upper bound of the automatic synchronisation interval (one day). */
export const MAX_SYNC_INTERVAL_MINUTES = 1440;
export function normalizeCalendarConfig(config) {
    const calendarUrl = config.calendarUrl.trim().replace(/\/+$/, '');
    const username = config.username.trim();
    const syncIntervalMinutes = Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(0, Math.floor(Number.isFinite(config.syncIntervalMinutes) ? config.syncIntervalMinutes : 0)));
    return { enabled: config.enabled && calendarUrl !== '' && username !== '', calendarUrl, username, syncIntervalMinutes };
}
export function isCalendarConfigComplete(config) {
    return /^https?:\/\//i.test(config.calendarUrl) && config.username !== '';
}
export class CalendarError extends Error {
    kind;
    status;
    constructor(kind, status, message) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.name = 'CalendarError';
    }
}
function decodeEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}
function textOf(xml) {
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(xml);
    return cdata !== null ? cdata[1] : decodeEntities(xml);
}
function element(block, name) {
    const match = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(block);
    return match === null ? undefined : textOf(match[1]);
}
/** The responses of a WebDAV 207 Multi-Status body. */
export function parseMultistatus(xml) {
    const entries = [];
    const responses = xml.match(/<(?:[\w-]+:)?response(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
    for (const block of responses) {
        const href = element(block, 'href')?.trim();
        if (href === undefined || href === '')
            continue;
        const statusText = element(block, 'status') ?? 'HTTP/1.1 200 OK';
        const status = Number(/\s(\d{3})\b/.exec(statusText)?.[1] ?? 200);
        entries.push({ href, status, etag: element(block, 'getetag')?.trim(), calendarData: element(block, 'calendar-data') });
    }
    return entries;
}
export const CALENDAR_QUERY_BODY = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">',
    '<d:prop><d:getetag/><c:calendar-data/></d:prop>',
    '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>',
    '</c:calendar-query>',
].join('');
const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>';
/** `.` and `..` segments removed from an absolute path (RFC 3986 §5.2.4). */
function normalizePath(path) {
    const out = [];
    for (const segment of path.split('/').slice(1)) {
        if (segment === '.')
            continue;
        if (segment === '..')
            out.pop();
        else
            out.push(segment);
    }
    return `/${out.join('/')}`;
}
/** An absolute URL from the `href` of a response, resolved against the calendar address. */
export function resolveHref(calendarUrl, href) {
    if (/^https?:\/\//i.test(href))
        return href;
    const parsed = /^(https?:\/\/[^/?#]+)([^?#]*)/i.exec(calendarUrl);
    const origin = parsed?.[1] ?? '';
    const basePath = parsed?.[2] ?? '';
    if (href.startsWith('/'))
        return `${origin}${normalizePath(href)}`;
    // A relative reference is resolved against the directory of the calendar address.
    const directory = basePath.endsWith('/') ? basePath : `${basePath}/`;
    return `${origin}${normalizePath(`${directory}${href}`)}`;
}
export class CalDavClient {
    config;
    transport;
    authorization;
    constructor(config, password, transport) {
        this.config = config;
        this.transport = transport;
        this.authorization = `Basic ${base64Utf8(`${config.username}:${password}`)}`;
    }
    /** The address of the event holding a transaction. */
    hrefOf(id) {
        return `${this.config.calendarUrl.replace(/\/+$/, '')}/${encodeURIComponent(id)}.ics`;
    }
    async send(method, url, headers, body) {
        return this.transport({ method, url, headers: { Authorization: this.authorization, ...headers }, body });
    }
    fail(response) {
        if (response.status === 401 || response.status === 403)
            throw new CalendarError('auth', response.status, 'Authentication failed');
        if (response.status === 404)
            throw new CalendarError('not-found', response.status, 'Calendar not found');
        if (response.status === 409 || response.status === 412)
            throw new CalendarError('conflict', response.status, 'Conflict');
        throw new CalendarError('server', response.status, `Server answered ${response.status}`);
    }
    /** Throws a `CalendarError` unless the calendar can be reached with these credentials. */
    async check() {
        const response = await this.send('PROPFIND', this.config.calendarUrl, { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }, PROPFIND_BODY);
        if (response.status !== 207 && response.status !== 200)
            this.fail(response);
    }
    /** Every event of the calendar. */
    async list() {
        const response = await this.send('REPORT', this.config.calendarUrl, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, CALENDAR_QUERY_BODY);
        if (response.status !== 207)
            this.fail(response);
        const events = [];
        for (const entry of parseMultistatus(response.body)) {
            if (entry.status >= 300 || entry.calendarData === undefined)
                continue;
            const transaction = icsToTransaction(entry.calendarData);
            const event = { href: entry.href, etag: entry.etag, transaction };
            const trashed = transaction === null ? icsToTrashed(entry.calendarData) : null;
            if (trashed !== null)
                event.trashed = trashed;
            const categories = transaction === null && trashed === null ? icsToCategories(entry.calendarData) : null;
            if (categories !== null)
                event.categories = categories;
            events.push(event);
        }
        return events;
    }
    /** Creates the event (no `etag`) or replaces the version `etag` stands for. Returns the new etag, if the server says. */
    async put(transaction, etag, href) {
        return this.write(transactionToIcs(transaction), etag, href ?? this.hrefOf(transaction.id));
    }
    /** Same as `put`, for a transaction in the trash. */
    async putTrashed(transaction, etag, href) {
        return this.write(trashedToIcs(transaction), etag, href ?? this.hrefOf(transaction.id));
    }
    /** Same as `put`, for the event that carries the category list. */
    async putCategories(categories, etag, href) {
        return this.write(categoriesToIcs(categories), etag, href ?? this.hrefOf(CATEGORIES_EVENT_ID));
    }
    /** Same as `put`, for the recurring event of a series. */
    async putRecurrence(recurrence, etag, href) {
        return this.write(recurrenceToIcs(recurrence), etag, href ?? this.hrefOf(recurrenceEventId(recurrence.id)));
    }
    async write(ics, etag, target) {
        const condition = etag === undefined ? { 'If-None-Match': '*' } : { 'If-Match': etag };
        const response = await this.send('PUT', resolveHref(this.config.calendarUrl, target), { 'Content-Type': 'text/calendar; charset=utf-8', ...condition }, ics);
        if (response.status < 200 || response.status >= 300)
            this.fail(response);
        return { href: target, etag: response.headers['etag'] };
    }
    /** Deletes an event; one that is already gone counts as deleted. */
    async remove(href, etag) {
        const response = await this.send('DELETE', resolveHref(this.config.calendarUrl, href), etag === undefined ? {} : { 'If-Match': etag });
        if (response.status === 404 || (response.status >= 200 && response.status < 300))
            return;
        this.fail(response);
    }
}
//# sourceMappingURL=caldav.js.map