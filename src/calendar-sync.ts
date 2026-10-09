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
import { CalDavClient, CalendarError, type RemoteEvent } from './caldav.js'
import type { Transaction } from './transaction.js'

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
}

export function transactionHash(t: Transaction): string {
  return JSON.stringify([t.id, t.date, t.description, t.category, t.kind, t.amount, t.recurrenceId ?? ''])
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

/** One synchronisation run. Network failures propagate; per-event conflicts are skipped. */
export async function syncCalendar(client: CalDavClient, local: readonly Transaction[], baseline: SyncBaseline): Promise<SyncOutcome> {
  const plan = planSync(baseline, local, await client.list())
  const next: SyncBaseline = { ...baseline, ...plan.settled }
  for (const id of plan.dropped) delete next[id]

  const outcome: SyncOutcome = { upsertLocal: [], removeLocal: [], baseline: next, uploaded: 0, downloaded: 0, deleted: 0, skipped: 0 }

  const attempt = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation()
    } catch (error) {
      if (error instanceof CalendarError && (error.kind === 'conflict' || error.kind === 'not-found')) outcome.skipped += 1
      else throw error
    }
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
  return outcome
}
