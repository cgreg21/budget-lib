/*
 * config-archive.ts — the configuration of an application, exported to a file
 * that only a passphrase can open, and read back on any of the applications.
 *
 * Unlike a data backup, a configuration holds secrets (the calendar password,
 * the bank's private key), so the file is never written in clear. The
 * container is JSON for easy handling everywhere; its body is the archive
 * encrypted with AES-256-CBC and authenticated with HMAC-SHA256
 * (encrypt-then-MAC), both keys derived from the passphrase with
 * PBKDF2-SHA256. Those primitives — and not AES-GCM — were chosen because
 * every platform has them: WebCrypto on the web and on Node, CryptoJS on the
 * phone, which has no WebCrypto at all.
 *
 * The cryptography itself is injected (`ConfigCipher`): this file only decides
 * what is encrypted and how the pieces are laid out.
 */
import { DEFAULT_BALANCE_THRESHOLDS, isBalanceThresholds } from './balance.js';
import { isBankConfig } from './bank-state.js';
import { base64Decode, base64Encode, bytesEqual, concatBytes, utf8Decode, utf8Encode } from './bytes.js';
import { DEFAULT_CALENDAR_CONFIG } from './caldav.js';
import { DEFAULT_GENERAL_SETTINGS, isGeneralSettings } from './general-settings.js';
/** Stamped in the clear-text archive and in the encrypted container. */
export const CONFIG_FORMAT = 'budget-app-config';
export const CONFIG_VERSION = 1;
export const ENCRYPTED_CONFIG_FORMAT = 'budget-app-config-encrypted';
export const ENCRYPTED_CONFIG_VERSION = 1;
/** Suggested extension of the exported file. */
export const CONFIG_FILE_EXTENSION = '.budgetcfg';
export const CONFIG_KDF_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const MAC_LENGTH = 32;
const MIN_PASSPHRASE_LENGTH = 8;
export class ConfigFileError extends Error {
    code;
    constructor(code) {
        super(`Configuration file error: ${code}`);
        this.code = code;
        this.name = 'ConfigFileError';
    }
}
export function isPassphraseAcceptable(passphrase) {
    return passphrase.length >= MIN_PASSPHRASE_LENGTH;
}
export function createConfigArchive(data, exportedAt = new Date().toISOString()) {
    return {
        format: CONFIG_FORMAT,
        version: CONFIG_VERSION,
        exportedAt,
        general: { ...data.general },
        thresholds: { low: data.thresholds.low, medium: data.thresholds.medium, high: data.thresholds.high },
        calendar: {
            enabled: data.calendar.enabled,
            calendarUrl: data.calendar.calendarUrl,
            username: data.calendar.username,
            syncIntervalMinutes: data.calendar.syncIntervalMinutes ?? 0,
            proxyUrl: data.calendar.proxyUrl,
            password: data.calendar.password,
        },
        bank: data.bank === null ? null : { config: { ...data.bank.config }, privateKey: data.bank.privateKey },
    };
}
function isCalendarConfigExport(value) {
    const c = value;
    return typeof c === 'object' && c !== null
        && typeof c.enabled === 'boolean'
        && typeof c.calendarUrl === 'string'
        && typeof c.username === 'string'
        && (c.syncIntervalMinutes === undefined || typeof c.syncIntervalMinutes === 'number')
        && typeof c.proxyUrl === 'string'
        && typeof c.password === 'string';
}
function isBankConfigExport(value) {
    const b = value;
    return typeof b === 'object' && b !== null && isBankConfig(b.config) && typeof b.privateKey === 'string';
}
/**
 * Validates a clear-text archive. `null` when it is not ours or a section is
 * malformed: a half-applied configuration would be worse than a refused one.
 */
