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
import { CalendarError } from './caldav.js';
export function transactionHash(t) {
    return JSON.stringify([t.id, t.date, t.description, t.category, t.kind, t.amount, t.recurrenceId ?? '']);
}
/** Pure decision: which operations bring both sides in line. */
export function planSync(baseline, local, remote) {
    const plan = { upload: [], download: [], deleteRemote: [], deleteLocal: [], settled: {}, dropped: [] };
    const locals = new Map(local.map((t) => [t.id, t]));
    const remotes = new Map();
    for (const event of remote) {
        if (event.transaction !== null)
            remotes.set(event.transaction.id, { transaction: event.transaction, href: event.href, etag: event.etag });
    }
    for (const id of new Set([...locals.keys(), ...remotes.keys(), ...Object.keys(baseline)])) {
        const l = locals.get(id);
        const r = remotes.get(id);
        const base = baseline[id];
        if (l !== undefined && r !== undefined) {
            const lHash = transactionHash(l);
            const rHash = transactionHash(r.transaction);
            if (lHash === rHash) {
                plan.settled[id] = { href: r.href, etag: r.etag, hash: lHash };
                continue;
            }
            const localChanged = base === undefined || base.hash !== lHash;
            const remoteChanged = base === undefined || base.hash !== rHash;
            if (localChanged && !remoteChanged)
                plan.upload.push({ transaction: l, href: r.href, etag: r.etag });
            else
                plan.download.push({ transaction: r.transaction, href: r.href, etag: r.etag });
        }
        else if (l !== undefined) {
            if (base === undefined || transactionHash(l) !== base.hash)
                plan.upload.push({ transaction: l });
            else
                plan.deleteLocal.push(id);
        }
        else if (r !== undefined) {
            if (base === undefined || transactionHash(r.transaction) !== base.hash)
                plan.download.push({ transaction: r.transaction, href: r.href, etag: r.etag });
            else
                plan.deleteRemote.push({ id, href: r.href, etag: r.etag });
        }
        else {
            plan.dropped.push(id);
        }
    }
    return plan;
}
/** One synchronisation run. Network failures propagate; per-event conflicts are skipped. */
export async function syncCalendar(client, local, baseline) {
    const plan = planSync(baseline, local, await client.list());
    const next = { ...baseline, ...plan.settled };
    for (const id of plan.dropped)
        delete next[id];
    const outcome = { upsertLocal: [], removeLocal: [], baseline: next, uploaded: 0, downloaded: 0, deleted: 0, skipped: 0 };
    const attempt = async (operation) => {
        try {
            await operation();
        }
        catch (error) {
            if (error instanceof CalendarError && (error.kind === 'conflict' || error.kind === 'not-found'))
                outcome.skipped += 1;
            else
                throw error;
        }
    };
    for (const item of plan.upload) {
        await attempt(async () => {
            const saved = await client.put(item.transaction, item.etag, item.href);
            next[item.transaction.id] = { href: saved.href, etag: saved.etag, hash: transactionHash(item.transaction) };
            outcome.uploaded += 1;
        });
    }
    for (const item of plan.download) {
        outcome.upsertLocal.push(item.transaction);
        next[item.transaction.id] = { href: item.href, etag: item.etag, hash: transactionHash(item.transaction) };
        outcome.downloaded += 1;
    }
    for (const item of plan.deleteRemote) {
        await attempt(async () => {
            await client.remove(item.href, item.etag);
            delete next[item.id];
            outcome.deleted += 1;
        });
    }
    for (const id of plan.deleteLocal) {
        outcome.removeLocal.push(id);
        delete next[id];
        outcome.deleted += 1;
    }
    return outcome;
}
//# sourceMappingURL=calendar-sync.js.map