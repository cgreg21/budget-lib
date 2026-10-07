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
import { isMonthKey, type MonthKey } from './month.js'

/** The providers the storage can speak to. */
export type RemoteProviderKind = 'webdav' | 'icloud'

export const REMOTE_PROVIDER_KINDS: readonly RemoteProviderKind[] = ['webdav', 'icloud']

export interface RemoteConfig {
  /** Which protocol to speak. */
  provider: RemoteProviderKind
  /** Root address of the server, e.g. `https://cloud.example.org/remote.php/dav/files/alice`. */
  baseUrl: string
  username: string
  /** Directory holding the budget on that server, relative to `baseUrl`. */
  remoteDir: string
  /** Whether the budget is actually read from and written to the remote. */
  enabled: boolean
}

/** What is read back from a settings file: configs saved before iCloud have no provider. */
export type StoredRemoteConfig = Omit<RemoteConfig, 'provider'> & { provider?: RemoteProviderKind }

export const DEFAULT_REMOTE_DIR = 'budget-app'

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  provider: 'webdav',
  baseUrl: '',
  username: '',
  remoteDir: DEFAULT_REMOTE_DIR,
  enabled: false,
}

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
export type RemoteState = 'disabled' | 'connecting' | 'syncing' | 'online' | 'offline' | 'error'

export interface RemoteStatus {
  state: RemoteState
  /** Why it went wrong, ready to be shown as-is. Absent unless `state` says so. */
  message?: string
  /** When the data was last settled with the remote, ISO; absent until it is. */
  lastSyncedAt?: string
}

/** The status of an app that edits offline: the changes wait to be sent. */
export interface SyncStatus extends RemoteStatus {
  /** Number of files changed locally and not yet sent. */
  pending: number
}

export const DISABLED_STATUS: RemoteStatus = { state: 'disabled' }

/** The settings files mirrored on the remote, next to the `months/` directory. */
export const REMOTE_SETTINGS_FILES = ['categories.json', 'thresholds.json', 'recurrences.json'] as const

/**
 * `remote.json` is missing from that list on purpose: which server to talk to
 * is a property of this machine, not of the budget — and a budget that
 * carried its own address could never be pointed at another one.
 */
export const MONTHS_DIR_NAME = 'months'

const MONTH_FILE_EXTENSION = '.json'

export function isRemoteSettingsFile(fileName: string): boolean {
  return (REMOTE_SETTINGS_FILES as readonly string[]).includes(fileName)
}

/**
 * Desktop policy: only editable while the remote is online (or unused), so the
 * cache never holds what the server ignores. Apps that merge later do not use it.
 */
export function isWritable(status: RemoteStatus): boolean {
  return status.state === 'disabled' || status.state === 'online'
}

/** True once the remote is meant to be used, whether or not it answers. */
export function isRemoteActive(config: RemoteConfig): boolean {
  return config.enabled && isRemoteConfigComplete(config)
}

/** A configuration holding everything needed to attempt a connection (iCloud is the account of the device). */
export function isRemoteConfigComplete(config: RemoteConfig): boolean {
  if (config.provider === 'icloud') return true
  return normalizeBaseUrl(config.baseUrl) !== '' && config.username.trim() !== ''
}

export function isRemoteProviderKind(value: unknown): value is RemoteProviderKind {
  return REMOTE_PROVIDER_KINDS.includes(value as RemoteProviderKind)
}

function hasRemoteFields(value: unknown): value is Partial<RemoteConfig> & Pick<RemoteConfig, 'baseUrl' | 'username' | 'remoteDir' | 'enabled'> {
  if (typeof value !== 'object' || value === null) return false

  const { baseUrl, username, remoteDir, enabled } = value as Partial<RemoteConfig>
  return (
    typeof baseUrl === 'string' &&
    typeof username === 'string' &&
    typeof remoteDir === 'string' &&
    typeof enabled === 'boolean'
  )
}

export function isRemoteConfig(value: unknown): value is RemoteConfig {
  return hasRemoteFields(value) && isRemoteProviderKind(value.provider)
}

/** Like `isRemoteConfig`, but accepts a config saved before iCloud existed (no provider). */
export function isStoredRemoteConfig(value: unknown): value is StoredRemoteConfig {
  return hasRemoteFields(value) && (value.provider === undefined || isRemoteProviderKind(value.provider))
}

/** A config saved before iCloud existed has no provider: it was a WebDAV one. */
export function withProvider(config: StoredRemoteConfig): RemoteConfig {
  return { ...config, provider: config.provider ?? 'webdav' }
}

/**
 * Canonicalises what the user typed: addresses lose their trailing slash,
 * directories their surrounding ones, and a blank directory falls back to the
 * default so the budget never lands in the account's root.
 */
export function normalizeRemoteConfig(config: RemoteConfig): RemoteConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const username = config.username.trim()

  return {
    provider: config.provider,
    baseUrl,
    username,
    remoteDir: normalizeRemoteDir(config.remoteDir),
    // A configuration that cannot be connected to is not left switched on:
    // the app would keep reporting an error it can do nothing about.
    enabled: config.enabled && isRemoteConfigComplete({ ...config, baseUrl, username }),
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/** A directory path with no leading, trailing or doubled separator. */
export function normalizeRemoteDir(remoteDir: string): string {
  const cleaned = remoteDir
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')

  return cleaned === '' ? DEFAULT_REMOTE_DIR : cleaned
}

/** The remote path of a settings file, relative to `baseUrl`. */
export function remotePathOf(config: RemoteConfig, fileName: string): string {
  return `${normalizeRemoteDir(config.remoteDir)}/${fileName}`
}

/** The remote directory holding the month files, relative to `baseUrl`. */
export function remoteMonthsDir(config: RemoteConfig): string {
  return remotePathOf(config, MONTHS_DIR_NAME)
}

export function remoteMonthPath(config: RemoteConfig, month: MonthKey): string {
  return `${remoteMonthsDir(config)}/${month}${MONTH_FILE_EXTENSION}`
}

/** The month a remote file name (`2026-09.json`) holds, or `null` when it is not one of ours. */
export function monthFromRemoteName(fileName: string): MonthKey | null {
  if (!fileName.endsWith(MONTH_FILE_EXTENSION)) return null
  const month = fileName.slice(0, -MONTH_FILE_EXTENSION.length)
  return isMonthKey(month) ? month : null
}

/** Path of a month file relative to the remote directory: `months/2026-09.json`. */
export function monthFilePath(month: MonthKey): string {
  return `${MONTHS_DIR_NAME}/${month}${MONTH_FILE_EXTENSION}`
}

/** The month a path relative to the remote directory holds, or `null` when it is not a month file. */
export function monthOfFilePath(file: string): MonthKey | null {
  const prefix = `${MONTHS_DIR_NAME}/`
  return file.startsWith(prefix) ? monthFromRemoteName(file.slice(prefix.length)) : null
}

/** Joins a base address and a relative path into the URL a provider requests. */
export function remoteUrl(baseUrl: string, remotePath: string): string {
  const base = normalizeBaseUrl(baseUrl)
  const encoded = remotePath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return encoded === '' ? base : `${base}/${encoded}`
}
