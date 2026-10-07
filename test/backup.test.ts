import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  countBackup,
  createArchive,
  isBackupArchive,
  mergeBackups,
  parseBackupData,
  type BackupData,
} from '../src/backup.js'
import { DEFAULT_CATEGORIES } from '../src/category.js'
import { DEFAULT_BALANCE_THRESHOLDS } from '../src/balance.js'
import type { Recurrence } from '../src/recurrence.js'
import type { Transaction } from '../src/transaction.js'

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  date: '2026-09-01',
  description: 'Loyer',
  category: 'Logement',
  kind: 'expense',
  amount: 800,
  ...overrides,
})

const recurrence = (overrides: Partial<Recurrence> = {}): Recurrence => ({
  id: 'r1',
  description: 'Loyer',
  category: 'Logement',
  kind: 'expense',
  amount: 800,
  day: 1,
  frequency: 'monthly',
  startMonth: '2026-01',
  ...overrides,
})

const emptyData = (): BackupData => ({
  categories: [...DEFAULT_CATEGORIES],
  thresholds: { ...DEFAULT_BALANCE_THRESHOLDS },
  recurrences: [],
  months: {},
})

describe('createArchive', () => {
  it('stamps the archive with the format, version and export date', () => {
    const archive = createArchive(emptyData(), '2026-09-17T12:00:00.000Z')

    expect(archive.format).toBe(BACKUP_FORMAT)
    expect(archive.version).toBe(BACKUP_VERSION)
    expect(archive.exportedAt).toBe('2026-09-17T12:00:00.000Z')
  })

  it('sorts months chronologically and drops empty ones', () => {
    const data: BackupData = {
      ...emptyData(),
      months: {
        '2026-09': [transaction()],
        '2026-01': [transaction({ id: 't2' })],
        '2026-05': [],
      },
    }

    expect(Object.keys(createArchive(data).months)).toEqual(['2026-01', '2026-09'])
  })

  it('deep-copies the input data', () => {
    const data = emptyData()
    const archive = createArchive(data)
    archive.categories.push({ name: 'Extra', icon: 'x' })
    expect(data.categories).toEqual(DEFAULT_CATEGORIES)
  })
})

describe('isBackupArchive', () => {
  it('accepts a freshly created archive', () => {
    expect(isBackupArchive(createArchive(emptyData()))).toBe(true)
  })

  it('rejects a foreign object', () => {
    expect(isBackupArchive({ format: 'something-else', version: 1 })).toBe(false)
    expect(isBackupArchive(null)).toBe(false)
  })

  it('rejects a version newer than what is supported', () => {
    expect(isBackupArchive({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 })).toBe(false)
  })
})

describe('parseBackupData', () => {
  it('parses a valid archive', () => {
    const archive = createArchive({
      ...emptyData(),
      recurrences: [recurrence()],
      months: { '2026-09': [transaction()] },
    })

    const parsed = parseBackupData(archive)
    expect(parsed).not.toBeNull()
    expect(parsed?.months['2026-09']).toEqual([transaction()])
    expect(parsed?.recurrences).toEqual([recurrence()])
  })

  it('upgrades legacy plain-string categories', () => {
    const archive = { ...createArchive(emptyData()), categories: ['Transport', 'Divers'] }
    const parsed = parseBackupData(archive)

    expect(parsed?.categories).toEqual([
      { name: 'Transport', icon: 'emoji-travel-symbolic' },
      { name: 'Divers', icon: 'folder-symbolic' },
    ])
  })

  it('rejects an archive with malformed months', () => {
    const archive = { ...createArchive(emptyData()), months: { 'bad-month': [transaction()] } }
    expect(parseBackupData(archive)).toBeNull()
  })

  it('rejects an archive with invalid thresholds', () => {
    const archive = { ...createArchive(emptyData()), thresholds: { low: 1000, medium: 500, high: 0 } }
    expect(parseBackupData(archive)).toBeNull()
  })

  it('rejects a value that is not a recognised archive at all', () => {
    expect(parseBackupData({ foo: 'bar' })).toBeNull()
  })

  it('rejects categories that are neither the current nor the legacy shape', () => {
    const archive = { ...createArchive(emptyData()), categories: [{ nope: true }] }
    expect(parseBackupData(archive)).toBeNull()
  })

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['an array', []],
  ])('rejects months given as %s', (_label, months) => {
    expect(parseBackupData({ ...createArchive(emptyData()), months })).toBeNull()
  })

  it('rejects an archive whose months hold something other than transactions', () => {
    const archive = { ...createArchive(emptyData()), months: { '2026-09': [{ nope: true }] } }
    expect(parseBackupData(archive)).toBeNull()
  })

  it('drops months that hold no transaction', () => {
    const archive = { ...createArchive(emptyData()), months: { '2026-09': [] } }
    expect(parseBackupData(archive)?.months).toEqual({})
  })

  it('rejects an archive whose recurrences are malformed', () => {
    const archive = { ...createArchive(emptyData()), recurrences: [{ nope: true }] }
    expect(parseBackupData(archive)).toBeNull()
  })
})

