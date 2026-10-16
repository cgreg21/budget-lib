/*
 * calendar-sync.ts — keeps the local transactions and the online calendar equal.
 *
 * `baseline` is what both sides held at the end of the previous run, per
 * transaction. Comparing each side to it tells who changed what:
 *   - only this device changed it        → upload
 *   - only the calendar changed it       → download
 *   - both changed it                    → the calendar wins
 *   - one side deleted it, other did not → the deletion is propagated
 * The application applies `upsertLocal` / `removeLocal` to its own storage and
 * keeps `baseline` for the next run.
 */
import { recurrenceEventId } from './calendar-ics.js'
import { CalDavClient, CalendarError, type RemoteEvent } from './caldav.js'
import { DEFAULT_CATEGORIES, categoryIcon, findCategory, type Category } from './category.js'
import type { Recurrence } from './recurrence.js'
import type { Transaction, TrashedTransaction } from './transaction.js'

export interface BaselineEntry {
  /** Address of the event on the server. */
  href: string
  etag?: string
  /** `transactionHash` of the transaction as last synchronised. */
  hash: string
}

export type SyncBaseline = Record<string, BaselineEntry>

export interface SyncOutcome {
  upsertLocal: Transaction[]
  removeLocal: string[]
  baseline: SyncBaseline
  uploaded: number
  downloaded: number
  deleted: number
  /** Operations the server refused because the event changed meanwhile; the next run retries them. */
  skipped: number
  /** The category list to store locally, or `null` when it stays as it is (or was not given to the run). */
  categories: Category[] | null
  /** Transactions trashed from the calendar side, to add to the local trash (when a trash was given to the run). */
  trashAdded: TrashedTransaction[]
  /** Ids of the local trash entries restored or emptied from the calendar side. */
  trashRemoved: string[]
}

/** Key prefix under which `baseline` remembers a trashed event; no transaction id looks like it. */
export const TRASH_BASELINE_PREFIX = '@trash:'

export function trashHash(t: TrashedTransaction): string {
  return JSON.stringify([transactionHash(t), t.deletedAt])
}

const eventIdOf = (event: RemoteEvent): string | undefined => event.transaction?.id ?? event.trashed?.id

/**
 * Brings the trash in line: a trashed transaction stays on the calendar as the same event, marked
 * cancelled. Returns the remote list as it stands once done, plus calendar-side trash entries that
 * wait for the transaction run to confirm the live copy is gone here too.
 */
async function syncTrash(
  client: CalDavClient,
  local: readonly Transaction[],
  trash: readonly TrashedTransaction[],
  fetched: readonly RemoteEvent[],
  outcome: SyncOutcome,
  attempt: (operation: () => Promise<void>) => Promise<void>,
): Promise<{ remote: RemoteEvent[]; pending: RemoteEvent[] }> {
  const next = outcome.baseline
  const view = [...fetched]
  const pending: RemoteEvent[] = []
  const trashIds = new Set(trash.map((t) => t.id))
  const liveIds = new Set(local.map((t) => t.id))

  for (const item of trash) {
    const key = TRASH_BASELINE_PREFIX + item.id
    const index = view.findIndex((event) => eventIdOf(event) === item.id)
    const event = index >= 0 ? view[index] : undefined
    if (event?.trashed != null) {
      next[key] = { href: event.href, etag: event.etag, hash: trashHash(item) }
      delete next[item.id]
      continue
    }
    if (next[key] !== undefined) {
      // It was in the trash on both sides: the calendar now holds it live (restored) or no more (emptied).
      outcome.trashRemoved.push(item.id)
      delete next[key]
      continue
    }
    await attempt(async () => {
      const saved = await client.putTrashed(item, event?.etag, event?.href)
      next[key] = { href: saved.href, etag: saved.etag, hash: trashHash(item) }
      delete next[item.id]
      const updated: RemoteEvent = { href: saved.href, etag: saved.etag, transaction: null, trashed: item }
      if (index >= 0) view[index] = updated
      else view.push(updated)
      outcome.uploaded += 1
    })
  }

  for (const event of [...view]) {
    const item = event.trashed
    if (item == null || trashIds.has(item.id)) continue
    const key = TRASH_BASELINE_PREFIX + item.id
    if (next[key] === undefined) {
      if (liveIds.has(item.id)) pending.push(event)
      else {
        outcome.trashAdded.push(item)
        next[key] = { href: event.href, etag: event.etag, hash: trashHash(item) }
      }
      continue
    }
    // Known as trashed, gone from the local trash: restored here, or emptied here.
    const restored = local.find((t) => t.id === item.id)
    await attempt(async () => {
      if (restored !== undefined) {
        const saved = await client.put(restored, event.etag, event.href)
        next[restored.id] = { href: saved.href, etag: saved.etag, hash: transactionHash(restored) }
        view[view.indexOf(event)] = { href: saved.href, etag: saved.etag, transaction: restored }
        outcome.uploaded += 1
      } else {
        await client.remove(event.href, event.etag)
        view.splice(view.indexOf(event), 1)
        outcome.deleted += 1
      }
      delete next[key]
    })
  }
  return { remote: view, pending }
}

