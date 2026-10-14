import { type Category } from './category.js';
import type { Transaction } from './transaction.js';
export declare const UID_SUFFIX = "@budget";
/** The iCalendar text of a transaction. `now` only feeds DTSTAMP. */
export declare function transactionToIcs(transaction: Transaction, now?: Date): string;
/** UID of the single event that carries the category list (without `UID_SUFFIX`). */
export declare const CATEGORIES_EVENT_ID = "categories";
/**
 * The iCalendar text of the category list: one all-day event, understood by
 * every application of the suite and ignored by older ones (it has no
 * X-BUDGET-KIND). The list itself is JSON in X-BUDGET-CATEGORIES; the
 * description only makes it readable in a calendar application.
 */
export declare function categoriesToIcs(categories: readonly Category[], now?: Date): string;
/** The category list an iCalendar text holds, or `null` when the event is not the category event or is malformed. */
export declare function icsToCategories(ics: string): Category[] | null;
/** The transaction an iCalendar text holds, or `null` when the event is not one of ours. */
export declare function icsToTransaction(ics: string): Transaction | null;
//# sourceMappingURL=calendar-ics.d.ts.map