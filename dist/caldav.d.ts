import type { Transaction } from './transaction.js';
export interface CalendarConfig {
    /** Whether the transactions are actually exchanged with the calendar. */
    enabled: boolean;
    /** Address of the calendar collection, e.g. `https://cloud.example.org/remote.php/dav/calendars/alice/budget`. */
    calendarUrl: string;
    username: string;
}
/** The password is deliberately absent: it belongs to each platform's secure storage. */
export declare const DEFAULT_CALENDAR_CONFIG: CalendarConfig;
export type CalendarState = 'disabled' | 'syncing' | 'online' | 'offline' | 'error';
export interface CalendarStatus {
    state: CalendarState;
    message?: string;
    /** ISO date-time of the last successful synchronisation. */
    lastSync?: string;
}
export declare const DISABLED_CALENDAR_STATUS: CalendarStatus;
export declare function isCalendarConfig(value: unknown): value is CalendarConfig;
export declare function normalizeCalendarConfig(config: CalendarConfig): CalendarConfig;
export declare function isCalendarConfigComplete(config: CalendarConfig): boolean;
export interface HttpRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
}
export interface HttpResponse {
    status: number;
    /** Header names in lower case. */
    headers: Record<string, string>;
    body: string;
}
/** Rejects (network failure) only when no response was obtained; HTTP errors are plain responses. */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;
export type CalendarErrorKind = 'auth' | 'not-found' | 'conflict' | 'server';
export declare class CalendarError extends Error {
    readonly kind: CalendarErrorKind;
    readonly status: number;
    constructor(kind: CalendarErrorKind, status: number, message: string);
}
/** An event read from the calendar. `transaction` is null for events that are not ours. */
export interface RemoteEvent {
    href: string;
    etag?: string;
    transaction: Transaction | null;
}
/** Base64 of the UTF-8 text, without relying on `btoa`/`Buffer`. */
export declare function base64Utf8(text: string): string;
export interface MultistatusEntry {
    href: string;
    status: number;
    etag?: string;
    calendarData?: string;
}
/** The responses of a WebDAV 207 Multi-Status body. */
export declare function parseMultistatus(xml: string): MultistatusEntry[];
export declare const CALENDAR_QUERY_BODY: string;
/** An absolute URL from the `href` of a response, resolved against the calendar address. */
export declare function resolveHref(calendarUrl: string, href: string): string;
export declare class CalDavClient {
    private readonly config;
    private readonly transport;
    private readonly authorization;
    constructor(config: Pick<CalendarConfig, 'calendarUrl' | 'username'>, password: string, transport: HttpTransport);
    /** The address of the event holding a transaction. */
    hrefOf(id: string): string;
    private send;
    private fail;
    /** Throws a `CalendarError` unless the calendar can be reached with these credentials. */
    check(): Promise<void>;
    /** Every event of the calendar. */
    list(): Promise<RemoteEvent[]>;
    /** Creates the event (no `etag`) or replaces the version `etag` stands for. Returns the new etag, if the server says. */
    put(transaction: Transaction, etag?: string, href?: string): Promise<{
        href: string;
        etag?: string;
    }>;
    /** Deletes an event; one that is already gone counts as deleted. */
    remove(href: string, etag?: string): Promise<void>;
}
//# sourceMappingURL=caldav.d.ts.map