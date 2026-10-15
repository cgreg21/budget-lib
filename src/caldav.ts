/*
 * caldav.ts — a minimal CalDAV client for one calendar collection.
 *
 * No I/O of its own: the application hands over an `HttpTransport` (fetch on
 * the web and desktop, the http module on mobile). That keeps this file pure
 * TypeScript and testable. Authentication is HTTP Basic.
 */
import { base64Utf8 } from './bytes.js'
import { CATEGORIES_EVENT_ID, categoriesToIcs, icsToCategories, icsToTransaction, transactionToIcs } from './calendar-ics.js'
import type { Category } from './category.js'
import type { Transaction } from './transaction.js'

export interface CalendarConfig {
  /** Whether the transactions are actually exchanged with the calendar. */
  enabled: boolean
  /** Address of the calendar collection, e.g. `https://cloud.example.org/remote.php/dav/calendars/alice/budget`. */
  calendarUrl: string
  username: string
  /** Minutes between automatic synchronisations; 0 or absent turns the periodic sync off. */
  syncIntervalMinutes?: number
}

/** The password is deliberately absent: it belongs to each platform's secure storage. */
export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = { enabled: false, calendarUrl: '', username: '', syncIntervalMinutes: 0 }

export type CalendarState = 'disabled' | 'syncing' | 'online' | 'offline' | 'error'

export interface CalendarStatus {
  state: CalendarState
  message?: string
  /** ISO date-time of the last successful synchronisation. */
  lastSync?: string
}

export const DISABLED_CALENDAR_STATUS: CalendarStatus = { state: 'disabled' }

export function isCalendarConfig(value: unknown): value is CalendarConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<CalendarConfig>
  return typeof c.enabled === 'boolean' && typeof c.calendarUrl === 'string' && typeof c.username === 'string'
      && (c.syncIntervalMinutes === undefined || typeof c.syncIntervalMinutes === 'number')
  }

/** Upper bound of the automatic synchronisation interval (one day). */
export const MAX_SYNC_INTERVAL_MINUTES = 1440

export function normalizeCalendarConfig(config: CalendarConfig): CalendarConfig {
  const calendarUrl = config.calendarUrl.trim().replace(/\/+$/, '')
  const username = config.username.trim()
  const syncIntervalMinutes = Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(0, Math.floor(Number.isFinite(config.syncIntervalMinutes) ? config.syncIntervalMinutes! : 0)))
  return { enabled: config.enabled && calendarUrl !== '' && username !== '', calendarUrl, username, syncIntervalMinutes }
}

export function isCalendarConfigComplete(config: CalendarConfig): boolean {
  return /^https?:\/\//i.test(config.calendarUrl) && config.username !== ''
}

export interface HttpRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

export interface HttpResponse {
  status: number
  /** Header names in lower case. */
  headers: Record<string, string>
  body: string
}

/** Rejects (network failure) only when no response was obtained; HTTP errors are plain responses. */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>

export type CalendarErrorKind = 'auth' | 'not-found' | 'conflict' | 'server'

export class CalendarError extends Error {
  constructor(readonly kind: CalendarErrorKind, readonly status: number, message: string) {
    super(message)
    this.name = 'CalendarError'
  }
}

