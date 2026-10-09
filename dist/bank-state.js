const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Imported once: the list of ids stays bounded, the oldest are forgotten first. */
export const MAX_REMEMBERED_BANK_IDS = 5000;
/** Automatic imports are spaced out: banks only allow a few unattended accesses per day. */
export const BANK_AUTO_IMPORT_INTERVAL_MS = 6 * 3600 * 1000;
/** A fresh state: no access yet, importing from the first day of the month of `today` (YYYY-MM-DD). */
export function defaultBankState(today, redirectUrl) {
    return {
        config: {
            applicationId: '',
            bankName: '',
            bankCountry: 'FR',
            bankConsentSeconds: 0,
            redirectUrl,
            importFrom: `${today.slice(0, 8)}01`,
        },
        session: null,
        pendingState: '',
        lastImportAt: '',
        importedIds: [],
    };
}
export function isBankState(value) {
    const candidate = value;
    return typeof candidate === 'object' && candidate !== null
        && typeof candidate.config === 'object' && candidate.config !== null
        && typeof candidate.config.applicationId === 'string'
        && typeof candidate.config.redirectUrl === 'string'
        && typeof candidate.config.importFrom === 'string'
        && typeof candidate.pendingState === 'string'
        && typeof candidate.lastImportAt === 'string'
        && Array.isArray(candidate.importedIds);
}
export function isBankDate(text) {
    return ISO_DATE.test(text.trim());
}
/** Whether an unattended import is due: connected, access still valid, and the last one is old enough. */
export function isBankAutoImportDue(state, expired, nowMs) {
    if (state.session === null || expired)
        return false;
    const last = Date.parse(state.lastImportAt);
    return state.lastImportAt === '' || Number.isNaN(last) || nowMs - last >= BANK_AUTO_IMPORT_INTERVAL_MS;
}
/** The ids to remember after an import, newest last, bounded. */
export function rememberBankIds(known, added) {
    return [...known, ...added].slice(-MAX_REMEMBERED_BANK_IDS);
}
//# sourceMappingURL=bank-state.js.map