import { describe, expect, it } from 'vitest'
import {
  CalDavClient,
  CalendarError,
  base64Utf8,
  icsToTransaction,
  parseMultistatus,
  planSync,
  syncCalendar,
  transactionToIcs,
  type HttpRequest,
  type HttpResponse,
  type SyncBaseline,
  type Transaction,
} from '../src/index.js'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', date: '2026-10-09', description: 'Café; crème, "bio"', category: 'Alimentation', kind: 'expense', amount: 12.5, ...over,
})

/** A tiny in-memory CalDAV collection. */
function fakeServer(password = 'secret') {
  const events = new Map<string, { ics: string; version: number }>()
  const root = 'https://dav.test/cal'
  const transport = async (req: HttpRequest): Promise<HttpResponse> => {
    const res = (status: number, body = '', headers: Record<string, string> = {}): HttpResponse => ({ status, body, headers })
    if (req.headers.Authorization !== `Basic ${base64Utf8(`alice:${password}`)}`) return res(401)
    const path = req.url.replace('https://dav.test', '')
    if (req.method === 'PROPFIND') return res(207, '<d:multistatus xmlns:d="DAV:"/>')
    if (req.method === 'REPORT') {
      const parts = [...events].map(([href, e]) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>"${e.version}"</d:getetag><c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav"><![CDATA[${e.ics}]]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`)
      return res(207, `<d:multistatus xmlns:d="DAV:">${parts.join('')}</d:multistatus>`)
    }
    if (req.method === 'PUT') {
      const existing = events.get(path)
      if (req.headers['If-None-Match'] === '*' && existing) return res(412)
      if (req.headers['If-Match'] !== undefined && existing?.version !== Number(req.headers['If-Match'].replace(/"/g, ''))) return res(412)
      const version = (existing?.version ?? 0) + 1
      events.set(path, { ics: req.body ?? '', version })
      return res(existing ? 204 : 201, '', { etag: `"${version}"` })
    }
    if (req.method === 'DELETE') {
      if (!events.delete(path)) return res(404)
      return res(204)
    }
    return res(405)
  }
  return { events, transport, root }
}

describe('ics', () => {
  it('round-trips a transaction, including special characters and a recurrence', () => {
    const t = tx({ recurrenceId: 'r9', description: 'Une très longue description, avec; des "caractères" spéciaux et accentués — '.repeat(3) })
    expect(icsToTransaction(transactionToIcs(t))).toEqual(t)
  })

  it('writes an all-day event ending the next day', () => {
    const ics = transactionToIcs(tx({ date: '2026-12-31' }))
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
    expect(ics).toContain('UID:t1@budget')
  })

  it('ignores events that are not budget transactions', () => {
    expect(icsToTransaction('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261009T100000Z\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR')).toBeNull()
  })
})

describe('multistatus', () => {
  it('reads hrefs, etags, status and entity-escaped data', () => {
    const xml = '<D:multistatus xmlns:D="DAV:"><D:response><D:href>/a.ics</D:href><D:propstat><D:prop><D:getetag>"e1"</D:getetag><C:calendar-data>A&amp;B</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>'
    expect(parseMultistatus(xml)).toEqual([{ href: '/a.ics', status: 200, etag: '"e1"', calendarData: 'A&B' }])
  })
})

describe('base64Utf8', () => {
  it('matches the standard encoding', () => {
    expect(base64Utf8('alice:p\u00e4ssword')).toBe('YWxpY2U6cMOkc3N3b3Jk')
  })
})

describe('planSync', () => {
  const hashOf = (t: Transaction) => planSync({}, [t], []).upload.length
  it('uploads new local and downloads new remote transactions', () => {
    const plan = planSync({}, [tx({ id: 'a' })], [{ href: '/b.ics', etag: '"1"', transaction: tx({ id: 'b' }) }])
    expect(plan.upload.map((u) => u.transaction.id)).toEqual(['a'])
    expect(plan.download.map((d) => d.transaction.id)).toEqual(['b'])
    expect(hashOf(tx())).toBe(1)
  })
})

describe('syncCalendar', () => {
  const client = (s: ReturnType<typeof fakeServer>, password = 'secret') => new CalDavClient({ calendarUrl: s.root, username: 'alice' }, password, s.transport)

  it('rejects wrong credentials', async () => {
    const s = fakeServer()
    await expect(client(s, 'bad').check()).rejects.toMatchObject({ kind: 'auth' })
    await expect(client(s).check()).resolves.toBeUndefined()
  })

  it('syncs two devices through the calendar, including edits and deletions', async () => {
    const s = fakeServer()
    const c = client(s)

    // Device A creates two transactions.
    let a = [tx({ id: 'a1' }), tx({ id: 'a2', description: 'Loyer' })]
    let baseA: SyncBaseline = {}
    let out = await syncCalendar(c, a, baseA)
    baseA = out.baseline
    expect(out.uploaded).toBe(2)
    expect(s.events.size).toBe(2)

    // Device B downloads them.
    let b: Transaction[] = []
    let baseB: SyncBaseline = {}
    out = await syncCalendar(c, b, baseB)
    baseB = out.baseline
    b = out.upsertLocal
    expect(b.map((t) => t.id).sort()).toEqual(['a1', 'a2'])

    // B edits a1, deletes a2; A is idle.
    b = b.filter((t) => t.id !== 'a2').map((t) => (t.id === 'a1' ? { ...t, amount: 99 } : t))
    out = await syncCalendar(c, b, baseB)
    baseB = out.baseline
    expect(out.uploaded).toBe(1)
    expect(out.deleted).toBe(1)
    expect(s.events.size).toBe(1)

    // A picks both changes up.
    out = await syncCalendar(c, a, baseA)
    baseA = out.baseline
    a = a.filter((t) => !out.removeLocal.includes(t.id)).map((t) => out.upsertLocal.find((u) => u.id === t.id) ?? t)
    expect(a).toEqual([expect.objectContaining({ id: 'a1', amount: 99 })])

    // Stable: nothing more to do.
    out = await syncCalendar(c, a, baseA)
    expect([out.uploaded, out.downloaded, out.deleted, out.skipped]).toEqual([0, 0, 0, 0])
  })

  it('lets the calendar win when both sides edited the same transaction', async () => {
    const s = fakeServer()
    const c = client(s)
    let out = await syncCalendar(c, [tx()], {})
    const base = out.baseline
    await c.put(tx({ amount: 1 }), Object.values(base)[0].etag, Object.values(base)[0].href)
    out = await syncCalendar(c, [tx({ amount: 2 })], base)
    expect(out.upsertLocal).toEqual([expect.objectContaining({ amount: 1 })])
  })

  it('does not resurrect a transaction deleted on the calendar by another client', async () => {
    const s = fakeServer()
    const c = client(s)
    const out = await syncCalendar(c, [tx()], {})
    s.events.clear()
    const again = await syncCalendar(c, [tx()], out.baseline)
    expect(again.removeLocal).toEqual(['t1'])
  })

  it('exposes CalendarError', () => {
    expect(new CalendarError('auth', 401, 'x')).toBeInstanceOf(Error)
  })
})
