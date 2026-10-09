import type { BankSession } from './enable-banking.js';
/** Imported once: the list of ids stays bounded, the oldest are forgotten first. */
export declare const MAX_REMEMBERED_BANK_IDS = 5000;
/** Automatic imports are spaced out: banks only allow a few unattended accesses per day. */
export declare const BANK_AUTO_IMPORT_INTERVAL_MS: number;
export interface BankConfig {
    applicationId: string;
    bankName: string;
    bankCountry: string;
    bankConsentSeconds: number;
    redirectUrl: string;
    /** Only transactions on or after this day (YYYY-MM-DD) are imported. */
    importFrom: string;
}
export interface BankState {
    config: BankConfig;
    session: BankSession | null;
    /** The `state` of the authorisation in progress, checked when the bank sends the user back. */
    pendingState: string;
    lastImportAt: string;
    /** Imported once: a transaction deleted from the budget is not brought back by the next import. */
    importedIds: string[];
}
/** A fresh state: no access yet, importing from the first day of the month of `today` (YYYY-MM-DD). */
export declare function defaultBankState(today: string, redirectUrl: string): BankState;
export declare function isBankState(value: unknown): value is BankState;
export declare function isBankDate(text: string): boolean;
/** Whether an unattended import is due: connected, access still valid, and the last one is old enough. */
export declare function isBankAutoImportDue(state: BankState, expired: boolean, nowMs: number): boolean;
/** The ids to remember after an import, newest last, bounded. */
export declare function rememberBankIds(known: readonly string[], added: readonly string[]): string[];
//# sourceMappingURL=bank-state.d.ts.map