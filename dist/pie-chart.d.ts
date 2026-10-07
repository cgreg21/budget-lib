export declare const PIE_COLORS: readonly string[];
export interface PieEntry {
    label: string;
    /** Whatever the UI draws next to the label in the legend (a glyph, an icon name…). */
    icon?: string;
    amount: number;
}
export interface PieSlice extends PieEntry {
    /** Share of the whole, between 0 and 1. */
    fraction: number;
    color: string;
}
/** Slices in the given order; entries with no positive amount are dropped. */
export declare function buildPieSlices(entries: readonly PieEntry[]): PieSlice[];
//# sourceMappingURL=pie-chart.d.ts.map