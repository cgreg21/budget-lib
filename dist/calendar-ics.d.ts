import { type Category } from './category.js';
import { type Recurrence } from './recurrence.js';
import type { Transaction, TrashedTransaction } from './transaction.js';
export declare const UID_SUFFIX = "@budget";
/** The iCalendar text of a transaction. `now` only feeds DTSTAMP. */
export declare function transactionToIcs(transaction: Transaction, now?: Date): string;
/**
 * The iCalendar text of a trashed transaction: the same event, greyed out and marked cancelled, so
 * it stays out of the way in calendars. `icsToTransaction` ignores it; `icsToTrashed` reads it back.
 */
export declare function trashedToIcs(transaction: TrashedTransaction, now?: Date): string;
/** UID of the single event that carries the category list (without `UID_SUFFIX`). */
export declare const CATEGORIES_EVENT_ID = "categories";
/**
 * The iCalendar text of the category list: one all-day event, understood by
 * every application of the suite and ignored by older ones (it has no
 * X-BUDGET-KIND). The list itself is JSON in X-BUDGET-CATEGORIES; the
 * description only makes it readable in a calendar application.
 */
export declare function categoriesToIcs(categories: readonly Category[], now?: Date): string;
/** UID of the recurring event of a series (without `UID_SUFFIX`). */
export declare function recurrenceEventId(recurrenceId: string): string;
/**
 * The iCalendar text of a series: one recurring all-day event, so the calendar
 * shows it ahead of time. It has no X-BUDGET-KIND, so it is never read back as
 * a transaction; the occurrences stay individual events.
 */
export declare function recurrenceToIcs(recurrence: Recurrence, now?: Date): string;
/** The category list an iCalendar text holds, or `null` when the event is not the category event or is malformed. */
export declare function icsToCategories(ics: string): Category[] | null;
/** The transaction an iCalendar text holds, or `null` when the event is not one of ours or is in the trash. */
export declare function icsToTransaction(ics: string): Transaction | null;
/** The trashed transaction an iCalendar text holds, or `null` when the event is not a trashed one of ours. */
export declare function icsToTrashed(ics: string): TrashedTransaction | null;
//# sourceMappingURL=calendar-ics.d.ts.map