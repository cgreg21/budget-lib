import { describe, expect, it } from 'vitest'
import {
  CATEGORIES_BASELINE_KEY,
  CalDavClient,
  CalendarError,
  DEFAULT_CATEGORY_ICON,
  base64Utf8,
  categoriesHash,
  categoriesToIcs,
  ensureCategories,
  icsToCategories,
  icsToTransaction,
  mergeCategories,
  parseMultistatus,
  planCategories,
  planSync,
  resolveHref,
  syncCalendar,
  transactionHash,
  transactionToIcs,
  type HttpRequest,
  type HttpResponse,
  type Recurrence,
  type SyncBaseline,
  type Transaction,
} from '../src/index.js'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', date: '2026-10-09', description: 'CafÃ©; crÃ¨me, "bio"', category: 'Alimentation', kind: 'expense', amount: 12.5, ...over,
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
    const t = tx({ recurrenceId: 'r9', description: 'Une trÃ¨s longue description, avec; des "caractÃ¨res" spÃ©ciaux et accentuÃ©s â€” '.repeat(3) })
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

  it('omits the recurrence line for a one-off transaction', () => {
    expect(transactionToIcs(tx())).not.toContain('X-BUDGET-RECURRENCE')
  })

  it('signs the human-readable amount by kind', () => {
    expect(transactionToIcs(tx({ kind: 'income', amount: 3 }))).toContain('DESCRIPTION:+3')
    expect(transactionToIcs(tx({ kind: 'expense', amount: 3 }))).toContain('DESCRIPTION:-3')
  })

  it('colours events green for income and red for expenses', () => {
    expect(transactionToIcs(tx({ kind: 'income' }))).toContain('COLOR:green')
    expect(transactionToIcs(tx({ kind: 'expense' }))).toContain('COLOR:red')
  })

  const event = (lines: string[]) => ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const minimal = ['UID:t1@budget', 'X-BUDGET-KIND:expense', 'X-BUDGET-AMOUNT:5', 'DTSTART;VALUE=DATE:20261009']

  it('reads a minimal event, defaulting the texts and keeping the first of duplicated properties', () => {
    const parsed = icsToTransaction(event([...minimal, 'X-BUDGET-RECURRENCE:', 'X-BUDGET-AMOUNT:99', 'no colon here', 'SUMMARY:a\\Nb\\nc']))
    expect(parsed).toEqual({ id: 't1', date: '2026-10-09', description: 'a\nb\nc', category: '', kind: 'expense', amount: 5 })
  })

  it('accepts an UID without the budget suffix', () => {
    expect(icsToTransaction(event(['UID:plain', ...minimal.slice(1)]))?.id).toBe('plain')
  })

  it('ignores properties outside the event and stops at its end', () => {
    expect(icsToTransaction(`X-BUDGET-KIND:income\r\n${event(minimal)}\r\nSUMMARY:after`)).toMatchObject({ kind: 'expense', description: '' })
  })

  it.each([
    ['an unknown kind', ['UID:t1@budget', 'X-BUDGET-KIND:gift', 'X-BUDGET-AMOUNT:5', 'DTSTART:20261009']],
    ['a non-numeric amount', ['UID:t1@budget', 'X-BUDGET-KIND:expense', 'X-BUDGET-AMOUNT:five', 'DTSTART:20261009']],
    ['an unreadable date', ['UID:t1@budget', 'X-BUDGET-KIND:expense', 'X-BUDGET-AMOUNT:5', 'DTSTART:today']],
    ['an empty id', ['UID:@budget', 'X-BUDGET-KIND:expense', 'X-BUDGET-AMOUNT:5', 'DTSTART:20261009']],
    ['no event at all', ['X-BUDGET-KIND:expense']],
  ])('rejects %s', (_, lines) => {
    expect(icsToTransaction(event(lines))).toBeNull()
  })
})

