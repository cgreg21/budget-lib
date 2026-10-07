import { type MonthKey } from './month.js';
/** The providers the storage can speak to. */
export type RemoteProviderKind = 'webdav' | 'icloud';
export declare const REMOTE_PROVIDER_KINDS: readonly RemoteProviderKind[];
export interface RemoteConfig {
    /** Which protocol to speak. */
    provider: RemoteProviderKind;
    /** Root address of the server, e.g. `https://cloud.example.org/remote.php/dav/files/alice`. */
    baseUrl: string;
    username: string;
    /** Directory holding the budget on that server, relative to `baseUrl`. */
    remoteDir: string;
    /** Whether the budget is actually read from and written to the remote. */
    enabled: boolean;
}
/** What is read back from a settings file: configs saved before iCloud have no provider. */
export type StoredRemoteConfig = Omit<RemoteConfig, 'provider'> & {
    provider?: RemoteProviderKind;
};
export declare const DEFAULT_REMOTE_DIR = "budget-app";
export declare const DEFAULT_REMOTE_CONFIG: RemoteConfig;
/**
 * Where the budget stands with regard to its server.
 *
 *   disabled    no remote configured — the app keeps its files to itself
 *   connecting  reaching the server, contents not settled yet
 *   syncing     exchanging files (apps that synchronise in the background)
 *   online      local data and server are in step; the budget is editable
 *   offline     unreachable; the data is readable, and kept until the server answers again
 *   error       reached and refused — wrong address, credentials or rights
 */
export type RemoteState = 'disabled' | 'connecting' | 'syncing' | 'online' | 'offline' | 'error';
export interface RemoteStatus {
    state: RemoteState;
    /** Why it went wrong, ready to be shown as-is. Absent unless `state` says so. */
    message?: string;
    /** When the data was last settled with the remote, ISO; absent until it is. */
    lastSyncedAt?: string;
}
/** The status of an app that edits offline: the changes wait to be sent. */
export interface SyncStatus extends RemoteStatus {
    /** Number of files changed locally and not yet sent. */
    pending: number;
}
export declare const DISABLED_STATUS: RemoteStatus;
/** The settings files mirrored on the remote, next to the `months/` directory. */
export declare const REMOTE_SETTINGS_FILES: readonly ["categories.json", "thresholds.json", "recurrences.json"];
/**
 * `remote.json` is missing from that list on purpose: which server to talk to
 * is a property of this machine, not of the budget — and a budget that
 * carried its own address could never be pointed at another one.
 */
export declare const MONTHS_DIR_NAME = "months";
export declare function isRemoteSettingsFile(fileName: string): boolean;
/**
 * Desktop policy: only editable while the remote is online (or unused), so the
 * cache never holds what the server ignores. Apps that merge later do not use it.
 */
export declare function isWritable(status: RemoteStatus): boolean;
/** True once the remote is meant to be used, whether or not it answers. */
export declare function isRemoteActive(config: RemoteConfig): boolean;
/** A configuration holding everything needed to attempt a connection (iCloud is the account of the device). */
export declare function isRemoteConfigComplete(config: RemoteConfig): boolean;
export declare function isRemoteProviderKind(value: unknown): value is RemoteProviderKind;
export declare function isRemoteConfig(value: unknown): value is RemoteConfig;
/** Like `isRemoteConfig`, but accepts a config saved before iCloud existed (no provider). */
export declare function isStoredRemoteConfig(value: unknown): value is StoredRemoteConfig;
/** A config saved before iCloud existed has no provider: it was a WebDAV one. */
export declare function withProvider(config: StoredRemoteConfig): RemoteConfig;
/**
 * Canonicalises what the user typed: addresses lose their trailing slash,
 * directories their surrounding ones, and a blank directory falls back to the
 * default so the budget never lands in the account's root.
 */
export declare function normalizeRemoteConfig(config: RemoteConfig): RemoteConfig;
export declare function normalizeBaseUrl(baseUrl: string): string;
/** A directory path with no leading, trailing or doubled separator. */
export declare function normalizeRemoteDir(remoteDir: string): string;
/** The remote path of a settings file, relative to `baseUrl`. */
export declare function remotePathOf(config: RemoteConfig, fileName: string): string;
/** The remote directory holding the month files, relative to `baseUrl`. */
export declare function remoteMonthsDir(config: RemoteConfig): string;
export declare function remoteMonthPath(config: RemoteConfig, month: MonthKey): string;
/** The month a remote file name (`2026-09.json`) holds, or `null` when it is not one of ours. */
export declare function monthFromRemoteName(fileName: string): MonthKey | null;
/** Path of a month file relative to the remote directory: `months/2026-09.json`. */
export declare function monthFilePath(month: MonthKey): string;
/** The month a path relative to the remote directory holds, or `null` when it is not a month file. */
export declare function monthOfFilePath(file: string): MonthKey | null;
/** Joins a base address and a relative path into the URL a provider requests. */
export declare function remoteUrl(baseUrl: string, remotePath: string): string;
//# sourceMappingURL=remote.d.ts.map