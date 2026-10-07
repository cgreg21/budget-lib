/*
 * domain/pie-chart.ts — turns per-category totals into pie slices:
 * the share of each category and the color it is drawn with.
 */
export const PIE_COLORS = [
    '#00E5A0', '#4F8EF7', '#F7C948', '#FF6B6B', '#A78BFA',
    '#38BDF8', '#FB923C', '#F472B6', '#34D399', '#94A3B8',
];
/** Slices in the given order; entries with no positive amount are dropped. */
export function buildPieSlices(entries) {
    const kept = entries.filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);
    const total = kept.reduce((sum, entry) => sum + entry.amount, 0);
    if (total === 0)
        return [];
    return kept.map((entry, index) => ({
        label: entry.label,
        icon: entry.icon,
        amount: entry.amount,
        fraction: entry.amount / total,
        color: PIE_COLORS[index % PIE_COLORS.length],
    }));
}
//# sourceMappingURL=pie-chart.js.map