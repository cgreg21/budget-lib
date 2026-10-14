/*
 * bank-state.ts - what an application remembers about its bank connection: the
 * settings the user gave, the access the bank granted, and what was already
 * imported. Shared by both applications so the rules (when to import again,
 * how many ids to keep) are the same everywhere.
 *
 * The private key is not part of it: it belongs to the platform's secret store.
 */
import type { BankAccount, BankSession } from './enable-banking.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Imported once: the list of ids stays bounded, the oldest are forgotten first. */
export const MAX_REMEMBERED_BANK_IDS = 5000

/** Automatic imports are spaced out: banks only allow a few unattended accesses per day. */
export const BANK_AUTO_IMPORT_INTERVAL_MS = 6 * 3600 * 1000

export interface BankConfig {
  applicationId: string
  bankName: string
  bankCountry: string
  bankConsentSeconds: number
  redirectUrl: string
  /** Only transactions on or after this day (YYYY-MM-DD) are imported. */
  importFrom: string
}

export interface BankState {
  config: BankConfig
  session: BankSession | null
  /** The `state` of the authorisation in progress, checked when the bank sends the user back. */
  pendingState: string
  lastImportAt: string
  /** Imported once: a transaction deleted from the budget is not brought back by the next import. */
  importedIds: string[]
}

/**
 * A fresh state: no access yet, importing from the first day of the month of `today` (YYYY-MM-DD).
 * An unreadable `today` gives an empty `importFrom`, which the UI validates with `isBankDate`.
 */
export function defaultBankState(today: string, redirectUrl: string): BankState {
  return {
    config: {
      applicationId: '',
      bankName: '',
      bankCountry: 'FR',
      bankConsentSeconds: 0,
      redirectUrl,
      importFrom: isBankDate(today) ? `${today.trim().slice(0, 8)}01` : '',
    },
    session: null,
    pendingState: '',
    lastImportAt: '',
    importedIds: [],
  }
}

export function isBankConfig(value: unknown): value is BankConfig {
  const candidate = value as Partial<BankConfig> | null
  return typeof candidate === 'object' && candidate !== null
    && typeof candidate.applicationId === 'string'
    && typeof candidate.bankName === 'string'
    && typeof candidate.bankCountry === 'string'
    && typeof candidate.bankConsentSeconds === 'number' && Number.isFinite(candidate.bankConsentSeconds)
    && typeof candidate.redirectUrl === 'string'
    && typeof candidate.importFrom === 'string'
}

function isBankSession(value: unknown): value is BankSession {
  const candidate = value as Partial<BankSession> | null
  return typeof candidate === 'object' && candidate !== null
    && typeof candidate.sessionId === 'string'
    && typeof candidate.validUntil === 'string'
    && Array.isArray(candidate.accounts)
    && candidate.accounts.every((account: unknown) => {
      const a = account as Partial<BankAccount> | null
      return typeof a === 'object' && a !== null && typeof a.uid === 'string' && typeof a.label === 'string'
    })
}

export function isBankState(value: unknown): value is BankState {
  const candidate = value as Partial<BankState> | null
  return typeof candidate === 'object' && candidate !== null
    && isBankConfig(candidate.config)
    && (candidate.session === null || isBankSession(candidate.session))
    && typeof candidate.pendingState === 'string'
    && typeof candidate.lastImportAt === 'string'
    && Array.isArray(candidate.importedIds)
    && candidate.importedIds.every((id: unknown) => typeof id === 'string')
}

export function isBankDate(text: string): boolean {
  return ISO_DATE.test(text.trim())
}

/** Whether an unattended import is due: connected, access still valid, and the last one is old enough. */
export function isBankAutoImportDue(state: BankState, expired: boolean, nowMs: number): boolean {
  if (state.session === null || expired) return false
  const last = Date.parse(state.lastImportAt)
  return state.lastImportAt === '' || Number.isNaN(last) || nowMs - last >= BANK_AUTO_IMPORT_INTERVAL_MS
}

/** The ids to remember after an import, newest last, without duplicates, bounded. */
export function rememberBankIds(known: readonly string[], added: readonly string[]): string[] {
  const seen = new Set(added)
  const kept = known.filter((id) => !seen.has(id))
  return [...new Set([...kept, ...added])].slice(-MAX_REMEMBERED_BANK_IDS)
}