/** Key under which `baseline` remembers the category event; no transaction id looks like it. */
export const CATEGORIES_BASELINE_KEY = '@categories'

export function transactionHash(t: Transaction): string {
  return JSON.stringify([t.id, t.date, t.description, t.category, t.kind, t.amount, t.recurrenceId ?? ''])
}

export function categoriesHash(categories: readonly Category[]): string {
  return JSON.stringify(categories.map((category) => [category.name, category.icon]))
}

/** `categories` followed by the names in `names` that it lacks, with the default icon of each. */
export function ensureCategories(categories: readonly Category[], names: Iterable<string>): Category[] {
  const result = [...categories]
  const known = new Set(result.map((category) => category.name))
  for (const name of names) {
    if (name === '' || known.has(name)) continue
    known.add(name)
    result.push({ name, icon: categoryIcon(DEFAULT_CATEGORIES, name) })
  }
  return result
}

/** The remote list, then the local categories it lacks: the calendar wins on order and icons. */
export function mergeCategories(remote: readonly Category[], local: readonly Category[]): Category[] {
  return ensureCategories(remote, local.map((category) => category.name)).map((category) => (
    findCategory(remote, category.name) ?? findCategory(local, category.name) ?? category
  ))
}

export interface CategoriesPlan {
  /** The list both sides should end up with. */
  list: Category[]
  /** Whether the calendar must be updated to hold it. */
  upload: boolean
}

/**
 * Pure decision for the category list, on the same three-way rule as the
 * transactions; `used` are the category names the transactions refer to, so a
 * category is never missing from the list. Both sides changed → the lists are merged.
 */
export function planCategories(
  base: BaselineEntry | undefined,
  local: readonly Category[],
  remote: readonly Category[] | undefined,
  used: Iterable<string>,
): CategoriesPlan {
  let list: Category[] = [...local]
  if (remote !== undefined) {
    const lHash = categoriesHash(local)
    const rHash = categoriesHash(remote)
    if (lHash !== rHash) {
      const localChanged = base === undefined || base.hash !== lHash
      const remoteChanged = base === undefined || base.hash !== rHash
      if (remoteChanged && localChanged) list = mergeCategories(remote, local)
      else if (remoteChanged) list = [...remote]
    }
  }
  list = ensureCategories(list, used)
  const upload = list.length > 0 && (remote === undefined || categoriesHash(list) !== categoriesHash(remote))
  return { list, upload }
}

export interface SyncPlan {
  upload: { transaction: Transaction; href?: string; etag?: string }[]
  download: { transaction: Transaction; href: string; etag?: string }[]
  deleteRemote: { id: string; href: string; etag?: string }[]
  deleteLocal: string[]
  /** Entries that need no operation but whose etag/href must be refreshed. */
  settled: Record<string, BaselineEntry>
  /** Entries to forget. */
  dropped: string[]
}

