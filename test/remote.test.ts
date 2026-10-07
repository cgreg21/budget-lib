/*
 * Covers the rules that decide where the budget lives and whether it may be
 * changed: address canonicalisation, the mapping to remote file names, and
 * the read-only rule that everything else in the sync engine leans on.
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REMOTE_CONFIG,
  DEFAULT_REMOTE_DIR,
  DISABLED_STATUS,
  MONTHS_DIR_NAME,
  REMOTE_PROVIDER_KINDS,
  REMOTE_SETTINGS_FILES,
  isRemoteActive,
  isRemoteConfig,
  isRemoteConfigComplete,
  isRemoteProviderKind,
  isRemoteSettingsFile,
  isStoredRemoteConfig,
  isWritable,
  monthFilePath,
  monthFromRemoteName,
  monthOfFilePath,
  normalizeBaseUrl,
  normalizeRemoteConfig,
  normalizeRemoteDir,
  remoteMonthPath,
  remoteMonthsDir,
  remotePathOf,
  remoteUrl,
  withProvider,
  type RemoteConfig,
  type RemoteState,
} from '../src/remote.js'

function config(overrides: Partial<RemoteConfig> = {}): RemoteConfig {
  return {
    provider: 'webdav',
    baseUrl: 'https://cloud.example.org/dav',
    username: 'alice',
    remoteDir: 'budget-app',
    enabled: true,
    ...overrides,
  }
}

describe('constants', () => {
  it('ships a disabled default configuration', () => {
    expect(DEFAULT_REMOTE_CONFIG).toEqual({
      provider: 'webdav',
      baseUrl: '',
      username: '',
      remoteDir: DEFAULT_REMOTE_DIR,
      enabled: false,
    })
    expect(DISABLED_STATUS).toEqual({ state: 'disabled' })
    expect(REMOTE_PROVIDER_KINDS).toEqual(['webdav', 'icloud'])
  })

  it('mirrors the settings files but keeps the server settings out', () => {
    expect(REMOTE_SETTINGS_FILES).toEqual(['categories.json', 'thresholds.json', 'recurrences.json'])
    expect(REMOTE_SETTINGS_FILES).not.toContain('remote.json')
    expect(MONTHS_DIR_NAME).toBe('months')
  })
})

describe('isRemoteProviderKind', () => {
  it('accepts the known providers only', () => {
    expect(isRemoteProviderKind('webdav')).toBe(true)
    expect(isRemoteProviderKind('icloud')).toBe(true)
    expect(isRemoteProviderKind('dropbox')).toBe(false)
    expect(isRemoteProviderKind(undefined)).toBe(false)
  })
})

describe('isRemoteConfig', () => {
  it('accepts a complete configuration', () => {
    expect(isRemoteConfig(config())).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'webdav'],
    ['a number', 3],
  ])('rejects %s', (_label, value) => {
    expect(isRemoteConfig(value)).toBe(false)
  })

  it.each([
    ['provider', { provider: 'ftp' }],
    ['baseUrl', { baseUrl: 42 }],
    ['username', { username: null }],
    ['remoteDir', { remoteDir: [] }],
    ['enabled', { enabled: 'yes' }],
  ])('rejects a bad %s', (_field, override) => {
    expect(isRemoteConfig({ ...config(), ...override })).toBe(false)
  })

  it('rejects a configuration missing a field entirely', () => {
    const { enabled: _enabled, ...withoutEnabled } = config()
    expect(isRemoteConfig(withoutEnabled)).toBe(false)
  })
})

describe('normalizeBaseUrl', () => {
  it.each([
    ['  https://cloud.example.org/dav  ', 'https://cloud.example.org/dav'],
    ['https://cloud.example.org/dav/', 'https://cloud.example.org/dav'],
    ['https://cloud.example.org///', 'https://cloud.example.org'],
    ['', ''],
    ['   ', ''],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })
})

describe('normalizeRemoteDir', () => {
  it.each([
    ['/budget/', 'budget'],
    ['budget//2026', 'budget/2026'],
    [' budget / 2026 ', 'budget/2026'],
    ['./budget', 'budget'],
    ['', DEFAULT_REMOTE_DIR],
    ['///', DEFAULT_REMOTE_DIR],
    ['.', DEFAULT_REMOTE_DIR],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeRemoteDir(input)).toBe(expected)
  })
})

describe('normalizeRemoteConfig', () => {
  it('canonicalises the address, the user and the directory', () => {
    expect(normalizeRemoteConfig(config({
      baseUrl: 'https://cloud.example.org/dav/',
      username: '  alice ',
      remoteDir: '/budget/',
    }))).toEqual({
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget',
      enabled: true,
    })
  })

  it('switches off a configuration that has no address', () => {
    expect(normalizeRemoteConfig(config({ baseUrl: '   ' })).enabled).toBe(false)
  })

  it('switches off a configuration that has no user', () => {
    expect(normalizeRemoteConfig(config({ username: ' ' })).enabled).toBe(false)
  })

  it('keeps an iCloud configuration switched on without address nor user', () => {
    expect(normalizeRemoteConfig(config({ provider: 'icloud', baseUrl: '', username: '' })).enabled).toBe(true)
  })

  it('leaves a complete configuration switched off when it already was', () => {
    expect(normalizeRemoteConfig(config({ enabled: false })).enabled).toBe(false)
  })
})

describe('isRemoteConfigComplete / isRemoteActive', () => {
  it('needs both an address and a user', () => {
    expect(isRemoteConfigComplete(config())).toBe(true)
    expect(isRemoteConfigComplete(config({ baseUrl: '' }))).toBe(false)
    expect(isRemoteConfigComplete(config({ username: '  ' }))).toBe(false)
  })

  it('needs neither for iCloud, which is the account of the device', () => {
    expect(isRemoteConfigComplete(config({ provider: 'icloud', baseUrl: '', username: '' }))).toBe(true)
    expect(isRemoteActive(config({ provider: 'icloud', baseUrl: '', username: '' }))).toBe(true)
  })

  it('is active only when complete and switched on', () => {
    expect(isRemoteActive(config())).toBe(true)
    expect(isRemoteActive(config({ enabled: false }))).toBe(false)
    expect(isRemoteActive(config({ baseUrl: '' }))).toBe(false)
  })
})

describe('isWritable', () => {
  it.each<[RemoteState, boolean]>([
    ['disabled', true],
    ['online', true],
    ['connecting', false],
    ['syncing', false],
    ['offline', false],
    ['error', false],
  ])('%s → %s', (state, expected) => {
    expect(isWritable({ state })).toBe(expected)
  })
})

describe('remote paths', () => {
  it('places the settings files inside the remote directory', () => {
    expect(remotePathOf(config(), 'categories.json')).toBe('budget-app/categories.json')
  })

  it('canonicalises the directory on the way', () => {
    expect(remotePathOf(config({ remoteDir: '/perso/budget/' }), 'thresholds.json'))
      .toBe('perso/budget/thresholds.json')
  })

  it('names the months directory and its files', () => {
    expect(remoteMonthsDir(config())).toBe('budget-app/months')
    expect(remoteMonthPath(config(), '2026-09')).toBe('budget-app/months/2026-09.json')
  })
})

describe('monthFromRemoteName', () => {
  it.each([
    ['2026-09.json', '2026-09'],
    ['1970-01.json', '1970-01'],
  ])('reads %s as %s', (fileName, expected) => {
    expect(monthFromRemoteName(fileName)).toBe(expected)
  })

  it.each(['2026-09.txt', 'notes.json', '2026-13.json', 'months.json', '.json'])(
    'ignores %s',
    (fileName) => {
      expect(monthFromRemoteName(fileName)).toBeNull()
    },
  )
})

describe('remoteUrl', () => {
  it('joins the base and the path', () => {
    expect(remoteUrl('https://cloud.example.org/dav', 'budget-app/months/2026-09.json'))
      .toBe('https://cloud.example.org/dav/budget-app/months/2026-09.json')
  })

  it('drops the trailing slash of the base and the empty segments of the path', () => {
    expect(remoteUrl('https://cloud.example.org/dav/', '/budget-app//categories.json'))
      .toBe('https://cloud.example.org/dav/budget-app/categories.json')
  })

  it('encodes each segment separately, keeping the separators', () => {
    expect(remoteUrl('https://cloud.example.org', 'mon budget/2026-09.json'))
      .toBe('https://cloud.example.org/mon%20budget/2026-09.json')
  })

  it('returns the base alone for an empty path', () => {
    expect(remoteUrl('https://cloud.example.org/dav/', '')).toBe('https://cloud.example.org/dav')
  })
})

describe('stored configurations', () => {
  it('accepts a configuration saved before iCloud, which has no provider', () => {
    const { provider: _provider, ...legacy } = config()
    expect(isRemoteConfig(legacy)).toBe(false)
    expect(isStoredRemoteConfig(legacy)).toBe(true)
    expect(isStoredRemoteConfig(config())).toBe(true)
  })

  it.each([
    ['null', null],
    ['an unknown provider', { ...config(), provider: 'ftp' }],
    ['a missing field', { baseUrl: '', username: '', remoteDir: 'x' }],
  ])('rejects %s', (_label, value) => {
    expect(isStoredRemoteConfig(value)).toBe(false)
  })

  it('makes a configuration without provider a WebDAV one', () => {
    const { provider: _provider, ...legacy } = config({ provider: 'icloud' })
    expect(withProvider(legacy).provider).toBe('webdav')
    expect(withProvider(config({ provider: 'icloud' })).provider).toBe('icloud')
  })
})

describe('isRemoteSettingsFile', () => {
  it('tells the settings files from anything else', () => {
    expect(isRemoteSettingsFile('categories.json')).toBe(true)
    expect(isRemoteSettingsFile('remote.json')).toBe(false)
    expect(isRemoteSettingsFile('months')).toBe(false)
  })
})

describe('paths relative to the remote directory', () => {
  it('names a month file and reads the month back', () => {
    expect(monthFilePath('2026-09')).toBe('months/2026-09.json')
    expect(monthOfFilePath('months/2026-09.json')).toBe('2026-09')
  })

  it.each(['categories.json', '2026-09.json', 'months/2026-09.txt', 'months/notes.json', 'months/a/2026-09.json', 'other/2026-09.json'])(
    'does not take %s for a month file',
    (file) => {
      expect(monthOfFilePath(file)).toBeNull()
    },
  )
})
