import { describe, expect, it } from 'vitest'

import {
  BANK_AUTO_IMPORT_INTERVAL_MS,
  MAX_REMEMBERED_BANK_IDS,
  defaultBankState,
  isBankAutoImportDue,
  isBankDate,
  isBankState,
  rememberBankIds,
} from '../../src/index.js'

const session = { sessionId: 's', accounts: [{ uid: 'u', label: 'L' }], validUntil: '2027-01-01T00:00:00Z' }

describe('defaultBankState', () => {
  it('imports from the first day of the current month, with nothing connected', () => {
    const state = defaultBankState('2026-10-09', 'app://bank')
    expect(state.config).toMatchObject({ importFrom: '2026-10-01', redirectUrl: 'app://bank', bankCountry: 'FR' })
    expect(state).toMatchObject({ session: null, pendingState: '', lastImportAt: '', importedIds: [] })
  })

  it('leaves importFrom empty for an unreadable date', () => {
    expect(defaultBankState('', 'r').config.importFrom).toBe('')
    expect(defaultBankState('garbage', 'r').config.importFrom).toBe('')
  })
})

describe('isBankState', () => {
  it('accepts what defaultBankState gives, and rejects anything else', () => {
    expect(isBankState(defaultBankState('2026-10-09', 'r'))).toBe(true)
    expect(isBankState({ ...defaultBankState('2026-10-09', 'r'), session })).toBe(true)
    expect(isBankState(null)).toBe(false)
    expect(isBankState({})).toBe(false)
    expect(isBankState({ ...defaultBankState('2026-10-09', 'r'), importedIds: 'x' })).toBe(false)
    expect(isBankState({ ...defaultBankState('2026-10-09', 'r'), config: null })).toBe(false)
  })

  it('rejects a partial config, a malformed session or non-string ids', () => {
    const base = defaultBankState('2026-10-09', 'r')
    expect(isBankState({ ...base, config: { ...base.config, bankName: undefined } })).toBe(false)
    expect(isBankState({ ...base, config: { ...base.config, bankConsentSeconds: '0' } })).toBe(false)
    expect(isBankState({ ...base, session: { sessionId: 's' } })).toBe(false)
    expect(isBankState({ ...base, session: { ...session, accounts: [{ uid: 'a' }] } })).toBe(false)
    expect(isBankState({ ...base, importedIds: ['a', 1] })).toBe(false)
  })
})

describe('isBankDate', () => {
  it('only accepts YYYY-MM-DD', () => {
    expect(isBankDate(' 2026-10-01 ')).toBe(true)
    expect(isBankDate('01/10/2026')).toBe(false)
  })
})

describe('isBankAutoImportDue', () => {
  const now = Date.parse('2026-10-09T12:00:00Z')
  const connected = { ...defaultBankState('2026-10-09', 'r'), session }

  it('is never due without a connection or with an expired access', () => {
    expect(isBankAutoImportDue(defaultBankState('2026-10-09', 'r'), false, now)).toBe(false)
    expect(isBankAutoImportDue(connected, true, now)).toBe(false)
  })

  it('is due when nothing was imported yet, or the last import is old enough', () => {
    expect(isBankAutoImportDue(connected, false, now)).toBe(true)
    const old = new Date(now - BANK_AUTO_IMPORT_INTERVAL_MS).toISOString()
    expect(isBankAutoImportDue({ ...connected, lastImportAt: old }, false, now)).toBe(true)
  })

  it('waits when the last import is recent', () => {
    const recent = new Date(now - 3600 * 1000).toISOString()
    expect(isBankAutoImportDue({ ...connected, lastImportAt: recent }, false, now)).toBe(false)
  })

  it('treats an unreadable date as due', () => {
    expect(isBankAutoImportDue({ ...connected, lastImportAt: 'garbage' }, false, now)).toBe(true)
  })
})

describe('rememberBankIds', () => {
  it('appends the new ids and forgets the oldest beyond the bound', () => {
    const known = Array.from({ length: MAX_REMEMBERED_BANK_IDS }, (_, i) => `k${i}`)
    const next = rememberBankIds(known, ['n1', 'n2'])
    expect(next).toHaveLength(MAX_REMEMBERED_BANK_IDS)
    expect(next.slice(-2)).toEqual(['n1', 'n2'])
    expect(next[0]).toBe('k2')
  })

  it('never keeps an id twice', () => {
    expect(rememberBankIds(['a', 'b', 'a'], ['b', 'c', 'c'])).toEqual(['a', 'b', 'c'])
  })
})