describe('isBackupArchive (shape)', () => {
  it('rejects an archive whose version is not a number', () => {
    expect(isBackupArchive({ format: BACKUP_FORMAT, version: '1' })).toBe(false)
  })

  it('rejects an array', () => {
    expect(isBackupArchive([])).toBe(false)
  })
})

describe('countBackup', () => {
  it('counts months, transactions, categories and recurrences', () => {
    const data: BackupData = {
      ...emptyData(),
      recurrences: [recurrence()],
      months: { '2026-09': [transaction(), transaction({ id: 't2' })], '2026-10': [transaction({ id: 't3' })] },
    }

    expect(countBackup(data)).toEqual({
      months: 2,
      transactions: 3,
      categories: DEFAULT_CATEGORIES.length,
      recurrences: 1,
    })
  })
})

describe('mergeBackups', () => {
  it('adds a new category from the incoming archive', () => {
    const current = emptyData()
    const incoming = { ...emptyData(), categories: [{ name: 'Nouvelle', icon: 'x' }] }

    const { data, added } = mergeBackups(current, incoming)

    expect(added.categories).toBe(1)
    expect(data.categories.some((c) => c.name === 'Nouvelle')).toBe(true)
  })

  it('does not duplicate a category that already exists by name', () => {
    const current = { ...emptyData(), categories: [{ name: 'Transport', icon: 'a' }] }
    const incoming = { ...emptyData(), categories: [{ name: 'Transport', icon: 'b' }] }

    const { added } = mergeBackups(current, incoming)
    expect(added.categories).toBe(0)
  })

  it('adds a new recurrence and skips one matching by id', () => {
    const current = { ...emptyData(), recurrences: [recurrence({ id: 'r1' })] }
    const incoming = { ...emptyData(), recurrences: [recurrence({ id: 'r1' }), recurrence({ id: 'r2', description: 'Autre' })] }

    const { added } = mergeBackups(current, incoming)
    expect(added.recurrences).toBe(1)
  })

  it('skips a recurrence matching by content even with a different id', () => {
    const current = { ...emptyData(), recurrences: [recurrence({ id: 'r1' })] }
    const incoming = { ...emptyData(), recurrences: [recurrence({ id: 'other-id' })] }

    const { added } = mergeBackups(current, incoming)
    expect(added.recurrences).toBe(0)
  })

  it('merges transactions per month, skipping duplicates by id or content', () => {
    const current = { ...emptyData(), months: { '2026-09': [transaction({ id: 't1' })] } }
    const incoming = {
      ...emptyData(),
      months: {
        '2026-09': [transaction({ id: 't1' }), transaction({ id: 't2', description: 'Autre', amount: 50 })],
        '2026-10': [transaction({ id: 't3' })],
      },
    }

    const { data, added } = mergeBackups(current, incoming)

    expect(added.transactions).toBe(2)
    expect(added.months).toBe(2)
    expect(data.months['2026-09']).toHaveLength(2)
    expect(data.months['2026-10']).toHaveLength(1)
  })

  it('keeps the current thresholds untouched', () => {
    const current = { ...emptyData(), thresholds: { low: -100, medium: 200, high: 900 } }
    const incoming = { ...emptyData(), thresholds: { low: 0, medium: 500, high: 1000 } }

    const { data } = mergeBackups(current, incoming)
    expect(data.thresholds).toEqual({ low: -100, medium: 200, high: 900 })
  })

  it('is idempotent: merging the same archive twice adds nothing the second time', () => {
    const current = emptyData()
    const incoming = { ...emptyData(), months: { '2026-09': [transaction()] } }

    const first = mergeBackups(current, incoming)
    const second = mergeBackups(first.data, incoming)

    expect(second.added).toEqual({ months: 0, transactions: 0, categories: 0, recurrences: 0 })
  })

  it('tells apart two recurrences that differ only by their occurrence count', () => {
    const current = { ...emptyData(), recurrences: [recurrence({ id: 'r1', occurrences: 3 })] }
    const incoming = { ...emptyData(), recurrences: [recurrence({ id: 'r2' })] }

    expect(mergeBackups(current, incoming).added.recurrences).toBe(1)
  })

  it('drops the months an incoming archive leaves empty', () => {
    const current = emptyData()
    const incoming = { ...emptyData(), months: { '2026-09': [] } }

    const { data, added } = mergeBackups(current, incoming)

    expect(data.months).toEqual({})
    expect(added.months).toBe(0)
  })

  it('sorts the merged months chronologically', () => {
    const current = { ...emptyData(), months: { '2026-09': [transaction({ id: 'a' })] } }
    const incoming = {
      ...emptyData(),
      months: { '2026-01': [transaction({ id: 'b', date: '2026-01-01' })] },
    }

    expect(Object.keys(mergeBackups(current, incoming).data.months)).toEqual(['2026-01', '2026-09'])
  })
})
