/*
 * bank.ts - turning what a bank reports (through Enable Banking) into budget
 * transactions, and the small rules around an import: where the bank sends the
 * user back to, and how far back to look.
 */
import { FALLBACK_CATEGORY } from './category.js';
import { isMonthKey, monthKeyOf } from './month.js';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DESCRIPTION = 120;
const DAY_MS = 24 * 3600 * 1000;
/** Banks may book an entry a few days after its date: an import looks back this far. */
export const BANK_IMPORT_OVERLAP_DAYS = 7;
/** Which existing category a keyword of the description points to, tried in order. */
const CATEGORY_RULES = [
    { category: 'Salaire', income: true, pattern: /salaire|paie\b|remuneration|traitement|pole emploi|france travail|caf\b/ },
    { category: 'Alimentation', pattern: /carrefour|leclerc|intermarche|auchan|lidl|aldi|monoprix|casino|super u|biocoop|picard|boulang|boucher|restaurant|mcdo|mcdonald|uber ?eats|deliveroo/ },
    { category: 'Transport', pattern: /sncf|ratp|total|esso|shell|bp |station|peage|vinci|uber\b|blablacar|navigo|parking|ter bretagne|korrigo|star / },
    { category: 'Logement', pattern: /loyer|edf|engie|eau |veolia|syndic|assurance hab|leroy merlin|castorama|ikea/ },
    { category: 'Abonnements', pattern: /netflix|spotify|disney|amazon prime|canal\+?|deezer|youtube|apple\.com|google|orange|free mobile|sfr|bouygues|ovh|icloud/ },
    { category: 'Santé', pattern: /pharmacie|medecin|docteur|dentiste|mutuelle|hopital|clinique|opticien|laboratoire/ },
    { category: 'Loisirs', pattern: /cinema|fnac|steam|playstation|xbox|decathlon|theatre|concert|ticketmaster|cultura|amazon/ },
];
function fold(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
/** The category of a transaction: a rule when its category exists, otherwise the fallback one. */
export function guessCategory(description, kind, categories) {
    const known = new Map(categories.map((c) => [fold(c.name), c.name]));
    const text = fold(description);
    for (const rule of CATEGORY_RULES) {
        if ((rule.income === true) !== (kind === 'income'))
            continue;
        const name = known.get(fold(rule.category));
        if (name !== undefined && rule.pattern.test(text))
            return name;
    }
    return known.get(fold(FALLBACK_CATEGORY)) ?? categories[0]?.name ?? FALLBACK_CATEGORY;
}
/** 53-bit string hash (cyrb53): small, dependency free, stable across runs and devices. */
function hash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function dateOf(tx) {
    for (const candidate of [tx.booking_date, tx.value_date, tx.transaction_date]) {
        if (typeof candidate === 'string' && ISO_DATE.test(candidate.slice(0, 10)))
            return candidate.slice(0, 10);
    }
    return null;
}
function counterpartyOf(tx) {
    const party = tx.credit_debit_indicator === 'CRDT' ? tx.debtor : tx.creditor;
    return (party?.name ?? '').trim();
}
/** What the bank says about the transaction, as one line: who, then why. */
export function describeBankTransaction(tx) {
    const remittance = (tx.remittance_information ?? []).map((line) => line.trim()).filter((line) => line !== '').join(' ');
    const parts = [];
    const who = counterpartyOf(tx);
    if (who !== '')
        parts.push(who);
    if (remittance !== '' && (who === '' || !fold(remittance).includes(fold(who))))
        parts.push(remittance);
    if (parts.length === 0 && (tx.note ?? '').trim() !== '')
        parts.push((tx.note ?? '').trim());
    const text = parts.join(' - ').replace(/\s+/g, ' ');
    return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}\u2026` : text;
}
/** The identity of a bank transaction: its reference when the bank gives one, its content otherwise. */
function entryKey(tx, date, amount) {
    const reference = (tx.entry_reference ?? '').trim() || (tx.transaction_id ?? '').trim();
    if (reference !== '')
        return `ref:${reference}`;
    return `content:${date}|${tx.credit_debit_indicator}|${amount.toFixed(2)}|${describeBankTransaction(tx)}`;
}
/**
 * Turns what a bank returned for one account into budget transactions. Ids are derived from the
 * account and the bank's own identity of each entry, so the same entry always gets the same id:
 * importing twice, or from two devices, never duplicates it. Pending and unusable entries are left out.
 */
export function toBudgetTransactions(accountUid, entries, categories) {
    const seen = new Map();
    const result = [];
    for (const tx of entries) {
        if (tx.status !== undefined && tx.status !== 'BOOK')
            continue;
        const date = dateOf(tx);
        const amount = Math.round(Math.abs(Number(tx.transaction_amount.amount)) * 100) / 100;
        if (date === null || !isMonthKey(monthKeyOf(date)) || !Number.isFinite(amount) || amount === 0)
            continue;
        // Identical entries (two coffees the same day) are told apart by their rank.
        const key = entryKey(tx, date, amount);
        const rank = seen.get(key) ?? 0;
        seen.set(key, rank + 1);
        const kind = tx.credit_debit_indicator === 'CRDT' ? 'income' : 'expense';
        const description = describeBankTransaction(tx);
        result.push({
            id: `bank-${hash(`${accountUid}|${key}|${rank}`)}`,
            date,
            description,
            category: guessCategory(description, kind, categories),
            kind,
            amount,
        });
    }
    return result;
}
/** Reads the `code`, `state` and `error` from the full return address, or from a bare code. */
export function parseBankRedirect(input) {
    const text = input.trim();
    if (!text.includes('=') && !text.includes('?'))
        return { code: text, state: '', error: '' };
    const query = text.slice(text.indexOf('?') + 1).split('#')[0];
    const params = new Map();
    for (const pair of query.split('&')) {
        const [key, ...rest] = pair.split('=');
        const raw = rest.join('=').replace(/\+/g, ' ');
        try {
            params.set(key, decodeURIComponent(raw));
        }
        catch {
            params.set(key, raw);
        }
    }
    return {
        code: params.get('code') ?? '',
        state: params.get('state') ?? '',
        error: params.get('error_description') ?? params.get('error') ?? '',
    };
}
/** Whether `url` is the return address (the query string is not compared). */
export function isBankRedirect(url, redirectUrl) {
    const base = redirectUrl.split('?')[0];
    return base !== '' && url.startsWith(base);
}
/**
 * The first day (YYYY-MM-DD) to ask the bank for: the configured start the first time, then a
 * little before the last import so entries booked late are not missed.
 */
export function bankImportStart(importFrom, lastImportAt) {
    const last = Date.parse(lastImportAt);
    if (lastImportAt === '' || Number.isNaN(last))
        return importFrom;
    const overlap = new Date(last - BANK_IMPORT_OVERLAP_DAYS * DAY_MS).toISOString().slice(0, 10);
    return overlap > importFrom ? overlap : importFrom;
}
//# sourceMappingURL=bank.js.map