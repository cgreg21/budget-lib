import type { BankTransaction } from './bank.js';
export declare const ENABLE_BANKING_URL = "https://api.enablebanking.com";
export declare const DEFAULT_CONSENT_SECONDS: number;
/** Sends one HTTP request. A transport failure (no network, timeout) rejects; any HTTP status resolves. */
export type BankHttp = (request: {
    method: 'GET' | 'POST';
    url: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
}) => Promise<{
    status: number;
    body: string;
}>;
/** Signs a JWT with RS256: `privateKey` is a PEM. */
export type JwtSigner = (header: object, payload: object, privateKey: string) => string;
/** The PEM of a private key as pasted by the user: line breaks and surrounding spaces are tidied. */
export declare function normalizePrivateKey(text: string): string;
/** The JWT Enable Banking expects (RS256, `kid` = application id), signed with the given signer. */
export declare function signBankToken(sign: JwtSigner, applicationId: string, privateKey: string, nowMs: number): string;
/** Signing an RSA key in JavaScript takes a moment: a token is reused until it is about to expire. */
export declare class BankTokenSource {
    private readonly sign;
    private readonly applicationId;
    private readonly privateKey;
    private token;
    private expiresAtMs;
    constructor(sign: JwtSigner, applicationId: string, privateKey: string);
    get(nowMs?: number): string;
}
/** Why a call failed, so the UI can say what to do about it. */
export type BankErrorKind = 'network' | 'auth' | 'expired' | 'rate-limit' | 'rejected';
export declare class BankApiError extends Error {
    readonly kind: BankErrorKind;
    readonly status: number;
    constructor(kind: BankErrorKind, message: string, status: number);
}
export interface Aspsp {
    name: string;
    country: string;
    /** How long the bank lets an access last. */
    maximumConsentSeconds: number;
}
export interface BankAccount {
    uid: string;
    /** What lets the user recognise the account. */
    label: string;
}
export interface BankSession {
    sessionId: string;
    accounts: BankAccount[];
    validUntil: string;
}
/** Whether the access given by the bank has run out. */
export declare function isSessionExpired(session: BankSession | null, nowMs?: number): boolean;
export declare class EnableBankingClient {
    private readonly http;
    private readonly tokens;
    constructor(http: BankHttp, sign: JwtSigner, applicationId: string, privateKey: string);
    /** The banks of a country that can be connected. */
    listBanks(country: string): Promise<Aspsp[]>;
    /** Starts the authorisation: returns the page the user has to open to give access. */
    startAuthorization(bank: Aspsp, redirectUrl: string, state: string, language: string): Promise<string>;
    /** Exchanges the code received after the authorisation for a session and the accounts it gives access to. */
    createSession(code: string): Promise<BankSession>;
    /** Booked transactions of an account since `dateFrom` (YYYY-MM-DD), every page of them. */
    transactions(accountUid: string, dateFrom: string): Promise<BankTransaction[]>;
    private request;
}
//# sourceMappingURL=enable-banking.d.ts.map