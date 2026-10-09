export const ENABLE_BANKING_URL = 'https://api.enablebanking.com';
const TOKEN_TTL_SECONDS = 3600;
/** A token is renewed when less than this is left, so a request never carries an expiring one. */
const RENEW_MARGIN_SECONDS = 300;
const TIMEOUT_MS = 30000;
const MAX_PAGES = 50;
const CONSENT_MARGIN_MS = 60000;
export const DEFAULT_CONSENT_SECONDS = 90 * 24 * 3600;
/** The PEM of a private key as pasted by the user: line breaks and surrounding spaces are tidied. */
export function normalizePrivateKey(text) {
    const match = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(text);
    if (match === null)
        return '';
    const body = match[2].replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`;
}
/** The JWT Enable Banking expects (RS256, `kid` = application id), signed with the given signer. */
export function signBankToken(sign, applicationId, privateKey, nowMs) {
    const issuedAt = Math.floor(nowMs / 1000);
    return sign({ typ: 'JWT', alg: 'RS256', kid: applicationId }, { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS }, privateKey);
}
/** Signing an RSA key in JavaScript takes a moment: a token is reused until it is about to expire. */
export class BankTokenSource {
    sign;
    applicationId;
    privateKey;
    token = '';
    expiresAtMs = 0;
    constructor(sign, applicationId, privateKey) {
        this.sign = sign;
        this.applicationId = applicationId;
        this.privateKey = privateKey;
    }
    get(nowMs = Date.now()) {
        if (this.token === '' || nowMs >= this.expiresAtMs - RENEW_MARGIN_SECONDS * 1000) {
            this.token = signBankToken(this.sign, this.applicationId, this.privateKey, nowMs);
            this.expiresAtMs = nowMs + TOKEN_TTL_SECONDS * 1000;
        }
        return this.token;
    }
}
export class BankApiError extends Error {
    kind;
    status;
    constructor(kind, message, status) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.name = 'BankApiError';
    }
}
const text = (value) => (typeof value === 'string' ? value : '');
/** Whether the access given by the bank has run out. */
export function isSessionExpired(session, nowMs = Date.now()) {
    const until = Date.parse(session?.validUntil ?? '');
    return !Number.isNaN(until) && until <= nowMs;
}
export class EnableBankingClient {
    http;
    tokens;
    constructor(http, sign, applicationId, privateKey) {
        this.http = http;
        this.tokens = new BankTokenSource(sign, applicationId, privateKey);
    }
    /** The banks of a country that can be connected. */
    async listBanks(country) {
        const body = await this.request('GET', `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
        return (body.aspsps ?? [])
            .filter((bank) => text(bank.name) !== '')
            .map((bank) => ({
            name: text(bank.name),
            country: text(bank.country) || country,
            maximumConsentSeconds: bank.maximum_consent_validity ?? DEFAULT_CONSENT_SECONDS,
        }));
    }
    /** Starts the authorisation: returns the page the user has to open to give access. */
    async startAuthorization(bank, redirectUrl, state, language) {
        const validUntil = new Date(Date.now() + bank.maximumConsentSeconds * 1000 - CONSENT_MARGIN_MS).toISOString();
        const body = await this.request('POST', '/auth', {
            access: { valid_until: validUntil, balances: true, transactions: true },
            aspsp: { name: bank.name, country: bank.country },
            state,
            redirect_url: redirectUrl,
            psu_type: 'personal',
            language,
        });
        const url = text(body.url);
        if (url === '')
            throw new BankApiError('rejected', 'No authorisation URL returned', 200);
        return url;
    }
    /** Exchanges the code received after the authorisation for a session and the accounts it gives access to. */
    async createSession(code) {
        const body = await this.request('POST', '/sessions', { code });
        const accounts = (body.accounts ?? [])
            .filter((account) => text(account.uid) !== '')
            .map((account) => ({
            uid: text(account.uid),
            label: [text(account.details) || text(account.name) || text(account.product), text(account.account_id?.iban)]
                .filter((part) => part !== '').join(' - ') || text(account.uid),
        }));
        const sessionId = text(body.session_id);
        if (sessionId === '' || accounts.length === 0)
            throw new BankApiError('rejected', 'No account was shared', 200);
        return { sessionId, accounts, validUntil: text(body.access?.valid_until) };
    }
    /** Booked transactions of an account since `dateFrom` (YYYY-MM-DD), every page of them. */
    async transactions(accountUid, dateFrom) {
        const result = [];
        let continuation = '';
        for (let page = 0; page < MAX_PAGES; page++) {
            const query = `date_from=${encodeURIComponent(dateFrom)}&transaction_status=BOOK`
                + (continuation === '' ? '' : `&continuation_key=${encodeURIComponent(continuation)}`);
            const body = await this.request('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`);
            result.push(...(body.transactions ?? []));
            continuation = text(body.continuation_key);
            if (continuation === '')
                break;
        }
        return result;
    }
    async request(method, path, payload) {
        let status;
        let raw;
        try {
            const response = await this.http({
                method,
                url: `${ENABLE_BANKING_URL}${path}`,
                headers: {
                    Authorization: `Bearer ${this.tokens.get()}`,
                    Accept: 'application/json',
                    ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                timeoutMs: TIMEOUT_MS,
                ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
            });
            status = response.status;
            raw = response.body;
        }
        catch (error) {
            throw new BankApiError('network', error instanceof Error ? error.message : String(error), 0);
        }
        let body = {};
        try {
            body = raw === '' ? {} : JSON.parse(raw);
        }
        catch {
            body = {};
        }
        if (status >= 200 && status < 300)
            return body;
        const { message, error } = body;
        const detail = text(message) || text(error) || `HTTP ${status}`;
        if (status === 429)
            throw new BankApiError('rate-limit', detail, status);
        if (status === 401 || status === 403) {
            const expired = /session|expired|consent|closed/i.test(`${text(error)} ${text(message)}`);
            throw new BankApiError(expired ? 'expired' : 'auth', detail, status);
        }
        if (status >= 500 || status === 408)
            throw new BankApiError('network', detail, status);
        throw new BankApiError('rejected', detail, status);
    }
}
//# sourceMappingURL=enable-banking.js.map