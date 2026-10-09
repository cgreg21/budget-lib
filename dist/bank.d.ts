import { type Category } from './category.js';
import type { Transaction } from './transaction.js';
/** The part of an Enable Banking transaction the budget needs. */
export interface BankTransaction {
    entry_reference?: string | null;
    transaction_id?: string | null;
    transaction_amount: {
        currency: string;
        amount: string;
    };
    credit_debit_indicator: 'CRDT' | 'DBIT';
    status?: string;
    booking_date?: string | null;
    value_date?: string | null;
    transaction_date?: string | null;
    creditor?: {
        name?: string | null;
    } | null;
    debtor?: {
        name?: string | null;
    } | null;
    remittance_information?: string[] | null;
    note?: string | null;
}
/** Banks may book an entry a few days after its date: an import looks back this far. */
export declare const BANK_IMPORT_OVERLAP_DAYS = 7;
/** The category of a transaction: a rule when its category exists, otherwise the fallback one. */
export declare function guessCategory(description: string, kind: Transaction['kind'], categories: readonly Category[]): string;
/** What the bank says about the transaction, as one line: who, then why. */
export declare function describeBankTransaction(tx: BankTransaction): string;
/**
 * Turns what a bank returned for one account into budget transactions. Ids are derived from the
 * account and the bank's own identity of each entry, so the same entry always gets the same id:
 * importing twice, or from two devices, never duplicates it. Pending and unusable entries are left out.
 */
export declare function toBudgetTransactions(accountUid: string, entries: readonly BankTransaction[], categories: readonly Category[]): Transaction[];
/** What the bank sent the user back with after the authorisation. */
export interface BankRedirect {
    code: string;
    state: string;
    /** The bank's refusal, empty when the authorisation went through. */
    error: string;
}
/** Reads the `code`, `state` and `error` from the full return address, or from a bare code. */
export declare function parseBankRedirect(input: string): BankRedirect;
/** Whether `url` is the return address (the query string is not compared). */
export declare function isBankRedirect(url: string, redirectUrl: string): boolean;
/**
 * The first day (YYYY-MM-DD) to ask the bank for: the configured start the first time, then a
 * little before the last import so entries booked late are not missed.
 */
export declare function bankImportStart(importFrom: string, lastImportAt: string): string;
//# sourceMappingURL=bank.d.ts.map