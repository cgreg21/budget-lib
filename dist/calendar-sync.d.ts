import { CalDavClient, type RemoteEvent } from './caldav.js';
import type { Transaction } from './transaction.js';
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
}
export declare function transactionHash(t: Transaction): string;
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
/** One synchronisation run. Network failures propagate; per-event conflicts are skipped. */
export declare function syncCalendar(client: CalDavClient, local: readonly Transaction[], baseline: SyncBaseline): Promise<SyncOutcome>;
//# sourceMappingURL=calendar-sync.d.ts.map