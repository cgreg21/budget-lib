export type AppLanguage = 'fr' | 'en';
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF';
export type DateFormat = 'locale' | 'dd-mm-yyyy' | 'mm-dd-yyyy' | 'yyyy-mm-dd';
export type AmountFormat = 'locale' | 'space-comma' | 'comma-dot';
export type Theme = 'system' | 'light' | 'dark';
export interface GeneralSettings {
    language: AppLanguage;
    currency: Currency;
    dateFormat: DateFormat;
    amountFormat: AmountFormat;
    theme: Theme;
}
/**
 * The theme defaults to the system one; an app with a design of its own
 * (the mobile one is dark first) overrides it: `{ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' }`.
 */
export declare const DEFAULT_GENERAL_SETTINGS: GeneralSettings;
export declare function isGeneralSettings(value: unknown): value is GeneralSettings;
//# sourceMappingURL=general-settings.d.ts.map