export interface Category {
    name: string;
    /** Symbolic icon name, e.g. `emoji-food-symbolic` (see category-icons.ts). */
    icon: string;
}
/** Shown for categories we know nothing about. */
export declare const DEFAULT_CATEGORY_ICON = "folder-symbolic";
export declare const DEFAULT_CATEGORIES: readonly Category[];
/** Used when a transaction has to be filed but no category is available. */
export declare const FALLBACK_CATEGORY = "Autres";
export declare function isCategory(value: unknown): value is Category;
/** Type guard used when reading `categories.json`; an empty list is rejected too. */
export declare function isCategoryList(value: unknown): value is Category[];
/** The pre-icon format: a plain list of names. Still read, and upgraded on load. */
export declare function isLegacyCategoryList(value: unknown): value is string[];
/** Upgrades legacy names, restoring the default icon of the ones we know. */
export declare function fromLegacyCategories(names: readonly string[]): Category[];
export declare function normalizeCategoryName(name: string): string;
export declare function findCategory(categories: readonly Category[], name: string): Category | undefined;
/** The icon of a category name, or the default one when the name is unknown. */
export declare function categoryIcon(categories: readonly Category[], name: string): string;
//# sourceMappingURL=category.d.ts.map