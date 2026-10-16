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

/** The three configurable amounts: x, y and z. */
export interface BalanceThresholds {
  /** x — below it the balance is critical; from it, the "low" band starts. */
  low: number
  /** y — start of the "medium" band. */
  medium: number
  /** z — from it the balance is considered healthy. */
  high: number
}

export type BalanceLevel = 'critical' | 'low' | 'medium' | 'high'

export const DEFAULT_BALANCE_THRESHOLDS: BalanceThresholds = {
  low: 0,
  medium: 500,
  high: 1000,
}

/** The saving rule: x < y < z. */
export function areThresholdsOrdered({ low, medium, high }: BalanceThresholds): boolean {
  return low < medium && medium < high
}

export function isBalanceThresholds(value: unknown): value is BalanceThresholds {
  if (typeof value !== 'object' || value === null) return false

  const { low, medium, high } = value as Partial<BalanceThresholds>
  if (!isAmount(low) || !isAmount(medium) || !isAmount(high)) return false

  return areThresholdsOrdered({ low, medium, high })
}

/** The band a balance falls into. Bands are contiguous, so there is always one. */
export function balanceLevel(balance: number, { low, medium, high }: BalanceThresholds): BalanceLevel {
  if (balance < low) return 'critical'
  if (balance < medium) return 'low'
  return balance < high ? 'medium' : 'high'
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
