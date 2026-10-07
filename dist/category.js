/*
 * domain/category.ts — a category is a name plus the symbolic icon shown next
 * to it; this module owns the defaults and the few rules that apply to them
 * (validation, trimming, icon lookup).
 *
 * Transactions reference a category by name, so the icon is resolved from the
 * list at display time: changing an icon never rewrites the months on disk.
 */
/** Shown for categories we know nothing about. */
export const DEFAULT_CATEGORY_ICON = 'folder-symbolic';
export const DEFAULT_CATEGORIES = [
    { name: 'Alimentation', icon: 'emoji-food-symbolic' },
    { name: 'Logement', icon: 'user-home-symbolic' },
    { name: 'Transport', icon: 'emoji-travel-symbolic' },
    { name: 'Loisirs', icon: 'emoji-activities-symbolic' },
    { name: 'Santé', icon: 'emote-love-symbolic' },
    { name: 'Salaire', icon: 'value-increase-symbolic' },
    { name: 'Abonnements', icon: 'web-browser-symbolic' },
    { name: 'Autres', icon: DEFAULT_CATEGORY_ICON },
];
/** Used when a transaction has to be filed but no category is available. */
export const FALLBACK_CATEGORY = 'Autres';
export function isCategory(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const { name, icon } = value;
    return typeof name === 'string' && name !== '' && typeof icon === 'string' && icon !== '';
}
/** Type guard used when reading `categories.json`; an empty list is rejected too. */
export function isCategoryList(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isCategory);
}
/** The pre-icon format: a plain list of names. Still read, and upgraded on load. */
export function isLegacyCategoryList(value) {
    return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
}
/** Upgrades legacy names, restoring the default icon of the ones we know. */
export function fromLegacyCategories(names) {
    return names.map((name) => ({
        name,
        icon: findCategory(DEFAULT_CATEGORIES, name)?.icon ?? DEFAULT_CATEGORY_ICON,
    }));
}
export function normalizeCategoryName(name) {
    return name.trim();
}
export function findCategory(categories, name) {
    return categories.find((category) => category.name === name);
}
/** The icon of a category name, or the default one when the name is unknown. */
export function categoryIcon(categories, name) {
    return findCategory(categories, name)?.icon ?? DEFAULT_CATEGORY_ICON;
}
//# sourceMappingURL=category.js.map