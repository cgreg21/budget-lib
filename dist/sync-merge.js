/** JSON with sorted keys, so two spellings of the same object compare equal. */
export function canonical(value) {
    if (value === undefined)
        return 'undefined';
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(',')}}`;
}
export const sameValue = (a, b) => canonical(a) === canonical(b);
function resolve(base, local, remote, preferRemote) {
    if (sameValue(base, local))
        return remote;
    if (sameValue(base, remote))
        return local;
    if (sameValue(local, remote))
        return local;
    if (local === undefined)
        return remote;
    if (remote === undefined)
        return local;
    return preferRemote ? remote : local;
}
/** Merges lists of items identified by a key; the order of the remote list is kept, new local items follow. */
export function mergeKeyed(base, local, remote, keyOf, preferRemote) {
    const index = (list) => new Map(list.map((item) => [keyOf(item), item]));
    const [b, l, r] = [index(base), index(local), index(remote)];
    const keys = new Set([...r.keys(), ...l.keys()]);
    const merged = [];
    for (const key of keys) {
        const item = resolve(b.get(key), l.get(key), r.get(key), preferRemote);
        if (item !== undefined)
            merged.push(item);
    }
    return merged;
}
/** Occurrences of one recurrence generated on two devices keep a single copy (the smallest id, on every device). */
function dropDuplicateOccurrences(list) {
    const kept = new Map();
    for (const transaction of list) {
        const id = transaction.recurrenceId;
        if (id === undefined)
            continue;
        const current = kept.get(id);
        if (current === undefined || transaction.id < current.id)
            kept.set(id, transaction);
    }
    return list.filter((t) => t.recurrenceId === undefined || kept.get(t.recurrenceId) === t);
}
/** Date descending, then id: the same list always gets the same order, whichever device wrote it. */
export function orderTransactions(list) {
    return [...list].sort((a, b) => {
        if (a.date !== b.date)
            return a.date < b.date ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
export function mergeMonth(base, local, remote, preferRemote) {
    const merged = mergeKeyed(base, local, remote, (t) => t.id, preferRemote);
    return orderTransactions(dropDuplicateOccurrences(merged));
}
export const mergeCategories = (base, local, remote, preferRemote) => mergeKeyed(base, local, remote, (c) => c.name, preferRemote);
export const mergeRecurrences = (base, local, remote, preferRemote) => mergeKeyed(base, local, remote, (r) => r.id, preferRemote);
export function mergeThresholds(base, local, remote, preferRemote) {
    return resolve(base, local, remote, preferRemote) ?? local;
}
//# sourceMappingURL=sync-merge.js.map