/*
 * domain/sync-merge.ts — three-way merge of the budget files.
 *
 * `base` is what the file held at the last synchronisation, `local` what this
 * device holds now and `remote` what the server holds now. An item changed on
 * one side only takes that change; an item changed on both sides keeps the
 * local version (or the remote one on a first synchronisation, when the server
 * is the reference). A deletion never beats an edit made on the other side.
 */
import type { BalanceThresholds } from './balance.js'
import type { Category } from './category.js'
import type { Recurrence } from './recurrence.js'
import type { Transaction } from './transaction.js'

/** JSON with sorted keys, so two spellings of the same object compare equal. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
  return `{${entries.join(',')}}`
}

export const sameValue = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

function resolve<T>(base: T | undefined, local: T | undefined, remote: T | undefined, preferRemote: boolean): T | undefined {
  if (sameValue(base, local)) return remote
  if (sameValue(base, remote)) return local
  if (sameValue(local, remote)) return local
  if (local === undefined) return remote
  if (remote === undefined) return local
  return preferRemote ? remote : local
}

/** Merges lists of items identified by a key; the order of the remote list is kept, new local items follow. */
export function mergeKeyed<T>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  keyOf: (item: T) => string,
  preferRemote: boolean,
): T[] {
  const index = (list: readonly T[]): Map<string, T> => new Map(list.map((item) => [keyOf(item), item]))
  const [b, l, r] = [index(base), index(local), index(remote)]
  const keys = new Set([...r.keys(), ...l.keys()])

  const merged: T[] = []
  for (const key of keys) {
    const item = resolve(b.get(key), l.get(key), r.get(key), preferRemote)
    if (item !== undefined) merged.push(item)
  }
  return merged
}

/** Occurrences of one recurrence generated on two devices keep a single copy (the smallest id, on every device). */
function dropDuplicateOccurrences(list: readonly Transaction[]): Transaction[] {
  const kept = new Map<string, Transaction>()
  for (const transaction of list) {
    const id = transaction.recurrenceId
    if (id === undefined) continue

    const current = kept.get(id)
    if (current === undefined || transaction.id < current.id) kept.set(id, transaction)
  }
  return list.filter((t) => t.recurrenceId === undefined || kept.get(t.recurrenceId) === t)
}

/** Date descending, then id: the same list always gets the same order, whichever device wrote it. */
export function orderTransactions(list: readonly Transaction[]): Transaction[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function mergeMonth(
  base: readonly Transaction[],
  local: readonly Transaction[],
  remote: readonly Transaction[],
  preferRemote: boolean,
): Transaction[] {
  const merged = mergeKeyed(base, local, remote, (t) => t.id, preferRemote)
  return orderTransactions(dropDuplicateOccurrences(merged))
}

export const mergeCategories = (
  base: readonly Category[],
  local: readonly Category[],
  remote: readonly Category[],
  preferRemote: boolean,
): Category[] => mergeKeyed(base, local, remote, (c) => c.name, preferRemote)

export const mergeRecurrences = (
  base: readonly Recurrence[],
  local: readonly Recurrence[],
  remote: readonly Recurrence[],
  preferRemote: boolean,
): Recurrence[] => mergeKeyed(base, local, remote, (r) => r.id, preferRemote)

export function mergeThresholds(
  base: BalanceThresholds | undefined,
  local: BalanceThresholds,
  remote: BalanceThresholds,
  preferRemote: boolean,
): BalanceThresholds {
  return resolve(base, local, remote, preferRemote) ?? local
}
