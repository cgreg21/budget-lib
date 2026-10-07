/*
 * domain/transaction.ts — the transaction model and the pure rules that
 * operate on it (validation, sorting, aggregation). No GTK, no I/O: this
 * module is the single source of truth for *what* a budget is, independent
 * of how it is stored or displayed.
 */
function isTransaction(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return (typeof candidate.id === 'string' &&
        typeof candidate.date === 'string' &&
        typeof candidate.description === 'string' &&
        typeof candidate.category === 'string' &&
        (candidate.kind === 'income' || candidate.kind === 'expense') &&
        typeof candidate.amount === 'number' &&
        Number.isFinite(candidate.amount) &&
        (candidate.recurrenceId === undefined || typeof candidate.recurrenceId === 'string'));
}
/** Type guard used when reading `transactions.json`: rejects anything malformed. */
export function isTransactionArray(value) {
    return Array.isArray(value) && value.every(isTransaction);
}
/** Most recent transactions first. Returns a new array; the input is untouched. */
export function sortByDateDesc(transactions) {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
}
export const NO_FILTER = { search: '', kind: null, categories: [] };
export function isFilterActive({ search, kind, categories }) {
    return search.trim() !== '' || kind !== null || categories.length > 0;
}
/**
 * Case and accents dropped, so a French budget can be searched from a plain
 * keyboard: "electricite" finds « Électricité ». NFD splits each letter from
 * its accent, which the combining marks are then stripped from.
 *
 * The range is written out rather than `\p{Diacritic}`: some JavaScript
 * engines (the one of NativeScript on mobile) reject that property name.
 */
function fold(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
/** The transactions a filter keeps, in the order they came in. */
export function filterTransactions(transactions, { search, kind, categories }) {
    const needle = fold(search.trim());
    return transactions.filter((transaction) => ((kind === null || transaction.kind === kind)
        && (categories.length === 0 || categories.includes(transaction.category))
        && (needle === ''
            || fold(transaction.description).includes(needle)
            || fold(transaction.category).includes(needle))));
}
export function computeTotals(transactions) {
    let income = 0;
    let expense = 0;
    for (const transaction of transactions) {
        if (transaction.kind === 'income')
            income += transaction.amount;
        else
            expense += transaction.amount;
    }
    return { income, expense, balance: income - expense };
}
/** Total amount per category for a given kind, largest first. */
export function sumByCategory(transactions, kind) {
    const totals = new Map();
    for (const transaction of transactions) {
        if (transaction.kind !== kind)
            continue;
        totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
    }
    return [...totals.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
}
/** Today as an ISO date string ("YYYY-MM-DD"), the default date of a new transaction. */
export function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}
//# sourceMappingURL=transaction.js.map