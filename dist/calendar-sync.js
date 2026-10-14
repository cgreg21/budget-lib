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
import { DEFAULT_CATEGORIES, categoryIcon, findCategory } from './category.js';
/** Key under which `baseline` remembers the category event; no transaction id looks like it. */
export const CATEGORIES_BASELINE_KEY = '@categories';
export function transactionHash(t) {
    return JSON.stringify([t.id, t.date, t.description, t.category, t.kind, t.amount, t.recurrenceId ?? '']);
}
export function categoriesHash(categories) {
    return JSON.stringify(categories.map((category) => [category.name, category.icon]));
}
/** `categories` followed by the names in `names` that it lacks, with the default icon of each. */
export function ensureCategories(categories, names) {
    const result = [...categories];
    const known = new Set(result.map((category) => category.name));
    for (const name of names) {
        if (name === '' || known.has(name))
            continue;
        known.add(name);
        result.push({ name, icon: categoryIcon(DEFAULT_CATEGORIES, name) });
    }
    return result;
}
/** The remote list, then the local categories it lacks: the calendar wins on order and icons. */
export function mergeCategories(remote, local) {
    return ensureCategories(remote, local.map((category) => category.name)).map((category) => (findCategory(remote, category.name) ?? findCategory(local, category.name) ?? category));
}
/**
 * Pure decision for the category list, on the same three-way rule as the
 * transactions; `used` are the category names the transactions refer to, so a
 * category is never missing from the list. Both sides changed → the lists are merged.
 */
export function planCategories(base, local, remote, used) {
    let list = [...local];
    if (remote !== undefined) {
        const lHash = categoriesHash(local);
        const rHash = categoriesHash(remote);
        if (lHash !== rHash) {
            const localChanged = base === undefined || base.hash !== lHash;
            const remoteChanged = base === undefined || base.hash !== rHash;
            if (remoteChanged && localChanged)
                list = mergeCategories(remote, local);
            else if (remoteChanged)
                list = [...remote];
        }
    }
    list = ensureCategories(list, used);
    const upload = list.length > 0 && (remote === undefined || categoriesHash(list) !== categoriesHash(remote));
    return { list, upload };
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
        if (id === CATEGORIES_BASELINE_KEY)
            continue;
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
/**
 * One synchronisation run. Network failures propagate; per-event conflicts are skipped.
 * Pass the local `categories` to synchronise the category list too: the result is
 * in `outcome.categories` (null when the local list is already right).
 */
export async function syncCalendar(client, local, baseline, categories) {
    const remote = await client.list();
    const plan = planSync(baseline, local, remote);
    const next = { ...baseline, ...plan.settled };
    for (const id of plan.dropped)
        delete next[id];
    const outcome = { upsertLocal: [], removeLocal: [], baseline: next, uploaded: 0, downloaded: 0, deleted: 0, skipped: 0, categories: null };
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
    if (categories !== undefined)
        await syncCategoryList(client, categories, remote, outcome, local);
    return outcome;
}
async function syncCategoryList(client, categories, remote, outcome, local) {
    const event = remote.find((candidate) => candidate.categories != null);
    const removed = new Set(outcome.removeLocal);
    const finalTransactions = new Map(local.filter((t) => !removed.has(t.id)).map((t) => [t.id, t]));
    for (const t of outcome.upsertLocal)
        finalTransactions.set(t.id, t);
    const used = [...finalTransactions.values()].map((t) => t.category);
    const { list, upload } = planCategories(outcome.baseline[CATEGORIES_BASELINE_KEY], categories, event?.categories ?? undefined, used);
    if (categoriesHash(list) !== categoriesHash(categories))
        outcome.categories = list;
    const hash = categoriesHash(list);
    if (!upload) {
        if (event !== undefined)
            outcome.baseline[CATEGORIES_BASELINE_KEY] = { href: event.href, etag: event.etag, hash };
        return;
    }
    try {
        const saved = await client.putCategories(list, event?.etag, event?.href);
        outcome.baseline[CATEGORIES_BASELINE_KEY] = { href: saved.href, etag: saved.etag, hash };
        outcome.uploaded += 1;
    }
    catch (error) {
        // A read-only or concurrently changed calendar must not undo the transactions just synchronised.
        if (error instanceof CalendarError)
            outcome.skipped += 1;
        else
            throw error;
    }
}
//# sourceMappingURL=calendar-sync.js.map