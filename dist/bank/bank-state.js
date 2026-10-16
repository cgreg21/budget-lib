const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Imported once: the list of ids stays bounded, the oldest are forgotten first. */
export const MAX_REMEMBERED_BANK_IDS = 5000;
/** Automatic imports are spaced out: banks only allow a few unattended accesses per day. */
export const BANK_AUTO_IMPORT_INTERVAL_MS = 6 * 3600 * 1000;
/**
 * A fresh state: no access yet, importing from the first day of the month of `today` (YYYY-MM-DD).
 * An unreadable `today` gives an empty `importFrom`, which the UI validates with `isBankDate`.
 */
export function defaultBankState(today, redirectUrl) {
    return {
        config: {
            applicationId: '',
            bankName: '',
            bankCountry: 'FR',
            bankConsentSeconds: 0,
            redirectUrl,
            importFrom: isBankDate(today) ? `${today.trim().slice(0, 8)}01` : '',
        },
        session: null,
        pendingState: '',
        lastImportAt: '',
        importedIds: [],
    };
}
export function isBankConfig(value) {
    const candidate = value;
    return typeof candidate === 'object' && candidate !== null
        && typeof candidate.applicationId === 'string'
        && typeof candidate.bankName === 'string'
        && typeof candidate.bankCountry === 'string'
        && typeof candidate.bankConsentSeconds === 'number' && Number.isFinite(candidate.bankConsentSeconds)
        && typeof candidate.redirectUrl === 'string'
        && typeof candidate.importFrom === 'string';
}
function isBankSession(value) {
    const candidate = value;
    return typeof candidate === 'object' && candidate !== null
        && typeof candidate.sessionId === 'string'
        && typeof candidate.validUntil === 'string'
        && Array.isArray(candidate.accounts)
        && candidate.accounts.every((account) => {
            const a = account;
            return typeof a === 'object' && a !== null && typeof a.uid === 'string' && typeof a.label === 'string';
        });
}
export function isBankState(value) {
    const candidate = value;
    return typeof candidate === 'object' && candidate !== null
        && isBankConfig(candidate.config)
        && (candidate.session === null || isBankSession(candidate.session))
        && typeof candidate.pendingState === 'string'
        && typeof candidate.lastImportAt === 'string'
        && Array.isArray(candidate.importedIds)
        && candidate.importedIds.every((id) => typeof id === 'string');
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
/** The ids to remember after an import, newest last, without duplicates, bounded. */
export function rememberBankIds(known, added) {
    const seen = new Set(added);
    const kept = known.filter((id) => !seen.has(id));
    return [...new Set([...kept, ...added])].slice(-MAX_REMEMBERED_BANK_IDS);
}
//# sourceMappingURL=bank-state.js.map