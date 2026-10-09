/*
 * caldav.ts — a minimal CalDAV client for one calendar collection.
 *
 * No I/O of its own: the application hands over an `HttpTransport` (fetch on
 * the web and desktop, the http module on mobile). That keeps this file pure
 * TypeScript and testable. Authentication is HTTP Basic.
 */
import { icsToTransaction, transactionToIcs } from './calendar-ics.js'
import type { Transaction } from './transaction.js'

export interface CalendarConfig {
  /** Whether the transactions are actually exchanged with the calendar. */
  enabled: boolean
  /** Address of the calendar collection, e.g. `https://cloud.example.org/remote.php/dav/calendars/alice/budget`. */
  calendarUrl: string
  username: string
}

/** The password is deliberately absent: it belongs to each platform's secure storage. */
export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = { enabled: false, calendarUrl: '', username: '' }

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
}

export function normalizeCalendarConfig(config: CalendarConfig): CalendarConfig {
  const calendarUrl = config.calendarUrl.trim().replace(/\/+$/, '')
  const username = config.username.trim()
  return { enabled: config.enabled && calendarUrl !== '' && username !== '', calendarUrl, username }
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
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function utf8Bytes(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return bytes
}

/** Base64 of the UTF-8 text, without relying on `btoa`/`Buffer`. */
export function base64Utf8(text: string): string {
  const bytes = utf8Bytes(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : BASE64[c & 63]
  }
  return out
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

/** An absolute URL from the `href` of a response, resolved against the calendar address. */
export function resolveHref(calendarUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  const origin = /^(https?:\/\/[^/]+)/i.exec(calendarUrl)?.[1] ?? ''
  if (href.startsWith('/')) return `${origin}${href}`
  return `${calendarUrl.replace(/\/+$/, '')}/${href}`
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
      events.push({ href: entry.href, etag: entry.etag, transaction: icsToTransaction(entry.calendarData) })
    }
    return events
  }

  /** Creates the event (no `etag`) or replaces the version `etag` stands for. Returns the new etag, if the server says. */
  async put(transaction: Transaction, etag?: string, href?: string): Promise<{ href: string; etag?: string }> {
    const target = href ?? this.hrefOf(transaction.id)
    const condition: Record<string, string> = etag === undefined ? { 'If-None-Match': '*' } : { 'If-Match': etag }
    const response = await this.send('PUT', resolveHref(this.config.calendarUrl, target), { 'Content-Type': 'text/calendar; charset=utf-8', ...condition }, transactionToIcs(transaction))
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
