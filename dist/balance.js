/*
 * domain/balance.ts — how a month's balance is judged.
 *
 * Three thresholds cut the amount line into four contiguous bands, from the
 * most worrying to the most comfortable:
 *
 *   … < x  →  critical      x ≤ … < y  →  low
 *   y ≤ … < z  →  medium    z ≤ …      →  high
 *
 * The thresholds may be negative; the only rule is that they keep increasing,
 * which is what makes the bands non-overlapping.
 */
export const DEFAULT_BALANCE_THRESHOLDS = {
    low: 0,
    medium: 500,
    high: 1000,
};
/** The saving rule: x < y < z. */
export function areThresholdsOrdered({ low, medium, high }) {
    return low < medium && medium < high;
}
export function isBalanceThresholds(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const { low, medium, high } = value;
    if (!isAmount(low) || !isAmount(medium) || !isAmount(high))
        return false;
    return areThresholdsOrdered({ low, medium, high });
}
/** The band a balance falls into. Bands are contiguous, so there is always one. */
export function balanceLevel(balance, { low, medium, high }) {
    if (balance < low)
        return 'critical';
    if (balance < medium)
        return 'low';
    return balance < high ? 'medium' : 'high';
}
function isAmount(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
//# sourceMappingURL=balance.js.map