/** Pure decision: which operations bring both sides in line. */
export function planSync(baseline: SyncBaseline, local: readonly Transaction[], remote: readonly RemoteEvent[]): SyncPlan {
  const plan: SyncPlan = { upload: [], download: [], deleteRemote: [], deleteLocal: [], settled: {}, dropped: [] }
  const locals = new Map(local.map((t) => [t.id, t]))
  const remotes = new Map<string, { transaction: Transaction; href: string; etag?: string }>()
  for (const event of remote) {
    if (event.transaction !== null) remotes.set(event.transaction.id, { transaction: event.transaction, href: event.href, etag: event.etag })
  }

  for (const id of new Set([...locals.keys(), ...remotes.keys(), ...Object.keys(baseline)])) {
    if (id.startsWith('@')) continue
    const l = locals.get(id)
    const r = remotes.get(id)
    const base = baseline[id]

    if (l !== undefined && r !== undefined) {
      const lHash = transactionHash(l)
      const rHash = transactionHash(r.transaction)
      if (lHash === rHash) {
        plan.settled[id] = { href: r.href, etag: r.etag, hash: lHash }
        continue
      }
      const localChanged = base === undefined || base.hash !== lHash
      const remoteChanged = base === undefined || base.hash !== rHash
      if (localChanged && !remoteChanged) plan.upload.push({ transaction: l, href: r.href, etag: r.etag })
      else plan.download.push({ transaction: r.transaction, href: r.href, etag: r.etag })
    } else if (l !== undefined) {
      if (base === undefined || transactionHash(l) !== base.hash) plan.upload.push({ transaction: l })
      else plan.deleteLocal.push(id)
    } else if (r !== undefined) {
      if (base === undefined || transactionHash(r.transaction) !== base.hash) plan.download.push({ transaction: r.transaction, href: r.href, etag: r.etag })
      else plan.deleteRemote.push({ id, href: r.href, etag: r.etag })
    } else {
      plan.dropped.push(id)
    }
  }
  return plan
}

/**
 * One synchronisation run. Network failures propagate; per-event conflicts are skipped.
 * Pass the local `categories` to synchronise the category list too: the result is
 * in `outcome.categories` (null when the local list is already right).
 */
export async function syncCalendar(
  client: CalDavClient,
  local: readonly Transaction[],
  baseline: SyncBaseline,
  categories?: readonly Category[],
  recurrences?: readonly Recurrence[],
  trash?: readonly TrashedTransaction[],
): Promise<SyncOutcome> {
  const fetched = await client.list()
  const next: SyncBaseline = { ...baseline }
  const outcome: SyncOutcome = {
    upsertLocal: [], removeLocal: [], baseline: next, uploaded: 0, downloaded: 0, deleted: 0, skipped: 0,
    categories: null, trashAdded: [], trashRemoved: [],
  }

  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation()
    } catch (error) {
      if (error instanceof CalendarError && (error.kind === 'conflict' || error.kind === 'not-found')) outcome.skipped += 1
      else throw error
    }
  }

  let remote: readonly RemoteEvent[] = fetched
  let pendingTrash: RemoteEvent[] = []
  if (trash !== undefined) ({ remote, pending: pendingTrash } = await syncTrash(client, local, trash, fetched, outcome, attempt))
  const plan = planSync(next, local, remote)
  Object.assign(next, plan.settled)
  for (const id of plan.dropped) delete next[id]
  // A trashed event of the calendar whose live copy is deleted here too is a new trash entry.
  for (const event of pendingTrash) {
    const item = event.trashed as TrashedTransaction
    if (!plan.deleteLocal.includes(item.id)) continue
    outcome.trashAdded.push(item)
    next[TRASH_BASELINE_PREFIX + item.id] = { href: event.href, etag: event.etag, hash: trashHash(item) }
  }

  for (const item of plan.upload) {
    await attempt(async () => {
      const saved = await client.put(item.transaction, item.etag, item.href)
      next[item.transaction.id] = { href: saved.href, etag: saved.etag, hash: transactionHash(item.transaction) }
      outcome.uploaded += 1
    })
  }
  for (const item of plan.download) {
    outcome.upsertLocal.push(item.transaction)
    next[item.transaction.id] = { href: item.href, etag: item.etag, hash: transactionHash(item.transaction) }
    outcome.downloaded += 1
  }
  for (const item of plan.deleteRemote) {
    await attempt(async () => {
      await client.remove(item.href, item.etag)
      delete next[item.id]
      outcome.deleted += 1
    })
  }
  for (const id of plan.deleteLocal) {
    outcome.removeLocal.push(id)
    delete next[id]
    outcome.deleted += 1
  }
  if (categories !== undefined) await syncCategoryList(client, categories, remote, outcome, local)
  if (recurrences !== undefined) await syncRecurrenceEvents(client, recurrences, remote, outcome)
  return outcome
}

