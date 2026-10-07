/*
 * domain/remote.ts — what it means for the budget to live on a remote server
 * rather than on this machine, shared by the desktop and the mobile apps.
 *
 * The application speaks to a *provider*, not to a protocol: WebDAV (an
 * Infomaniak kDrive, a Nextcloud…) and iCloud Drive (iOS only) are known, and
 * everything here is expressed in terms any provider could honour — a base
 * address, a directory, a user, and a flat set of file names:
 *
 *   <remoteDir>/categories.json  thresholds.json  recurrences.json
 *   <remoteDir>/months/YYYY-MM.json
 *
 * Both applications share that layout, so they can share the same directory.
 * What differs is the policy when the server cannot be reached: the desktop
 * is read-only (see `isWritable`), the mobile keeps editing and reconciles
 * later (see `SyncStatus.pending`).
 *
 * The password is deliberately absent from `RemoteConfig`: it belongs to the
 * system keyring or secure storage, never to a settings file.
 */
import { isMonthKey } from './month.js';
export const REMOTE_PROVIDER_KINDS = ['webdav', 'icloud'];
export const DEFAULT_REMOTE_DIR = 'budget-app';
export const DEFAULT_REMOTE_CONFIG = {
    provider: 'webdav',
    baseUrl: '',
    username: '',
    remoteDir: DEFAULT_REMOTE_DIR,
    enabled: false,
};
export const DISABLED_STATUS = { state: 'disabled' };
/** The settings files mirrored on the remote, next to the `months/` directory. */
export const REMOTE_SETTINGS_FILES = ['categories.json', 'thresholds.json', 'recurrences.json'];
/**
 * `remote.json` is missing from that list on purpose: which server to talk to
 * is a property of this machine, not of the budget — and a budget that
 * carried its own address could never be pointed at another one.
 */
export const MONTHS_DIR_NAME = 'months';
const MONTH_FILE_EXTENSION = '.json';
export function isRemoteSettingsFile(fileName) {
    return REMOTE_SETTINGS_FILES.includes(fileName);
}
/**
 * Desktop policy: only editable while the remote is online (or unused), so the
 * cache never holds what the server ignores. Apps that merge later do not use it.
 */
export function isWritable(status) {
    return status.state === 'disabled' || status.state === 'online';
}
/** True once the remote is meant to be used, whether or not it answers. */
export function isRemoteActive(config) {
    return config.enabled && isRemoteConfigComplete(config);
}
/** A configuration holding everything needed to attempt a connection (iCloud is the account of the device). */
export function isRemoteConfigComplete(config) {
    if (config.provider === 'icloud')
        return true;
    return normalizeBaseUrl(config.baseUrl) !== '' && config.username.trim() !== '';
}
export function isRemoteProviderKind(value) {
    return REMOTE_PROVIDER_KINDS.includes(value);
}
function hasRemoteFields(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const { baseUrl, username, remoteDir, enabled } = value;
    return (typeof baseUrl === 'string' &&
        typeof username === 'string' &&
        typeof remoteDir === 'string' &&
        typeof enabled === 'boolean');
}
export function isRemoteConfig(value) {
    return hasRemoteFields(value) && isRemoteProviderKind(value.provider);
}
/** Like `isRemoteConfig`, but accepts a config saved before iCloud existed (no provider). */
export function isStoredRemoteConfig(value) {
    return hasRemoteFields(value) && (value.provider === undefined || isRemoteProviderKind(value.provider));
}
/** A config saved before iCloud existed has no provider: it was a WebDAV one. */
export function withProvider(config) {
    return { ...config, provider: config.provider ?? 'webdav' };
}
/**
 * Canonicalises what the user typed: addresses lose their trailing slash,
 * directories their surrounding ones, and a blank directory falls back to the
 * default so the budget never lands in the account's root.
 */
export function normalizeRemoteConfig(config) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const username = config.username.trim();
    return {
        provider: config.provider,
        baseUrl,
        username,
        remoteDir: normalizeRemoteDir(config.remoteDir),
        // A configuration that cannot be connected to is not left switched on:
        // the app would keep reporting an error it can do nothing about.
        enabled: config.enabled && isRemoteConfigComplete({ ...config, baseUrl, username }),
    };
}
export function normalizeBaseUrl(baseUrl) {
    return baseUrl.trim().replace(/\/+$/, '');
}
/** A directory path with no leading, trailing or doubled separator. */
export function normalizeRemoteDir(remoteDir) {
    const cleaned = remoteDir
        .trim()
        .split('/')
        .map((segment) => segment.trim())
        .filter((segment) => segment !== '' && segment !== '.')
        .join('/');
    return cleaned === '' ? DEFAULT_REMOTE_DIR : cleaned;
}
/** The remote path of a settings file, relative to `baseUrl`. */
export function remotePathOf(config, fileName) {
    return `${normalizeRemoteDir(config.remoteDir)}/${fileName}`;
}
/** The remote directory holding the month files, relative to `baseUrl`. */
export function remoteMonthsDir(config) {
    return remotePathOf(config, MONTHS_DIR_NAME);
}
export function remoteMonthPath(config, month) {
    return `${remoteMonthsDir(config)}/${month}${MONTH_FILE_EXTENSION}`;
}
/** The month a remote file name (`2026-09.json`) holds, or `null` when it is not one of ours. */
export function monthFromRemoteName(fileName) {
    if (!fileName.endsWith(MONTH_FILE_EXTENSION))
        return null;
    const month = fileName.slice(0, -MONTH_FILE_EXTENSION.length);
    return isMonthKey(month) ? month : null;
}
/** Path of a month file relative to the remote directory: `months/2026-09.json`. */
export function monthFilePath(month) {
    return `${MONTHS_DIR_NAME}/${month}${MONTH_FILE_EXTENSION}`;
}
/** The month a path relative to the remote directory holds, or `null` when it is not a month file. */
export function monthOfFilePath(file) {
    const prefix = `${MONTHS_DIR_NAME}/`;
    return file.startsWith(prefix) ? monthFromRemoteName(file.slice(prefix.length)) : null;
}
/** Joins a base address and a relative path into the URL a provider requests. */
export function remoteUrl(baseUrl, remotePath) {
    const base = normalizeBaseUrl(baseUrl);
    const encoded = remotePath
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return encoded === '' ? base : `${base}/${encoded}`;
}
//# sourceMappingURL=remote.js.map