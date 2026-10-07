import type { Transaction, TransactionInput } from './transaction.js';
export declare const CSV_SEPARATOR = ";";
export declare const CSV_HEADER: readonly string[];
export declare const CSV_INCOME_LABEL = "Revenu";
export declare const CSV_EXPENSE_LABEL = "D\u00E9pense";
export interface CsvImport {
    transactions: TransactionInput[];
    /** Rows that could not be read — a missing date or an unreadable amount. */
    ignored: number;
}
/** Chronological order: a spreadsheet is read from the oldest row down. */
export declare function transactionsToCsv(transactions: readonly Transaction[]): string;
export declare function csvToTransactions(text: string): CsvImport;
//# sourceMappingURL=csv.d.ts.map