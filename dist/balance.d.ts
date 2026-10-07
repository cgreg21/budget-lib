/** The three configurable amounts: x, y and z. */
export interface BalanceThresholds {
    /** x — below it the balance is critical; from it, the "low" band starts. */
    low: number;
    /** y — start of the "medium" band. */
    medium: number;
    /** z — from it the balance is considered healthy. */
    high: number;
}
export type BalanceLevel = 'critical' | 'low' | 'medium' | 'high';
export declare const DEFAULT_BALANCE_THRESHOLDS: BalanceThresholds;
/** The saving rule: x < y < z. */
export declare function areThresholdsOrdered({ low, medium, high }: BalanceThresholds): boolean;
export declare function isBalanceThresholds(value: unknown): value is BalanceThresholds;
/** The band a balance falls into. Bands are contiguous, so there is always one. */
export declare function balanceLevel(balance: number, { low, medium, high }: BalanceThresholds): BalanceLevel;
//# sourceMappingURL=balance.d.ts.map