/*
 * Covers the CalDAV client in isolation: the configuration helpers, the
 * encoding and XML helpers, and how each request reacts to the server's answers.
 */
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_QUERY_BODY,
  CalDavClient,
  CalendarError,
  DEFAULT_CALENDAR_CONFIG,
  DISABLED_CALENDAR_STATUS,
  base64Utf8,
  isCalendarConfig,
  isCalendarConfigComplete,
  normalizeCalendarConfig,
  parseMultistatus,
  resolveHref,
  transactionToIcs,
  type HttpRequest,
  type HttpResponse,
  type Transaction,
} from '../src/index.js'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', date: '2026-10-09', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 700, ...over,
})

/** A transport answering from a script, one answer per call, and recording what it was asked. */
function scripted(answers: (Partial<HttpResponse> | Error)[]) {
  const calls: HttpRequest[] = []
  const transport = async (request: HttpRequest): Promise<HttpResponse> => {
    calls.push(request)
    const answer = answers.shift()
    if (answer === undefined) throw new Error('unexpected call')
    if (answer instanceof Error) throw answer
    return { status: 200, headers: {}, body: '', ...answer }
  }
  const client = new CalDavClient({ calendarUrl: 'https://dav.test/cal/', username: 'alice' }, 'pw', transport)
  return { calls, client }
}

describe('calendar configuration', () => {
  it('exposes the defaults', () => {
    expect(DEFAULT_CALENDAR_CONFIG).toEqual({ enabled: false, calendarUrl: '', username: '' })
    expect(DISABLED_CALENDAR_STATUS).toEqual({ state: 'disabled' })
  })

  it('recognises a configuration object', () => {
    expect(isCalendarConfig({ enabled: true, calendarUrl: 'https://x', username: 'u' })).toBe(true)
    expect(isCalendarConfig({ enabled: 'yes', calendarUrl: 'https://x', username: 'u' })).toBe(false)
    expect(isCalendarConfig({ enabled: true, calendarUrl: 1, username: 'u' })).toBe(false)
    expect(isCalendarConfig({ enabled: true, calendarUrl: 'https://x' })).toBe(false)
    expect(isCalendarConfig(null)).toBe(false)
    expect(isCalendarConfig('text')).toBe(false)
  })

  it('trims the fields and only keeps it enabled when complete', () => {
    expect(normalizeCalendarConfig({ enabled: true, calendarUrl: ' https://dav.test/cal// ', username: ' alice ' }))
      .toEqual({ enabled: true, calendarUrl: 'https://dav.test/cal', username: 'alice' })
    expect(normalizeCalendarConfig({ enabled: true, calendarUrl: '', username: 'alice' }).enabled).toBe(false)
    expect(normalizeCalendarConfig({ enabled: true, calendarUrl: 'https://dav.test', username: ' ' }).enabled).toBe(false)
    expect(normalizeCalendarConfig({ enabled: false, calendarUrl: 'https://dav.test', username: 'alice' }).enabled).toBe(false)
  })

  it('is complete with an http(s) address and a user name', () => {
    expect(isCalendarConfigComplete({ enabled: false, calendarUrl: 'HTTP://dav.test', username: 'alice' })).toBe(true)
    expect(isCalendarConfigComplete({ enabled: false, calendarUrl: 'ftp://dav.test', username: 'alice' })).toBe(false)
    expect(isCalendarConfigComplete({ enabled: false, calendarUrl: 'https://dav.test', username: '' })).toBe(false)
  })
})

describe('base64Utf8', () => {
  it('pads one- and two-byte remainders', () => {
    expect(base64Utf8('a')).toBe('YQ==')
    expect(base64Utf8('ab')).toBe('YWI=')
    expect(base64Utf8('abc')).toBe('YWJj')
    expect(base64Utf8('')).toBe('')
  })

  it('encodes three- and four-byte code points', () => {
    expect(base64Utf8('€')).toBe('4oKs')
    expect(base64Utf8('😀')).toBe('8J+YgA==')
  })
})

describe('parseMultistatus', () => {
  it('decodes numeric, hexadecimal and named entities', () => {
    const xml = '<d:multistatus><d:response><d:href>/a.ics</d:href><d:propstat><d:prop><c:calendar-data>&#233;&#xE9;&lt;&gt;&quot;&apos;&amp;</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>'
    expect(parseMultistatus(xml)[0].calendarData).toBe('éé<>"\'&')
  })

  it('reads CDATA sections verbatim', () => {
    const xml = '<response><href>/a.ics</href><calendar-data><![CDATA[A &amp; B]]></calendar-data></response>'
    expect(parseMultistatus(xml)[0].calendarData).toBe('A &amp; B')
  })

  it('skips responses without an href', () => {
    const xml = '<response><status>HTTP/1.1 200 OK</status></response><response><href>  </href></response><response><href>/ok.ics</href></response>'
    expect(parseMultistatus(xml).map((e) => e.href)).toEqual(['/ok.ics'])
  })

  it('assumes 200 when the status is missing or unreadable, and reads other codes', () => {
    expect(parseMultistatus('<response><href>/a</href></response>')[0]).toEqual({ href: '/a', status: 200, etag: undefined, calendarData: undefined })
    expect(parseMultistatus('<response><href>/a</href><status>weird</status></response>')[0].status).toBe(200)
    expect(parseMultistatus('<response><href>/a</href><status>HTTP/1.1 404 Not Found</status></response>')[0].status).toBe(404)
  })

  it('returns nothing for a body without responses', () => {
    expect(parseMultistatus('<d:multistatus xmlns:d="DAV:"/>')).toEqual([])
  })
})

