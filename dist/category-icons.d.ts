import { type Category } from './category.js';
export interface CategoryIconChoice {
    /** The value stored in the category (and in `categories.json`). */
    name: string;
    /** The emoji older versions stored for it. */
    legacyEmoji: string;
}
export declare const CATEGORY_ICON_CHOICES: readonly CategoryIconChoice[];
export declare function isKnownCategoryIcon(name: string): boolean;
/**
 * The stored form of an icon: known names stay, legacy emoji become their name,
 * other emoji fall back to the default icon, and unknown plain names (a custom
 * icon of the desktop theme) are kept so that the shared file is left untouched.
 */
export declare function normalizeCategoryIcon(icon: string): string;
export declare function normalizeCategoryIcons(list: readonly Category[]): Category[];
//# sourceMappingURL=category-icons.d.ts.map