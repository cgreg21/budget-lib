/*
 * domain/general-settings.ts — user-facing display preferences.
 */
/**
 * The theme defaults to the system one; an app with a design of its own
 * (the mobile one is dark first) overrides it: `{ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' }`.
 */
export const DEFAULT_GENERAL_SETTINGS = {
    language: 'en',
    currency: 'EUR',
    dateFormat: 'locale',
    amountFormat: 'locale',
    theme: 'system',
};
export function isGeneralSettings(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return ((candidate.language === 'fr' || candidate.language === 'en')
        && (candidate.currency === 'EUR' || candidate.currency === 'USD'
            || candidate.currency === 'GBP' || candidate.currency === 'CHF')
        && (candidate.dateFormat === 'locale' || candidate.dateFormat === 'dd-mm-yyyy'
            || candidate.dateFormat === 'mm-dd-yyyy' || candidate.dateFormat === 'yyyy-mm-dd')
        && (candidate.amountFormat === 'locale' || candidate.amountFormat === 'space-comma'
            || candidate.amountFormat === 'comma-dot')
        && (candidate.theme === 'system' || candidate.theme === 'light' || candidate.theme === 'dark'));
}
//# sourceMappingURL=general-settings.js.map