/*
 * Covers the Enable Banking client against a fake transport: the token and its
 * reuse, the requests it sends, pagination, and how failures are classified.
 */
import { describe, expect, it } from 'vitest'

import {
  BankApiError,
  BankTokenSource,
  EnableBankingClient,
  isSessionExpired,
  normalizePrivateKey,
  signBankToken,
  type BankHttp,
  type JwtSigner,
} from '../src/index.js'

const sign: JwtSigner = (header, payload) => JSON.stringify({ header, payload })

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

/** A transport answering from a script, one answer per call, and recording what it was asked. */
function fakeHttp(answers: ({ status: number; body: unknown } | Error)[]): { http: BankHttp; calls: Call[] } {
  const calls: Call[] = []
  const http: BankHttp = async (request) => {
    calls.push(request)
    const answer = answers.shift()
    if (answer === undefined) throw new Error('unexpected call')
    if (answer instanceof Error) throw answer
    return { status: answer.status, body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body) }
  }
  return { http, calls }
}

const clientOf = (http: BankHttp): EnableBankingClient => new EnableBankingClient(http, sign, 'app-id', 'KEY')

describe('normalizePrivateKey', () => {
  it('rewraps a pasted PEM whatever its line breaks', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\r\n${'A'.repeat(100)}\r\n  ${'B'.repeat(10)}\r\n-----END PRIVATE KEY-----\r\n`
    const lines = normalizePrivateKey(pem).split('\n')
    expect(lines[0]).toBe('-----BEGIN PRIVATE KEY-----')
    expect(lines[1]).toHaveLength(64)
    expect(lines.at(-2)).toBe('-----END PRIVATE KEY-----')
  })

  it('returns an empty text when there is no key', () => {
    expect(normalizePrivateKey('hello')).toBe('')
  })
})

describe('signBankToken', () => {
  it('asks for an hour-long RS256 token identified by the application', () => {
    const { header, payload } = JSON.parse(signBankToken(sign, 'app-id', 'KEY', 1_700_000_000_500))
    expect(header).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-id' })
    expect(payload).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_700_000_000, exp: 1_700_003_600 })
  })
})

describe('BankTokenSource', () => {
  it('reuses a token until it is about to expire', () => {
    let signed = 0
    const source = new BankTokenSource((...args) => `${++signed}:${sign(...args)}`, 'app', 'KEY')
    const first = source.get(0)
    expect(source.get(3_000_000)).toBe(first)
    expect(source.get(3_400_000)).not.toBe(first)
    expect(signed).toBe(2)
  })
})

describe('isSessionExpired', () => {
  const session = { sessionId: 's', accounts: [], validUntil: '2026-10-10T00:00:00Z' }

  it('is true once the access has run out', () => {
    expect(isSessionExpired(session, Date.parse('2026-10-11T00:00:00Z'))).toBe(true)
    expect(isSessionExpired(session, Date.parse('2026-10-09T00:00:00Z'))).toBe(false)
  })

  it('is false without a session or an end date', () => {
    expect(isSessionExpired(null)).toBe(false)
    expect(isSessionExpired({ ...session, validUntil: '' })).toBe(false)
  })
})

describe('EnableBankingClient', () => {
  it('lists the banks of a country', async () => {
    const { http, calls } = fakeHttp([{ status: 200, body: { aspsps: [
      { name: 'Crédit Mutuel de Bretagne', country: 'FR', maximum_consent_validity: 7776000 },
      { name: '' },
    ] } }])
    const banks = await clientOf(http).listBanks('FR')
    expect(banks).toEqual([{ name: 'Crédit Mutuel de Bretagne', country: 'FR', maximumConsentSeconds: 7776000 }])
    expect(calls[0].url).toBe('https://api.enablebanking.com/aspsps?country=FR&psu_type=personal')
    expect(calls[0].headers.Authorization).toMatch(/^Bearer /)
  })

  it('starts an authorisation and returns the page to open', async () => {
    const { http, calls } = fakeHttp([{ status: 200, body: { url: 'https://bank.example/auth' } }])
    const url = await clientOf(http).startAuthorization(
      { name: 'CMB', country: 'FR', maximumConsentSeconds: 3600 }, 'budgetmobile://bank', 'st', 'fr',
    )
    expect(url).toBe('https://bank.example/auth')
    const sent = JSON.parse(calls[0].body ?? '{}')
    expect(sent).toMatchObject({ state: 'st', redirect_url: 'budgetmobile://bank', aspsp: { name: 'CMB', country: 'FR' } })
    expect(Date.parse(sent.access.valid_until)).toBeLessThan(Date.now() + 3600 * 1000)
  })

  it('rejects an authorisation without a page to open', async () => {
    const { http } = fakeHttp([{ status: 200, body: {} }])
    await expect(clientOf(http).startAuthorization({ name: 'B', country: 'FR', maximumConsentSeconds: 1 }, 'r', 's', 'fr'))
      .rejects.toMatchObject({ kind: 'rejected' })
  })

  it('creates a session with its accounts', async () => {
    const { http } = fakeHttp([{ status: 200, body: {
      session_id: 'sess', access: { valid_until: '2027-01-01T00:00:00Z' },
      accounts: [{ uid: 'u1', account_id: { iban: 'FR76' }, details: 'Compte courant' }, { name: 'no uid' }],
    } }])
    expect(await clientOf(http).createSession('code')).toEqual({
      sessionId: 'sess', validUntil: '2027-01-01T00:00:00Z', accounts: [{ uid: 'u1', label: 'Compte courant - FR76' }],
    })
  })

  it('refuses a session that shares no account', async () => {
    const { http } = fakeHttp([{ status: 200, body: { session_id: 's', accounts: [] } }])
    await expect(clientOf(http).createSession('code')).rejects.toBeInstanceOf(BankApiError)
  })

  it('follows the continuation key until the last page', async () => {
    const { http, calls } = fakeHttp([
      { status: 200, body: { transactions: [{ entry_reference: '1' }], continuation_key: 'next page' } },
      { status: 200, body: { transactions: [{ entry_reference: '2' }], continuation_key: null } },
    ])
    const list = await clientOf(http).transactions('acc/1', '2026-10-01')
    expect(list.map((tx) => tx.entry_reference)).toEqual(['1', '2'])
    expect(calls[0].url).toContain('/accounts/acc%2F1/transactions?date_from=2026-10-01&transaction_status=BOOK')
    expect(calls[1].url).toContain('&continuation_key=next%20page')
  })

  it.each([
    [429, {}, 'rate-limit'],
    [401, { message: 'Invalid signature' }, 'auth'],
    [403, { error: 'SESSION_CLOSED' }, 'expired'],
    [401, { message: 'consent expired' }, 'expired'],
    [503, {}, 'network'],
    [422, { message: 'bad date' }, 'rejected'],
  ])('classifies HTTP %i %j as %s', async (status, body, kind) => {
    const { http } = fakeHttp([{ status, body }])
    await expect(clientOf(http).listBanks('FR')).rejects.toMatchObject({ kind, status })
  })

  it('reports a transport failure as a network error', async () => {
    const { http } = fakeHttp([new Error('offline')])
    await expect(clientOf(http).listBanks('FR')).rejects.toMatchObject({ kind: 'network', message: 'offline' })
  })

  it('tolerates an unreadable answer body', async () => {
    const { http } = fakeHttp([{ status: 200, body: 'not json' }])
    expect(await clientOf(http).listBanks('FR')).toEqual([])
  })
})
