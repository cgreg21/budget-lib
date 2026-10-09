import type { Transaction } from './transaction.js';
export declare const UID_SUFFIX = "@budget";
/** The iCalendar text of a transaction. `now` only feeds DTSTAMP. */
export declare function transactionToIcs(transaction: Transaction, now?: Date): string;
/** The transaction an iCalendar text holds, or `null` when the event is not one of ours. */
export declare function icsToTransaction(ics: string): Transaction | null;
//# sourceMappingURL=calendar-ics.d.ts.map