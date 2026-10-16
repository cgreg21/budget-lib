import { type BalanceThresholds } from '../display/balance.js';
import { type BankConfig } from '../bank/bank-state.js';
import { type CalendarConfig } from '../calendar/caldav.js';
import { type GeneralSettings } from '../display/general-settings.js';
/** Stamped in the clear-text archive and in the encrypted container. */
export declare const CONFIG_FORMAT = "budget-app-config";
export declare const CONFIG_VERSION = 1;
export declare const ENCRYPTED_CONFIG_FORMAT = "budget-app-config-encrypted";
export declare const ENCRYPTED_CONFIG_VERSION = 1;
/** Suggested extension of the exported file. */
export declare const CONFIG_FILE_EXTENSION = ".budgetcfg";
export declare const CONFIG_KDF_ITERATIONS = 100000;
export interface CalendarConfigExport extends CalendarConfig {
    /** Address of the CORS proxy, when one is used (the PWA); empty otherwise. */
    proxyUrl: string;
    password: string;
}
export interface BankConfigExport {
    config: BankConfig;
    /** PEM private key of the Enable Banking application; empty when none was set. */
    privateKey: string;
}
/** Everything a user sets up once and would rather not type again on another device. */
export interface ConfigData {
    general: GeneralSettings;
    thresholds: BalanceThresholds;
    calendar: CalendarConfigExport;
    bank: BankConfigExport | null;
}
export interface ConfigArchive extends ConfigData {
    format: string;
    version: number;
    /** ISO timestamp, informative only. */
    exportedAt: string;
}
/** The file as written: nothing in it is usable without the passphrase. */
export interface EncryptedConfigFile {
    format: string;
    version: number;
    exportedAt: string;
    kdf: {
        name: 'PBKDF2-SHA256';
        iterations: number;
        salt: string;
    };
    cipher: 'AES-256-CBC';
    iv: string;
    ciphertext: string;
    /** HMAC-SHA256 of salt ‖ iv ‖ ciphertext. */
    mac: string;
}
/** The primitives each platform provides; all byte arrays, all asynchronous. */
export interface ConfigCipher {
    randomBytes(length: number): Uint8Array;
    pbkdf2Sha256(passphrase: Uint8Array, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array>;
    aesCbcEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
    aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
    hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
}
export type ConfigFileErrorCode = 
/** Not a configuration file of ours, or one from a newer version. */
'format'
/** Wrong passphrase (or a tampered file: the two cannot be told apart). */
 | 'passphrase'
/** Decrypted fine, but the content is not a valid configuration. */
 | 'content'
/** Passphrase too short to be worth anything. */
 | 'weak-passphrase';
export declare class ConfigFileError extends Error {
    readonly code: ConfigFileErrorCode;
    constructor(code: ConfigFileErrorCode);
}
export declare function isPassphraseAcceptable(passphrase: string): boolean;
export declare function createConfigArchive(data: ConfigData, exportedAt?: string): ConfigArchive;
/**
 * Validates a clear-text archive. `null` when it is not ours or a section is
 * malformed: a half-applied configuration would be worse than a refused one.
 */
export declare function parseConfigData(value: unknown): ConfigData | null;
/** A configuration with nothing set up: the starting point of an application. */
export declare function emptyConfigData(): ConfigData;
/** Which sections of a configuration carry something: shown to the user before importing. */
export declare function describeConfig(data: ConfigData): {
    calendar: boolean;
    bank: boolean;
    calendarPassword: boolean;
    bankKey: boolean;
};
/** Encrypts the configuration into the text of the file to save. */
export declare function sealConfig(data: ConfigData, passphrase: string, cipher: ConfigCipher, options?: {
    exportedAt?: string;
    iterations?: number;
}): Promise<string>;
/** True for a file this version knows how to open (the passphrase is not checked). */
export declare function isEncryptedConfigFile(value: unknown): value is EncryptedConfigFile;
/** Reads the text of a file; `ConfigFileError` tells why it could not be opened. */
export declare function openConfig(text: string, passphrase: string, cipher: ConfigCipher): Promise<ConfigData>;
/** The part of the WebCrypto API that is used, typed structurally so the library needs no DOM typings. */
export interface WebCryptoLike {
    getRandomValues<T extends Uint8Array>(array: T): T;
    subtle: {
        importKey(format: 'raw', keyData: ArrayBuffer, algorithm: unknown, extractable: boolean, usages: string[]): Promise<unknown>;
        deriveBits(algorithm: unknown, key: unknown, length: number): Promise<ArrayBuffer>;
        encrypt(algorithm: unknown, key: unknown, data: ArrayBuffer): Promise<ArrayBuffer>;
        decrypt(algorithm: unknown, key: unknown, data: ArrayBuffer): Promise<ArrayBuffer>;
        sign(algorithm: unknown, key: unknown, data: ArrayBuffer): Promise<ArrayBuffer>;
    };
}
/**
 * A `ConfigCipher` over the standard WebCrypto API (browsers, Node 20+, Deno).
 * The phone brings its own, built on CryptoJS.
 */
export declare function webCryptoConfigCipher(crypto: WebCryptoLike): ConfigCipher;
//# sourceMappingURL=config-archive.d.ts.map