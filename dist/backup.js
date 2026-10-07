/*
 * domain/backup.ts — the shape of a full backup and the rules for reading one
 * back in.
 *
 * A backup is a single JSON document holding everything the app owns: the
 * categories, the balance thresholds, the recurrences and every month of
 * history. It is self-describing (`format` and `version`) so a file picked by
 * mistake is rejected with a clear message rather than silently applied.
 *
 * Two ways of reading it back exist, and both live here as pure functions:
 *   - replacing, where the archive becomes the whole truth;
 *   - merging, where what is already there wins and the archive only fills the
 *     gaps. Merging is deliberately idempotent: importing the same file twice
 *     adds nothing the second time, which is what makes it safe to retry.
 */
import { isBalanceThresholds } from './balance.js';
import { fromLegacyCategories, isCategoryList, isLegacyCategoryList, } from './category.js';
import { isMonthKey } from './month.js';
import { isRecurrenceList } from './recurrence.js';
import { isTransactionArray } from './transaction.js';
/** Stamped in every archive so foreign JSON files can be told apart. */
export const BACKUP_FORMAT = 'budget-app-backup';
/** Bumped only if the shape ever changes in a way readers must know about. */
export const BACKUP_VERSION = 1;
export function createArchive(data, exportedAt = new Date().toISOString()) {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt,
        categories: data.categories.map((category) => ({ ...category })),
        thresholds: { ...data.thresholds },
        recurrences: data.recurrences.map((recurrence) => ({ ...recurrence })),
        months: sortedMonths(data.months),
    };
}
/** True for an archive this version knows how to read. */
export function isBackupArchive(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const { format, version } = value;
    return format === BACKUP_FORMAT && typeof version === 'number' && version <= BACKUP_VERSION;
}
/**
 * Validates the contents of an archive. Returns `null` when a section is
 * malformed: a half-applied backup would be worse than a refused one.
 */
export function parseBackupData(value) {
    if (!isBackupArchive(value))
        return null;
    const { categories, thresholds, recurrences, months } = value;
    const parsedCategories = parseCategories(categories);
    const parsedMonths = parseMonths(months);
    if (!parsedCategories || !parsedMonths)
        return null;
    if (!isBalanceThresholds(thresholds) || !isRecurrenceList(recurrences))
        return null;
    return {
        categories: parsedCategories,
        thresholds: { low: thresholds.low, medium: thresholds.medium, high: thresholds.high },
        recurrences,
        months: parsedMonths,
    };
}
export function countBackup(data) {
    const months = Object.values(data.months);
    return {
        months: months.length,
        transactions: months.reduce((total, transactions) => total + transactions.length, 0),
        categories: data.categories.length,
        recurrences: data.recurrences.length,
    };
}
/**
 * Keeps everything `current` holds and adds what only `incoming` has.
 *
 * Identity is checked twice over: by id, so a backup of the same data is
 * recognised, and by content, so a backup taken on another machine — where ids
 * differ — does not create twins. Thresholds are a single setting, not a
 * collection: merging leaves the ones in place untouched.
 */
export function mergeBackups(current, incoming) {
    const categories = [...current.categories];
    const knownNames = new Set(categories.map((category) => category.name));
    let addedCategories = 0;
    for (const category of incoming.categories) {
        if (knownNames.has(category.name))
            continue;
        knownNames.add(category.name);
        categories.push({ ...category });
        addedCategories += 1;
    }
    const recurrences = [...current.recurrences];
    const knownRecurrences = new Set(recurrences.map((recurrence) => recurrence.id));
    const recurrenceSignatures = new Set(recurrences.map(recurrenceSignature));
    let addedRecurrences = 0;
    for (const recurrence of incoming.recurrences) {
        if (knownRecurrences.has(recurrence.id) || recurrenceSignatures.has(recurrenceSignature(recurrence)))
            continue;
        knownRecurrences.add(recurrence.id);
        recurrenceSignatures.add(recurrenceSignature(recurrence));
        recurrences.push({ ...recurrence });
        addedRecurrences += 1;
    }
    const months = {};
    for (const [month, transactions] of Object.entries(current.months))
        months[month] = [...transactions];
    let addedTransactions = 0;
    const touchedMonths = new Set();
    for (const [month, transactions] of Object.entries(incoming.months)) {
        const existing = months[month] ?? [];
        const knownIds = new Set(existing.map((transaction) => transaction.id));
        const signatures = new Set(existing.map(transactionSignature));
        const merged = [...existing];
        for (const transaction of transactions) {
            if (knownIds.has(transaction.id) || signatures.has(transactionSignature(transaction)))
                continue;
            knownIds.add(transaction.id);
            signatures.add(transactionSignature(transaction));
            merged.push({ ...transaction });
            addedTransactions += 1;
            touchedMonths.add(month);
        }
        months[month] = merged;
    }
    return {
        data: { categories, thresholds: current.thresholds, recurrences, months: sortedMonths(months) },
        added: {
            months: touchedMonths.size,
            transactions: addedTransactions,
            categories: addedCategories,
            recurrences: addedRecurrences,
        },
    };
}
/** Two transactions are "the same" when every field a user can see matches. */
function transactionSignature({ date, description, category, kind, amount }) {
    return [date, description, category, kind, amount].join('|');
}
function recurrenceSignature(recurrence) {
    const { description, category, kind, amount, day, frequency, startMonth, occurrences } = recurrence;
    return [description, category, kind, amount, day, frequency, startMonth, occurrences ?? ''].join('|');
}
function parseCategories(value) {
    if (isCategoryList(value))
        return value.map(({ name, icon }) => ({ name, icon }));
    return isLegacyCategoryList(value) ? fromLegacyCategories(value) : null;
}
function parseMonths(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const months = {};
    for (const [month, transactions] of Object.entries(value)) {
        if (!isMonthKey(month) || !isTransactionArray(transactions))
            return null;
        if (transactions.length > 0)
            months[month] = transactions;
    }
    return months;
}
/** Chronological order, so the archive reads like the history it is. */
function sortedMonths(months) {
    const sorted = {};
    for (const month of Object.keys(months).sort()) {
        const transactions = months[month];
        if (transactions && transactions.length > 0)
            sorted[month] = transactions;
    }
    return sorted;
}
//# sourceMappingURL=backup.js.map