/*
 * domain/general-settings.ts — user-facing display preferences.
 */

export type AppLanguage = 'fr' | 'en'
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF'
export type DateFormat = 'locale' | 'dd-mm-yyyy' | 'mm-dd-yyyy' | 'yyyy-mm-dd'
export type AmountFormat = 'locale' | 'space-comma' | 'comma-dot'
export type Theme = 'system' | 'light' | 'dark'

export interface GeneralSettings {
  language: AppLanguage
  currency: Currency
  dateFormat: DateFormat
  amountFormat: AmountFormat
  theme: Theme
}

/**
 * The theme defaults to the system one; an app with a design of its own
 * (the mobile one is dark first) overrides it: `{ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' }`.
 */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  language: 'en',
  currency: 'EUR',
  dateFormat: 'locale',
  amountFormat: 'locale',
  theme: 'system',
}

export function isGeneralSettings(value: unknown): value is GeneralSettings {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<GeneralSettings>
  return (
    (candidate.language === 'fr' || candidate.language === 'en')
    && (candidate.currency === 'EUR' || candidate.currency === 'USD'
      || candidate.currency === 'GBP' || candidate.currency === 'CHF')
    && (candidate.dateFormat === 'locale' || candidate.dateFormat === 'dd-mm-yyyy'
      || candidate.dateFormat === 'mm-dd-yyyy' || candidate.dateFormat === 'yyyy-mm-dd')
    && (candidate.amountFormat === 'locale' || candidate.amountFormat === 'space-comma'
      || candidate.amountFormat === 'comma-dot')
    && (candidate.theme === 'system' || candidate.theme === 'light' || candidate.theme === 'dark')
  )
}