/** Key under which `baseline` remembers the recurring event of a series. */
export const RECURRENCE_BASELINE_PREFIX = '@recurrence:'

export function recurrenceHash(r: Recurrence): string {
  return JSON.stringify([r.id, r.description, r.category, r.kind, r.amount, r.day, r.frequency, r.startMonth, r.occurrences ?? '', ...(r.interval !== undefined || r.until !== undefined || r.activeMonths !== undefined || r.installments !== undefined ? [r.interval ?? '', r.until ?? ''] : []), ...(r.activeMonths !== undefined || r.installments !== undefined ? [r.activeMonths ?? ''] : []), ...(r.installments !== undefined ? [r.installments] : [])])
}

/** Publishes each series as a recurring event and removes the ones of deleted series; one way, local to calendar. */
async function syncRecurrenceEvents(
  client: CalDavClient,
  recurrences: readonly Recurrence[],
  remote: readonly RemoteEvent[],
  outcome: SyncOutcome,
): Promise<void> {
  const next = outcome.baseline
  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation()
    } catch (error) {
      if (error instanceof CalendarError) outcome.skipped += 1
      else throw error
    }
  }
  const live = new Set<string>()
  for (const recurrence of recurrences) {
    const key = RECURRENCE_BASELINE_PREFIX + recurrence.id
    live.add(key)
    const hash = recurrenceHash(recurrence)
    const base = next[key]
    if (base?.hash === hash) continue
    const suffix = `/${encodeURIComponent(recurrenceEventId(recurrence.id))}.ics`
    const existing = base ?? remote.find((event) => event.href.endsWith(suffix))
    await attempt(async () => {
      const saved = await client.putRecurrence(recurrence, existing?.etag, existing?.href)
      next[key] = { href: saved.href, etag: saved.etag, hash }
      outcome.uploaded += 1
    })
  }
  for (const key of Object.keys(next)) {
    if (!key.startsWith(RECURRENCE_BASELINE_PREFIX) || live.has(key)) continue
    await attempt(async () => {
      await client.remove(next[key].href, next[key].etag)
      delete next[key]
      outcome.deleted += 1
    })
  }
}

async function syncCategoryList(
  client: CalDavClient,
  categories: readonly Category[],
  remote: readonly RemoteEvent[],
  outcome: SyncOutcome,
  local: readonly Transaction[],
): Promise<void> {
  const event = remote.find((candidate) => candidate.categories != null)
  const removed = new Set(outcome.removeLocal)
  const finalTransactions = new Map(local.filter((t) => !removed.has(t.id)).map((t) => [t.id, t]))
  for (const t of outcome.upsertLocal) finalTransactions.set(t.id, t)

  const used = [...finalTransactions.values()].map((t) => t.category)
  const { list, upload } = planCategories(outcome.baseline[CATEGORIES_BASELINE_KEY], categories, event?.categories ?? undefined, used)
  if (categoriesHash(list) !== categoriesHash(categories)) outcome.categories = list

  const hash = categoriesHash(list)
  if (!upload) {
    if (event !== undefined) outcome.baseline[CATEGORIES_BASELINE_KEY] = { href: event.href, etag: event.etag, hash }
    return
  }
  try {
    const saved = await client.putCategories(list, event?.etag, event?.href)
    outcome.baseline[CATEGORIES_BASELINE_KEY] = { href: saved.href, etag: saved.etag, hash }
    outcome.uploaded += 1
  } catch (error) {
    // A read-only or concurrently changed calendar must not undo the transactions just synchronised.
    if (error instanceof CalendarError) outcome.skipped += 1
    else throw error
  }
}
