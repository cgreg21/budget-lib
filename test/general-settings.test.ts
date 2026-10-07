import { describe, expect, it } from 'vitest'

import { DEFAULT_GENERAL_SETTINGS, isGeneralSettings } from '../src/general-settings.js'

describe('isGeneralSettings', () => {
  it('accepts the defaults', () => {
    expect(isGeneralSettings(DEFAULT_GENERAL_SETTINGS)).toBe(true)
  })

  it('accepts every value of every option', () => {
    for (const language of ['fr', 'en'] as const) {
      for (const currency of ['EUR', 'USD', 'GBP', 'CHF'] as const) {
        for (const dateFormat of ['locale', 'dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd'] as const) {
          for (const amountFormat of ['locale', 'space-comma', 'comma-dot'] as const) {
            for (const theme of ['system', 'light', 'dark'] as const) {
              expect(isGeneralSettings({ language, currency, dateFormat, amountFormat, theme })).toBe(true)
            }
          }
        }
      }
    }
  })

  it.each([
    ['null', null],
    ['a string', 'fr'],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isGeneralSettings(value)).toBe(false)
  })

  it.each([
    ['language', { language: 'de' }],
    ['currency', { currency: 'JPY' }],
    ['dateFormat', { dateFormat: 'iso' }],
    ['amountFormat', { amountFormat: 'plain' }],
    ['theme', { theme: 'sepia' }],
  ])('rejects a bad %s', (_field, override) => {
    expect(isGeneralSettings({ ...DEFAULT_GENERAL_SETTINGS, ...override })).toBe(false)
  })
})