/** An event read from the calendar. `transaction` is null for events that are not ours. */
export interface RemoteEvent {
  href: string
  etag?: string
  transaction: Transaction | null
  /** The category list, when this event is the category event. */
  categories?: Category[] | null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function textOf(xml: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(xml)
  return cdata !== null ? cdata[1] : decodeEntities(xml)
}

function element(block: string, name: string): string | undefined {
  const match = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(block)
  return match === null ? undefined : textOf(match[1])
}

export interface MultistatusEntry {
  href: string
  status: number
  etag?: string
  calendarData?: string
}

/** The responses of a WebDAV 207 Multi-Status body. */
export function parseMultistatus(xml: string): MultistatusEntry[] {
  const entries: MultistatusEntry[] = []
  const responses = xml.match(/<(?:[\w-]+:)?response(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? []
  for (const block of responses) {
    const href = element(block, 'href')?.trim()
    if (href === undefined || href === '') continue
    const statusText = element(block, 'status') ?? 'HTTP/1.1 200 OK'
    const status = Number(/\s(\d{3})\b/.exec(statusText)?.[1] ?? 200)
    entries.push({ href, status, etag: element(block, 'getetag')?.trim(), calendarData: element(block, 'calendar-data') })
  }
  return entries
}

export const CALENDAR_QUERY_BODY = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">',
  '<d:prop><d:getetag/><c:calendar-data/></d:prop>',
  '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>',
  '</c:calendar-query>',
].join('')

const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'

/** `.` and `..` segments removed from an absolute path (RFC 3986 §5.2.4). */
function normalizePath(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/').slice(1)) {
    if (segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return `/${out.join('/')}`
}

/** An absolute URL from the `href` of a response, resolved against the calendar address. */
export function resolveHref(calendarUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  const parsed = /^(https?:\/\/[^/?#]+)([^?#]*)/i.exec(calendarUrl)
  const origin = parsed?.[1] ?? ''
  const basePath = parsed?.[2] ?? ''
  if (href.startsWith('/')) return `${origin}${normalizePath(href)}`
  // A relative reference is resolved against the directory of the calendar address.
  const directory = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizePath(`${directory}${href}`)}`
}

export class CalDavClient {
  private readonly authorization: string

  constructor(
    private readonly config: Pick<CalendarConfig, 'calendarUrl' | 'username'>,
    password: string,
    private readonly transport: HttpTransport,
  ) {
    this.authorization = `Basic ${base64Utf8(`${config.username}:${password}`)}`
  }

  /** The address of the event holding a transaction. */
  hrefOf(id: string): string {
    return `${this.config.calendarUrl.replace(/\/+$/, '')}/${encodeURIComponent(id)}.ics`
  }

  private async send(method: string, url: string, headers: Record<string, string>, body?: string): Promise<HttpResponse> {
    return this.transport({ method, url, headers: { Authorization: this.authorization, ...headers }, body })
  }

  private fail(response: HttpResponse): never {
    if (response.status === 401 || response.status === 403) throw new CalendarError('auth', response.status, 'Authentication failed')
    if (response.status === 404) throw new CalendarError('not-found', response.status, 'Calendar not found')
    if (response.status === 409 || response.status === 412) throw new CalendarError('conflict', response.status, 'Conflict')
    throw new CalendarError('server', response.status, `Server answered ${response.status}`)
  }

  /** Throws a `CalendarError` unless the calendar can be reached with these credentials. */
  async check(): Promise<void> {
    const response = await this.send('PROPFIND', this.config.calendarUrl, { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }, PROPFIND_BODY)
    if (response.status !== 207 && response.status !== 200) this.fail(response)
  }

  /** Every event of the calendar. */
  async list(): Promise<RemoteEvent[]> {
    const response = await this.send('REPORT', this.config.calendarUrl, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, CALENDAR_QUERY_BODY)
    if (response.status !== 207) this.fail(response)
    const events: RemoteEvent[] = []
    for (const entry of parseMultistatus(response.body)) {
      if (entry.status >= 300 || entry.calendarData === undefined) continue
      const transaction = icsToTransaction(entry.calendarData)
      const event: RemoteEvent = { href: entry.href, etag: entry.etag, transaction }
      const categories = transaction === null ? icsToCategories(entry.calendarData) : null
      if (categories !== null) event.categories = categories
      events.push(event)
    }
    return events
  }

  /** Creates the event (no `etag`) or replaces the version `etag` stands for. Returns the new etag, if the server says. */
  async put(transaction: Transaction, etag?: string, href?: string): Promise<{ href: string; etag?: string }> {
    return this.write(transactionToIcs(transaction), etag, href ?? this.hrefOf(transaction.id))
  }

  /** Same as `put`, for the event that carries the category list. */
  async putCategories(categories: readonly Category[], etag?: string, href?: string): Promise<{ href: string; etag?: string }> {
    return this.write(categoriesToIcs(categories), etag, href ?? this.hrefOf(CATEGORIES_EVENT_ID))
  }

  private async write(ics: string, etag: string | undefined, target: string): Promise<{ href: string; etag?: string }> {
    const condition: Record<string, string> = etag === undefined ? { 'If-None-Match': '*' } : { 'If-Match': etag }
    const response = await this.send('PUT', resolveHref(this.config.calendarUrl, target), { 'Content-Type': 'text/calendar; charset=utf-8', ...condition }, ics)
    if (response.status < 200 || response.status >= 300) this.fail(response)
    return { href: target, etag: response.headers['etag'] }
  }

  /** Deletes an event; one that is already gone counts as deleted. */
  async remove(href: string, etag?: string): Promise<void> {
    const response = await this.send('DELETE', resolveHref(this.config.calendarUrl, href), etag === undefined ? {} : { 'If-Match': etag })
    if (response.status === 404 || (response.status >= 200 && response.status < 300)) return
    this.fail(response)
  }
}
