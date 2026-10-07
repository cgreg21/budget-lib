import { describe, expect, it } from 'vitest'

import { PIE_COLORS, buildPieSlices } from '../src/pie-chart.js'

describe('buildPieSlices', () => {
  it('computes the share of each entry, in order', () => {
    const slices = buildPieSlices([
      { label: 'Loyer', amount: 750, icon: 'home' },
      { label: 'Courses', amount: 250 },
    ])

    expect(slices.map((s) => [s.label, s.amount, s.fraction])).toEqual([
      ['Loyer', 750, 0.75],
      ['Courses', 250, 0.25],
    ])
    expect(slices[0]?.icon).toBe('home')
    expect(slices[1]?.icon).toBeUndefined()
  })

  it('drops the entries with no positive amount', () => {
    const slices = buildPieSlices([
      { label: 'zero', amount: 0 },
      { label: 'negative', amount: -5 },
      { label: 'nan', amount: Number.NaN },
      { label: 'infinite', amount: Number.POSITIVE_INFINITY },
      { label: 'kept', amount: 10 },
    ])

    expect(slices.map((s) => s.label)).toEqual(['kept'])
    expect(slices[0]?.fraction).toBe(1)
  })

  it('has no slice when there is nothing to draw', () => {
    expect(buildPieSlices([])).toEqual([])
    expect(buildPieSlices([{ label: 'zero', amount: 0 }])).toEqual([])
  })

  it('gives each slice a color and cycles when the palette runs out', () => {
    const entries = Array.from({ length: PIE_COLORS.length + 2 }, (_, i) => ({ label: `c${i}`, amount: 1 }))
    const slices = buildPieSlices(entries)

    expect(slices[0]?.color).toBe(PIE_COLORS[0])
    expect(slices[PIE_COLORS.length]?.color).toBe(PIE_COLORS[0])
    expect(slices[PIE_COLORS.length + 1]?.color).toBe(PIE_COLORS[1])
    expect(slices.reduce((sum, s) => sum + s.fraction, 0)).toBeCloseTo(1)
  })
})
