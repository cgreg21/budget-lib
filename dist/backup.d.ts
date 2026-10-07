import { type BalanceThresholds } from './balance.js';
import { type Category } from './category.js';
import { type MonthKey } from './month.js';
import { type Recurrence } from './recurrence.js';
import { type Transaction } from './transaction.js';
/** Stamped in every archive so foreign JSON files can be told apart. */
export declare const BACKUP_FORMAT = "budget-app-backup";
/** Bumped only if the shape ever changes in a way readers must know about. */
export declare const BACKUP_VERSION = 1;
/** Everything the application owns, gathered in one place. */
export interface BackupData {
    categories: Category[];
    thresholds: BalanceThresholds;
    recurrences: Recurrence[];
    /** One entry per month that holds transactions, keyed by month ("2026-09"). */
    months: Record<MonthKey, Transaction[]>;
}
export interface BackupArchive extends BackupData {
    format: string;
    version: number;
    /** ISO timestamp, informative only. */
    exportedAt: string;
}
/** How many of each kind an archive holds — or an import added. */
export interface BackupCounts {
    months: number;
    transactions: number;
    categories: number;
    recurrences: number;
}
export type ImportMode = 'replace' | 'merge';
export declare function createArchive(data: BackupData, exportedAt?: string): BackupArchive;
/** True for an archive this version knows how to read. */
export declare function isBackupArchive(value: unknown): value is BackupArchive;
/**
 * Validates the contents of an archive. Returns `null` when a section is
 * malformed: a half-applied backup would be worse than a refused one.
 */
export declare function parseBackupData(value: unknown): BackupData | null;
export declare function countBackup(data: BackupData): BackupCounts;
export interface MergeResult {
    data: BackupData;
    /** What the merge actually brought in — the numbers shown to the user. */
    added: BackupCounts;
}
/**
 * Keeps everything `current` holds and adds what only `incoming` has.
 *
 * Identity is checked twice over: by id, so a backup of the same data is
 * recognised, and by content, so a backup taken on another machine — where ids
 * differ — does not create twins. Thresholds are a single setting, not a
 * collection: merging leaves the ones in place untouched.
 */
export declare function mergeBackups(current: BackupData, incoming: BackupData): MergeResult;
//# sourceMappingURL=backup.d.ts.map