export function parseConfigData(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const archive = value;
    if (archive.format !== CONFIG_FORMAT || typeof archive.version !== 'number' || archive.version > CONFIG_VERSION)
        return null;
    const { general, thresholds, calendar, bank } = archive;
    if (!isGeneralSettings(general) || !isBalanceThresholds(thresholds) || !isCalendarConfigExport(calendar))
        return null;
    if (bank !== null && !isBankConfigExport(bank))
        return null;
    return createConfigArchive({ general, thresholds, calendar, bank: bank ?? null }, archive.exportedAt ?? '');
}
/** A configuration with nothing set up: the starting point of an application. */
export function emptyConfigData() {
    return {
        general: { ...DEFAULT_GENERAL_SETTINGS },
        thresholds: { ...DEFAULT_BALANCE_THRESHOLDS },
        calendar: { ...DEFAULT_CALENDAR_CONFIG, proxyUrl: '', password: '' },
        bank: null,
    };
}
/** Which sections of a configuration carry something: shown to the user before importing. */
export function describeConfig(data) {
    return {
        calendar: data.calendar.calendarUrl !== '' || data.calendar.username !== '',
        calendarPassword: data.calendar.password !== '',
        bank: data.bank !== null && (data.bank.config.applicationId !== '' || data.bank.privateKey !== ''),
        bankKey: data.bank !== null && data.bank.privateKey !== '',
    };
}
async function deriveKeys(cipher, passphrase, salt, iterations) {
    const material = await cipher.pbkdf2Sha256(utf8Encode(passphrase), salt, iterations, KEY_LENGTH * 2);
    return { enc: material.slice(0, KEY_LENGTH), mac: material.slice(KEY_LENGTH) };
}
/** Encrypts the configuration into the text of the file to save. */
export async function sealConfig(data, passphrase, cipher, options = {}) {
    if (!isPassphraseAcceptable(passphrase))
        throw new ConfigFileError('weak-passphrase');
    const exportedAt = options.exportedAt ?? new Date().toISOString();
    const iterations = options.iterations ?? CONFIG_KDF_ITERATIONS;
    const salt = cipher.randomBytes(SALT_LENGTH);
    const iv = cipher.randomBytes(IV_LENGTH);
    const keys = await deriveKeys(cipher, passphrase, salt, iterations);
    const plaintext = utf8Encode(JSON.stringify(createConfigArchive(data, exportedAt)));
    const ciphertext = await cipher.aesCbcEncrypt(keys.enc, iv, plaintext);
    const mac = await cipher.hmacSha256(keys.mac, concatBytes(salt, iv, ciphertext));
    const file = {
        format: ENCRYPTED_CONFIG_FORMAT,
        version: ENCRYPTED_CONFIG_VERSION,
        exportedAt,
        kdf: { name: 'PBKDF2-SHA256', iterations, salt: base64Encode(salt) },
        cipher: 'AES-256-CBC',
        iv: base64Encode(iv),
        ciphertext: base64Encode(ciphertext),
        mac: base64Encode(mac),
    };
    return JSON.stringify(file, null, 2);
}
/** True for a file this version knows how to open (the passphrase is not checked). */
export function isEncryptedConfigFile(value) {
    const f = value;
    return typeof f === 'object' && f !== null
        && f.format === ENCRYPTED_CONFIG_FORMAT
        && typeof f.version === 'number' && f.version <= ENCRYPTED_CONFIG_VERSION
        && typeof f.kdf === 'object' && f.kdf !== null && f.kdf.name === 'PBKDF2-SHA256'
        && typeof f.kdf.iterations === 'number' && Number.isInteger(f.kdf.iterations) && f.kdf.iterations > 0
        && typeof f.kdf.salt === 'string'
        && f.cipher === 'AES-256-CBC'
        && typeof f.iv === 'string' && typeof f.ciphertext === 'string' && typeof f.mac === 'string';
}
/** Reads the text of a file; `ConfigFileError` tells why it could not be opened. */
export async function openConfig(text, passphrase, cipher) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new ConfigFileError('format');
    }
    if (!isEncryptedConfigFile(parsed))
        throw new ConfigFileError('format');
    let salt;
    let iv;
    let ciphertext;
    let mac;
    try {
        salt = base64Decode(parsed.kdf.salt);
        iv = base64Decode(parsed.iv);
        ciphertext = base64Decode(parsed.ciphertext);
        mac = base64Decode(parsed.mac);
    }
    catch {
        throw new ConfigFileError('format');
    }
    if (iv.length !== IV_LENGTH || mac.length !== MAC_LENGTH)
        throw new ConfigFileError('format');
    const keys = await deriveKeys(cipher, passphrase, salt, parsed.kdf.iterations);
    const expected = await cipher.hmacSha256(keys.mac, concatBytes(salt, iv, ciphertext));
    if (!bytesEqual(expected, mac))
        throw new ConfigFileError('passphrase');
    let plaintext;
    try {
        plaintext = await cipher.aesCbcDecrypt(keys.enc, iv, ciphertext);
    }
    catch {
        throw new ConfigFileError('passphrase');
    }
    let archive;
    try {
        archive = JSON.parse(utf8Decode(plaintext));
    }
    catch {
        throw new ConfigFileError('content');
    }
    const data = parseConfigData(archive);
    if (data === null)
        throw new ConfigFileError('content');
    return data;
}
/**
 * A `ConfigCipher` over the standard WebCrypto API (browsers, Node 20+, Deno).
 * The phone brings its own, built on CryptoJS.
 */
export function webCryptoConfigCipher(crypto) {
    const { subtle } = crypto;
    const raw = (bytes) => bytes.slice().buffer;
    return {
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
        async pbkdf2Sha256(passphrase, salt, iterations, length) {
            const key = await subtle.importKey('raw', raw(passphrase), 'PBKDF2', false, ['deriveBits']);
            const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: raw(salt), iterations }, key, length * 8);
            return new Uint8Array(bits);
        },
        async aesCbcEncrypt(key, iv, plaintext) {
            const k = await subtle.importKey('raw', raw(key), 'AES-CBC', false, ['encrypt']);
            return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: raw(iv) }, k, raw(plaintext)));
        },
        async aesCbcDecrypt(key, iv, ciphertext) {
            const k = await subtle.importKey('raw', raw(key), 'AES-CBC', false, ['decrypt']);
            return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: raw(iv) }, k, raw(ciphertext)));
        },
        async hmacSha256(key, data) {
            const k = await subtle.importKey('raw', raw(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            return new Uint8Array(await subtle.sign('HMAC', k, raw(data)));
        },
    };
}
//# sourceMappingURL=config-archive.js.map