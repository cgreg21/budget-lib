/*
 * bank-state.ts - what an application remembers about its bank connection: the
 * settings the user gave, the access the bank granted, and what was already
 * imported. Shared by both applications so the rules (when to import again,
 * how many ids to keep) are the same everywhere.
 *
 * The private key is not part of it: it belongs to the platform's secret store.
 */
import type { BankSession } from './enable-banking.js'

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

/** A fresh state: no access yet, importing from the first day of the month of `today` (YYYY-MM-DD). */
export function defaultBankState(today: string, redirectUrl: string): BankState {
  return {
    config: {
      applicationId: '',
      bankName: '',
      bankCountry: 'FR',
      bankConsentSeconds: 0,
      redirectUrl,
      importFrom: `${today.slice(0, 8)}01`,
    },
    session: null,
    pendingState: '',
    lastImportAt: '',
    importedIds: [],
  }
}

export function isBankState(value: unknown): value is BankState {
  const candidate = value as Partial<BankState> | null
  return typeof candidate === 'object' && candidate !== null
    && typeof candidate.config === 'object' && candidate.config !== null
    && typeof candidate.config.applicationId === 'string'
    && typeof candidate.config.redirectUrl === 'string'
    && typeof candidate.config.importFrom === 'string'
    && typeof candidate.pendingState === 'string'
    && typeof candidate.lastImportAt === 'string'
    && Array.isArray(candidate.importedIds)
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

/** The ids to remember after an import, newest last, bounded. */
export function rememberBankIds(known: readonly string[], added: readonly string[]): string[] {
  return [...known, ...added].slice(-MAX_REMEMBERED_BANK_IDS)
}