describe('resolveHref', () => {
  it('copes with a calendar address that is not an http URL', () => {
    expect(resolveHref('not a url', '/a/b.ics')).toBe('/a/b.ics')
    expect(resolveHref('not a url', 'b.ics')).toBe('/b.ics')
  })

  it('resolves against the root when the calendar address has no path', () => {
    expect(resolveHref('https://dav.test', 'b.ics')).toBe('https://dav.test/b.ics')
    expect(resolveHref('https://dav.test/cal/?x=1#f', 'b.ics')).toBe('https://dav.test/cal/b.ics')
  })
})

describe('CalDavClient', () => {
  it('derives the address of an event from its id', () => {
    const { client } = scripted([])
    expect(client.hrefOf('a/b c')).toBe('https://dav.test/cal/a%2Fb%20c.ics')
  })

  it('sends Basic authentication on every request', async () => {
    const { calls, client } = scripted([{ status: 207 }])
    await client.check()
    expect(calls[0]).toMatchObject({ method: 'PROPFIND', url: 'https://dav.test/cal/', headers: { Authorization: `Basic ${base64Utf8('alice:pw')}`, Depth: '0' } })
  })

  it('accepts a 200 on check and classifies the failures', async () => {
    const { client } = scripted([{ status: 200 }, { status: 403 }, { status: 404 }, { status: 409 }, { status: 412 }, { status: 500 }])
    await expect(client.check()).resolves.toBeUndefined()
    await expect(client.check()).rejects.toMatchObject({ kind: 'auth', status: 403 })
    await expect(client.check()).rejects.toMatchObject({ kind: 'not-found', status: 404, message: 'Calendar not found' })
    await expect(client.check()).rejects.toMatchObject({ kind: 'conflict', status: 409 })
    await expect(client.check()).rejects.toMatchObject({ kind: 'conflict', status: 412 })
    await expect(client.check()).rejects.toMatchObject({ kind: 'server', status: 500, message: 'Server answered 500' })
  })

  it('propagates transport failures untouched', async () => {
    const { client } = scripted([new Error('offline')])
    await expect(client.check()).rejects.toThrow('offline')
  })

  it('lists events, ignoring failed responses, ones without data and foreign events', async () => {
    const ics = transactionToIcs(tx())
    const body = [
      '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">',
      `<d:response><d:href>/cal/t1.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag><c:calendar-data><![CDATA[${ics}]]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
      '<d:response><d:href>/cal/gone.ics</d:href><d:propstat><d:prop><c:calendar-data>x</c:calendar-data></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>',
      '<d:response><d:href>/cal/</d:href><d:propstat><d:prop><d:getetag>"c"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
      '<d:response><d:href>/cal/dentist.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:d\r\nEND:VEVENT\r\nEND:VCALENDAR</c:calendar-data></d:prop></d:propstat></d:response>',
      '</d:multistatus>',
    ].join('')
    const { calls, client } = scripted([{ status: 207, body }])
    const events = await client.list()
    expect(calls[0]).toMatchObject({ method: 'REPORT', headers: { Depth: '1' }, body: CALENDAR_QUERY_BODY })
    expect(events).toEqual([
      { href: '/cal/t1.ics', etag: '"1"', transaction: tx() },
      { href: '/cal/dentist.ics', etag: undefined, transaction: null },
    ])
  })

  it('fails to list when the server does not answer Multi-Status', async () => {
    const { client } = scripted([{ status: 401 }])
    await expect(client.list()).rejects.toMatchObject({ kind: 'auth' })
  })

  it('creates an event with If-None-Match and returns the server etag', async () => {
    const { calls, client } = scripted([{ status: 201, headers: { etag: '"9"' } }])
    expect(await client.put(tx())).toEqual({ href: 'https://dav.test/cal/t1.ics', etag: '"9"' })
    expect(calls[0]).toMatchObject({ method: 'PUT', url: 'https://dav.test/cal/t1.ics', headers: { 'If-None-Match': '*', 'Content-Type': 'text/calendar; charset=utf-8' } })
    expect(calls[0].headers['If-Match']).toBeUndefined()
    expect(calls[0].body).toContain('UID:t1@budget')
  })

  it('replaces an event with If-Match at the given href, without an etag when the server gives none', async () => {
    const { calls, client } = scripted([{ status: 204 }])
    expect(await client.put(tx(), '"3"', '/cal/other.ics')).toEqual({ href: '/cal/other.ics', etag: undefined })
    expect(calls[0]).toMatchObject({ url: 'https://dav.test/cal/other.ics', headers: { 'If-Match': '"3"' } })
    expect(calls[0].headers['If-None-Match']).toBeUndefined()
  })

  it('reports a refused PUT', async () => {
    const { client } = scripted([{ status: 412 }, { status: 302 }])
    await expect(client.put(tx())).rejects.toMatchObject({ kind: 'conflict' })
    await expect(client.put(tx())).rejects.toMatchObject({ kind: 'server', status: 302 })
  })

  it('deletes with or without a condition and treats a missing event as deleted', async () => {
    const { calls, client } = scripted([{ status: 204 }, { status: 404 }, { status: 403 }])
    await expect(client.remove('t1.ics', '"2"')).resolves.toBeUndefined()
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://dav.test/cal/t1.ics', headers: { 'If-Match': '"2"' } })
    await expect(client.remove('/cal/t1.ics')).resolves.toBeUndefined()
    expect(calls[1].headers['If-Match']).toBeUndefined()
    await expect(client.remove('/cal/t1.ics')).rejects.toBeInstanceOf(CalendarError)
  })
})