describe('resolveHref', () => {
  const calendar = 'https://dav.example.org/cal/user/budget/'

  it('keeps absolute URLs and anchors absolute paths at the origin', () => {
    expect(resolveHref(calendar, 'https://other.example.org/x.ics')).toBe('https://other.example.org/x.ics')
    expect(resolveHref(calendar, '/cal/user/budget/t1.ics')).toBe('https://dav.example.org/cal/user/budget/t1.ics')
  })

  it('resolves relative references against the calendar directory', () => {
    expect(resolveHref(calendar, 't1.ics')).toBe('https://dav.example.org/cal/user/budget/t1.ics')
    expect(resolveHref('https://dav.example.org/cal/user/budget', 't1.ics')).toBe('https://dav.example.org/cal/user/budget/t1.ics')
    expect(resolveHref(calendar, './t1.ics')).toBe('https://dav.example.org/cal/user/budget/t1.ics')
    expect(resolveHref(calendar, '../other/t1.ics')).toBe('https://dav.example.org/cal/user/other/t1.ics')
    expect(resolveHref(calendar, '/a/./b/../c.ics')).toBe('https://dav.example.org/a/c.ics')
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

  it('ignores remote events that are not transactions', () => {
    const plan = planSync({}, [], [{ href: '/dentist.ics', transaction: null }])
    expect(plan).toEqual({ upload: [], download: [], deleteRemote: [], deleteLocal: [], settled: {}, dropped: [] })
  })

  it('uploads a local edit onto the unchanged remote version', () => {
    const remote = tx({ amount: 10 })
    const baseline: SyncBaseline = { t1: { href: '/t1.ics', etag: '"1"', hash: transactionHash(remote) } }
    const plan = planSync(baseline, [tx({ amount: 11 })], [{ href: '/t1.ics', etag: '"1"', transaction: remote }])
    expect(plan.upload).toEqual([{ transaction: tx({ amount: 11 }), href: '/t1.ics', etag: '"1"' }])
    expect(plan.download).toEqual([])
  })

  it('downloads the remote version when both sides changed or only the calendar did', () => {
    const base = tx({ amount: 1 })
    const baseline: SyncBaseline = { t1: { href: '/t1.ics', hash: transactionHash(base) } }
    const remote = { href: '/t1.ics', transaction: tx({ amount: 2 }) }
    expect(planSync(baseline, [tx({ amount: 3 })], [remote]).download).toHaveLength(1)
    expect(planSync(baseline, [base], [remote]).download).toHaveLength(1)
  })

  it('forgets baseline entries that exist on neither side', () => {
    const plan = planSync({ old: { href: '/old.ics', hash: 'h' } }, [], [])
    expect(plan.dropped).toEqual(['old'])
  })
})

describe('syncCalendar', () => {
  const client = (s: ReturnType<typeof fakeServer>, password = 'secret') => new CalDavClient({ calendarUrl: s.root, username: 'alice' }, password, s.transport)

  it('rejects wrong credentials', async () => {
    const s = fakeServer()
    await expect(client(s, 'bad').check()).rejects.toMatchObject({ kind: 'auth' })
    await expect(client(s).check()).resolves.toBeUndefined()
  })

  it('publishes a series as one recurring event, updates it, and removes it with the series', async () => {
    const s = fakeServer()
    const c = client(s)
    const series: Recurrence = {
      id: 'r1', description: 'Loyer', category: 'Logement', kind: 'expense', amount: 700,
      day: 31, frequency: 'quarterly', startMonth: '2026-10', occurrences: 4,
    }

    let out = await syncCalendar(c, [], {}, undefined, [series])
    expect(out.uploaded).toBe(1)
    const [[href, event]] = [...s.events]
    expect(href).toContain('recurrence-r1')
    expect(event.ics.replace(/\r\n /g, '')).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;COUNT=4')
    expect(event.ics).not.toContain('X-BUDGET-KIND')

    // Unchanged series: nothing is sent again.
    out = await syncCalendar(c, [], out.baseline, undefined, [series])
    expect(out.uploaded).toBe(0)

    out = await syncCalendar(c, [], out.baseline, undefined, [{ ...series, frequency: 'monthly' }])
    expect(out.uploaded).toBe(1)
    expect(s.events.get(href)?.ics).toContain('INTERVAL=1;')

    out = await syncCalendar(c, [], out.baseline, undefined, [{ ...series, frequency: 'monthly', interval: 5, until: '2027-02' }])
    expect(out.uploaded).toBe(1)
    expect(s.events.get(href)?.ics.replace(/\r\n /g, '')).toContain('INTERVAL=5;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20270228')

    out = await syncCalendar(c, [], out.baseline, undefined, [{ ...series, frequency: 'weekly', interval: 2 }])
    expect(out.uploaded).toBe(1)
    expect(s.events.get(href)?.ics).toContain('FREQ=WEEKLY;INTERVAL=2;')

    out = await syncCalendar(c, [], out.baseline, undefined, [])
    expect(out.deleted).toBe(1)
    expect(s.events.size).toBe(0)
  })

  it('publishes a weekly series with a weekly rule', async () => {
    const s = fakeServer()
    const series: Recurrence = {
      id: 'w1', description: 'Marché', category: 'Alimentation', kind: 'expense', amount: 20,
      day: 7, frequency: 'weekly', startMonth: '2026-10', occurrences: 10,
    }
    await syncCalendar(client(s), [], {}, undefined, [series])
    const [[, event]] = [...s.events]
    expect(event.ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10')
  })

  it('moves a trashed transaction through the calendar and back, or removes it when emptied', async () => {
    const s = fakeServer()
    const c = client(s)
    const item = tx({ id: 'a1' })

    let baseA: SyncBaseline = {}
    let out = await syncCalendar(c, [item], baseA, undefined, undefined, [])
    baseA = out.baseline
    let baseB: SyncBaseline = {}
    out = await syncCalendar(c, [], baseB, undefined, undefined, [])
    baseB = out.baseline
    expect(out.upsertLocal).toHaveLength(1)

    // A trashes it: the event stays, as a trashed one.
    const trashed = { ...item, deletedAt: '2026-01-01T00:00:00.000Z' }
    out = await syncCalendar(c, [], baseA, undefined, undefined, [trashed])
    baseA = out.baseline
    expect(s.events.size).toBe(1)

    // B (still holding it live) deletes it and gets it in its trash.
    out = await syncCalendar(c, [item], baseB, undefined, undefined, [])
    baseB = out.baseline
    expect(out.removeLocal).toEqual(['a1'])
    expect(out.trashAdded).toEqual([trashed])

    // Stable.
    out = await syncCalendar(c, [], baseB, undefined, undefined, [trashed])
    expect([out.uploaded, out.deleted, out.skipped, out.trashAdded.length, out.trashRemoved.length]).toEqual([0, 0, 0, 0, 0])

    // A empties its trash: the event goes away and B's trash is emptied too.
    out = await syncCalendar(c, [], baseA, undefined, undefined, [])
    baseA = out.baseline
    expect(s.events.size).toBe(0)
    out = await syncCalendar(c, [], baseB, undefined, undefined, [trashed])
    expect(out.trashRemoved).toEqual(['a1'])
  })

  it('restores a trashed transaction on the calendar', async () => {
    const s = fakeServer()
    const c = client(s)
    const item = tx({ id: 'a1' })
    const trashed = { ...item, deletedAt: '2026-01-01T00:00:00.000Z' }

    let out = await syncCalendar(c, [], {}, undefined, undefined, [trashed])
    const base = out.baseline
    out = await syncCalendar(c, [item], base, undefined, undefined, [])
    expect(out.uploaded).toBe(1)
    const other = await syncCalendar(c, [], {}, undefined, undefined, [])
    expect(other.upsertLocal).toEqual([item])
    expect(other.trashAdded).toEqual([])
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

  it('drops baseline entries that vanished on both sides', async () => {
    const out = await syncCalendar(client(fakeServer()), [], { ghost: { href: '/ghost.ics', hash: 'h' } })
    expect(out.baseline).toEqual({})
  })

  it('skips an upload the server refuses as a conflict and retries it next time', async () => {
    const s = fakeServer()
    const conflicting = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async (req) => {
      if (req.method === 'PUT') return { status: 412, headers: {}, body: '' }
      return s.transport(req)
    })
    const out = await syncCalendar(conflicting, [tx()], {})
    expect(out.skipped).toBe(1)
    expect(out.uploaded).toBe(0)
    expect(out.baseline).toEqual({})
    expect((await syncCalendar(client(s), [tx()], out.baseline)).uploaded).toBe(1)
  })

  it('skips a deletion the server refuses as a conflict', async () => {
    const s = fakeServer()
    const c = client(s)
    const first = await syncCalendar(c, [tx()], {})
    const failing = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async (req) => {
      if (req.method === 'DELETE') return { status: 412, headers: {}, body: '' }
      return s.transport(req)
    })
    const out = await syncCalendar(failing, [], first.baseline)
    expect(out.skipped).toBe(1)
    expect(out.deleted).toBe(0)
    expect(out.baseline.t1).toBeDefined()
  })

  it('propagates other errors', async () => {
    const s = fakeServer()
    const broken = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async (req) => {
      if (req.method === 'PUT') return { status: 500, headers: {}, body: '' }
      return s.transport(req)
    })
    await expect(syncCalendar(broken, [tx()], {})).rejects.toMatchObject({ kind: 'server' })
    const offline = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async () => { throw new Error('offline') })
    await expect(syncCalendar(offline, [], {})).rejects.toThrow('offline')
  })
})


describe('category synchronisation', () => {
  const client = (s: ReturnType<typeof fakeServer>) => new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', s.transport)
  const food = { name: 'Alimentation', icon: 'emoji-food-symbolic' }
  const pets = { name: 'Animaux', icon: 'emoji-nature-symbolic' }
  const trips = { name: 'Voyages', icon: 'emoji-travel-symbolic' }

  it('round-trips the list through its event, which is not a transaction', () => {
    const ics = categoriesToIcs([food, { name: 'CafÃ©, "crÃ¨me"; x', icon: 'i' }])
    expect(icsToCategories(ics)).toEqual([food, { name: 'CafÃ©, "crÃ¨me"; x', icon: 'i' }])
    expect(icsToTransaction(ics)).toBeNull()
    expect(ics).toContain('UID:categories@budget')
  })

  it('rejects events that are not a valid category list', () => {
    expect(icsToCategories(transactionToIcs(tx()))).toBeNull()
    const wrap = (value: string) => `BEGIN:VEVENT\r\nX-BUDGET-CATEGORIES:${value}\r\nEND:VEVENT`
    expect(icsToCategories(wrap('not json'))).toBeNull()
    expect(icsToCategories(wrap('42'))).toBeNull()
    expect(icsToCategories(wrap('null'))).toBeNull()
    expect(icsToCategories(wrap('{"version":2\\,"categories":[]}'))).toBeNull()
    expect(icsToCategories(wrap('{"version":1\\,"categories":[]}'))).toBeNull()
  })

  it('ensureCategories appends the missing names with their default icon', () => {
    expect(ensureCategories([food], ['Alimentation', '', 'Logement', 'Logement', 'Inconnue'])).toEqual([
      food,
      { name: 'Logement', icon: 'user-home-symbolic' },
      { name: 'Inconnue', icon: DEFAULT_CATEGORY_ICON },
    ])
  })

  it('merges with the remote order and icons first', () => {
    const local = [{ name: 'Alimentation', icon: 'other' }, pets]
    expect(mergeCategories([trips, food], local)).toEqual([trips, food, pets])
    expect(mergeCategories([], local)).toEqual(local)
  })

  describe('planCategories', () => {
    const entry = (list: typeof food[]) => ({ href: '/c.ics', hash: categoriesHash(list) })

    it('uploads when the calendar has no list', () => {
      expect(planCategories(undefined, [food], undefined, [])).toEqual({ list: [food], upload: true })
      expect(planCategories(undefined, [], undefined, [])).toEqual({ list: [], upload: false })
    })

    it('does nothing when both sides agree', () => {
      expect(planCategories(undefined, [food], [food], ['Alimentation'])).toEqual({ list: [food], upload: false })
    })

    it('uploads a local change and downloads a remote one', () => {
      expect(planCategories(entry([food]), [food, pets], [food], [])).toEqual({ list: [food, pets], upload: true })
      expect(planCategories(entry([food]), [food], [food, pets], [])).toEqual({ list: [food, pets], upload: false })
    })

    it('merges when both sides changed, or when there is no baseline', () => {
      expect(planCategories(entry([food]), [food, pets], [food, trips], [])).toEqual({ list: [food, trips, pets], upload: true })
      expect(planCategories(undefined, [pets], [trips], [])).toEqual({ list: [trips, pets], upload: true })
    })

    it('adds the categories the transactions use', () => {
      const plan = planCategories(entry([food]), [food], [food], ['Logement'])
      expect(plan.list).toHaveLength(2)
      expect(plan.upload).toBe(true)
    })
  })

  it('syncs the list between two devices and keeps every used category', async () => {
    const s = fakeServer()
    const c = client(s)

    let a = await syncCalendar(c, [tx({ id: 'a1', category: 'Animaux' })], {}, [food, pets])
    expect(a.categories).toBeNull()
    expect(s.events.has('/cal/categories.ics')).toBe(true)
    expect(a.baseline[CATEGORIES_BASELINE_KEY]).toBeDefined()
    expect(Object.keys(a.baseline).filter((k) => k !== CATEGORIES_BASELINE_KEY)).toEqual(['a1'])

    // A brand-new device receives the transactions and the whole list, in order.
    const b = await syncCalendar(c, [], {}, [food])
    expect(b.upsertLocal.map((t) => t.id)).toEqual(['a1'])
    expect(b.categories).toEqual([food, pets])

    // B adds a category; A gets it, then everything is stable.
    const b2 = await syncCalendar(c, b.upsertLocal, b.baseline, [food, pets, trips])
    expect(b2.categories).toBeNull()
    a = await syncCalendar(c, [tx({ id: 'a1', category: 'Animaux' })], a.baseline, [food, pets])
    expect(a.categories).toEqual([food, pets, trips])
    const stable = await syncCalendar(c, [tx({ id: 'a1', category: 'Animaux' })], a.baseline, [food, pets, trips])
    expect([stable.uploaded, stable.downloaded, stable.deleted, stable.skipped, stable.categories]).toEqual([0, 0, 0, 0, null])
  })

  it('creates the categories of downloaded transactions that no list mentions', async () => {
    const s = fakeServer()
    const c = client(s)
    await syncCalendar(c, [tx({ id: 'x', category: 'Inconnue' })], {})
    const out = await syncCalendar(c, [], {}, [food])
    expect(out.categories).toEqual([food, { name: 'Inconnue', icon: DEFAULT_CATEGORY_ICON }])
    expect(icsToCategories(s.events.get('/cal/categories.ics')!.ics)).toEqual(out.categories)
  })

  it('ignores the categories of a deleted transaction', async () => {
    const s = fakeServer()
    const c = client(s)
    const first = await syncCalendar(c, [tx({ id: 'x', category: 'Inconnue' })], {}, [food])
    s.events.delete('/cal/x.ics')
    const out = await syncCalendar(c, [tx({ id: 'x', category: 'Inconnue' })], first.baseline, [food])
    expect(out.removeLocal).toEqual(['x'])
    expect(out.categories).toBeNull()
  })

  it('leaves the list alone when no list is given', async () => {
    const s = fakeServer()
    const out = await syncCalendar(client(s), [tx()], {})
    expect(out.categories).toBeNull()
    expect(s.events.has('/cal/categories.ics')).toBe(false)
  })

  it('does not fail the run when the list cannot be written, and still applies it locally', async () => {
    const s = fakeServer()
    const readOnly = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async (req) => {
      if (req.method === 'PUT' && req.url.endsWith('/categories.ics')) return { status: 403, headers: {}, body: '' }
      return s.transport(req)
    })
    const out = await syncCalendar(readOnly, [tx({ category: 'Inconnue' })], {}, [food])
    expect(out.uploaded).toBe(1)
    expect(out.skipped).toBe(1)
    expect(out.categories).toEqual([food, { name: 'Inconnue', icon: DEFAULT_CATEGORY_ICON }])
    expect(out.baseline[CATEGORIES_BASELINE_KEY]).toBeUndefined()
  })

  it('propagates network errors on the list', async () => {
    const s = fakeServer()
    const down = new CalDavClient({ calendarUrl: s.root, username: 'alice' }, 'secret', async (req) => {
      if (req.method === 'PUT' && req.url.endsWith('/categories.ics')) throw new Error('offline')
      return s.transport(req)
    })
    await expect(syncCalendar(down, [], {}, [food])).rejects.toThrow('offline')
  })
})

