import { CalDavClient, type RemoteEvent } from './caldav.js';
import { type Category } from './category.js';
import type { Recurrence } from './recurrence.js';
import type { Transaction, TrashedTransaction } from './transaction.js';
export interface BaselineEntry {
    /** Address of the event on the server. */
    href: string;
    etag?: string;
    /** `transactionHash` of the transaction as last synchronised. */
    hash: string;
}
export type SyncBaseline = Record<string, BaselineEntry>;
export interface SyncOutcome {
    upsertLocal: Transaction[];
    removeLocal: string[];
    baseline: SyncBaseline;
    uploaded: number;
    downloaded: number;
    deleted: number;
    /** Operations the server refused because the event changed meanwhile; the next run retries them. */
    skipped: number;
    /** The category list to store locally, or `null` when it stays as it is (or was not given to the run). */
    categories: Category[] | null;
    /** Transactions trashed from the calendar side, to add to the local trash (when a trash was given to the run). */
    trashAdded: TrashedTransaction[];
    /** Ids of the local trash entries restored or emptied from the calendar side. */
    trashRemoved: string[];
}
/** Key prefix under which `baseline` remembers a trashed event; no transaction id looks like it. */
export declare const TRASH_BASELINE_PREFIX = "@trash:";
export declare function trashHash(t: TrashedTransaction): string;
/** Key under which `baseline` remembers the category event; no transaction id looks like it. */
export declare const CATEGORIES_BASELINE_KEY = "@categories";
export declare function transactionHash(t: Transaction): string;
export declare function categoriesHash(categories: readonly Category[]): string;
/** `categories` followed by the names in `names` that it lacks, with the default icon of each. */
export declare function ensureCategories(categories: readonly Category[], names: Iterable<string>): Category[];
/** The remote list, then the local categories it lacks: the calendar wins on order and icons. */
export declare function mergeCategories(remote: readonly Category[], local: readonly Category[]): Category[];
export interface CategoriesPlan {
    /** The list both sides should end up with. */
    list: Category[];
    /** Whether the calendar must be updated to hold it. */
    upload: boolean;
}
/**
 * Pure decision for the category list, on the same three-way rule as the
 * transactions; `used` are the category names the transactions refer to, so a
 * category is never missing from the list. Both sides changed → the lists are merged.
 */
export declare function planCategories(base: BaselineEntry | undefined, local: readonly Category[], remote: readonly Category[] | undefined, used: Iterable<string>): CategoriesPlan;
export interface SyncPlan {
    upload: {
        transaction: Transaction;
        href?: string;
        etag?: string;
    }[];
    download: {
        transaction: Transaction;
        href: string;
        etag?: string;
    }[];
    deleteRemote: {
        id: string;
        href: string;
        etag?: string;
    }[];
    deleteLocal: string[];
    /** Entries that need no operation but whose etag/href must be refreshed. */
    settled: Record<string, BaselineEntry>;
    /** Entries to forget. */
    dropped: string[];
}
/** Pure decision: which operations bring both sides in line. */
export declare function planSync(baseline: SyncBaseline, local: readonly Transaction[], remote: readonly RemoteEvent[]): SyncPlan;
/**
 * One synchronisation run. Network failures propagate; per-event conflicts are skipped.
 * Pass the local `categories` to synchronise the category list too: the result is
 * in `outcome.categories` (null when the local list is already right).
 */
export declare function syncCalendar(client: CalDavClient, local: readonly Transaction[], baseline: SyncBaseline, categories?: readonly Category[], recurrences?: readonly Recurrence[], trash?: readonly TrashedTransaction[]): Promise<SyncOutcome>;
/** Key under which `baseline` remembers the recurring event of a series. */
export declare const RECURRENCE_BASELINE_PREFIX = "@recurrence:";
export declare function recurrenceHash(r: Recurrence): string;
//# sourceMappingURL=calendar-sync.d.ts.map