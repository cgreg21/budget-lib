import type { BalanceThresholds } from './balance.js';
import type { Category } from './category.js';
import type { Recurrence } from './recurrence.js';
import type { Transaction } from './transaction.js';
/** JSON with sorted keys, so two spellings of the same object compare equal. */
export declare function canonical(value: unknown): string;
export declare const sameValue: (a: unknown, b: unknown) => boolean;
/** Merges lists of items identified by a key; the order of the remote list is kept, new local items follow. */
export declare function mergeKeyed<T>(base: readonly T[], local: readonly T[], remote: readonly T[], keyOf: (item: T) => string, preferRemote: boolean): T[];
/** Date descending, then id: the same list always gets the same order, whichever device wrote it. */
export declare function orderTransactions(list: readonly Transaction[]): Transaction[];
export declare function mergeMonth(base: readonly Transaction[], local: readonly Transaction[], remote: readonly Transaction[], preferRemote: boolean): Transaction[];
export declare const mergeCategories: (base: readonly Category[], local: readonly Category[], remote: readonly Category[], preferRemote: boolean) => Category[];
export declare const mergeRecurrences: (base: readonly Recurrence[], local: readonly Recurrence[], remote: readonly Recurrence[], preferRemote: boolean) => Recurrence[];
export declare function mergeThresholds(base: BalanceThresholds | undefined, local: BalanceThresholds, remote: BalanceThresholds, preferRemote: boolean): BalanceThresholds;
//# sourceMappingURL=sync-merge.d.ts.map