/*
 * domain/category.ts — a category is a name plus the symbolic icon shown next
 * to it; this module owns the defaults and the few rules that apply to them
 * (validation, trimming, icon lookup).
 *
 * Transactions reference a category by name, so the icon is resolved from the
 * list at display time: changing an icon never rewrites the months on disk.
 */

export interface Category {
  name: string
  /** Symbolic icon name, e.g. `emoji-food-symbolic` (see category-icons.ts). */
  icon: string
}

/** Shown for categories we know nothing about. */
export const DEFAULT_CATEGORY_ICON = 'folder-symbolic'

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { name: 'Alimentation', icon: 'emoji-food-symbolic' },
  { name: 'Logement', icon: 'user-home-symbolic' },
  { name: 'Transport', icon: 'emoji-travel-symbolic' },
  { name: 'Loisirs', icon: 'emoji-activities-symbolic' },
  { name: 'Santé', icon: 'emote-love-symbolic' },
  { name: 'Salaire', icon: 'value-increase-symbolic' },
  { name: 'Abonnements', icon: 'web-browser-symbolic' },
  { name: 'Autres', icon: DEFAULT_CATEGORY_ICON },
]

/** Used when a transaction has to be filed but no category is available. */
export const FALLBACK_CATEGORY = 'Autres'

export function isCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) return false
  const { name, icon } = value as Partial<Category>
  return typeof name === 'string' && name !== '' && typeof icon === 'string' && icon !== ''
}

/** Type guard used when reading `categories.json`; an empty list is rejected too. */
export function isCategoryList(value: unknown): value is Category[] {
  return Array.isArray(value) && value.length > 0 && value.every(isCategory)
}

/** The pre-icon format: a plain list of names. Still read, and upgraded on load. */
export function isLegacyCategoryList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
}

/** Upgrades legacy names, restoring the default icon of the ones we know. */
export function fromLegacyCategories(names: readonly string[]): Category[] {
  return names.map((name) => ({
    name,
    icon: findCategory(DEFAULT_CATEGORIES, name)?.icon ?? DEFAULT_CATEGORY_ICON,
  }))
}

export function normalizeCategoryName(name: string): string {
  return name.trim()
}

export function findCategory(categories: readonly Category[], name: string): Category | undefined {
  return categories.find((category) => category.name === name)
}

/** The icon of a category name, or the default one when the name is unknown. */
export function categoryIcon(categories: readonly Category[], name: string): string {
  return findCategory(categories, name)?.icon ?? DEFAULT_CATEGORY_ICON
}
