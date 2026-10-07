import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BALANCE_THRESHOLDS,
  areThresholdsOrdered,
  balanceLevel,
  isBalanceThresholds,
} from '../src/balance.js'

describe('areThresholdsOrdered', () => {
  it('accepts strictly increasing thresholds', () => {
    expect(areThresholdsOrdered({ low: 0, medium: 500, high: 1000 })).toBe(true)
  })

  it('accepts negative thresholds as long as they increase', () => {
    expect(areThresholdsOrdered({ low: -1000, medium: -500, high: 0 })).toBe(true)
  })

  it('rejects equal thresholds', () => {
    expect(areThresholdsOrdered({ low: 0, medium: 0, high: 1000 })).toBe(false)
  })

  it('rejects out-of-order thresholds', () => {
    expect(areThresholdsOrdered({ low: 500, medium: 0, high: 1000 })).toBe(false)
  })
})

describe('isBalanceThresholds', () => {
  it('accepts the default thresholds', () => {
    expect(isBalanceThresholds(DEFAULT_BALANCE_THRESHOLDS)).toBe(true)
  })

  it('rejects non-object values', () => {
    expect(isBalanceThresholds(null)).toBe(false)
    expect(isBalanceThresholds('nope')).toBe(false)
    expect(isBalanceThresholds(42)).toBe(false)
  })

  it('rejects missing or non-numeric fields', () => {
    expect(isBalanceThresholds({ low: 0, medium: 500 })).toBe(false)
    expect(isBalanceThresholds({ low: '0', medium: 500, high: 1000 })).toBe(false)
    expect(isBalanceThresholds({ low: 0, medium: 500, high: Infinity })).toBe(false)
  })

  it('rejects thresholds that are not ordered', () => {
    expect(isBalanceThresholds({ low: 1000, medium: 500, high: 0 })).toBe(false)
  })
})

describe('balanceLevel', () => {
  const thresholds = DEFAULT_BALANCE_THRESHOLDS

  it('returns critical below the low threshold', () => {
    expect(balanceLevel(-1, thresholds)).toBe('critical')
  })

  it('returns low between low (inclusive) and medium', () => {
    expect(balanceLevel(0, thresholds)).toBe('low')
    expect(balanceLevel(499, thresholds)).toBe('low')
  })

  it('returns medium between medium (inclusive) and high', () => {
    expect(balanceLevel(500, thresholds)).toBe('medium')
    expect(balanceLevel(999, thresholds)).toBe('medium')
  })

  it('returns high at and above the high threshold', () => {
    expect(balanceLevel(1000, thresholds)).toBe('high')
    expect(balanceLevel(100000, thresholds)).toBe('high')
  })
})
