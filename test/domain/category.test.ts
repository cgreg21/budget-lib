import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_ICON,
  FALLBACK_CATEGORY,
  categoryIcon,
  findCategory,
  fromLegacyCategories,
  isCategory,
  isCategoryList,
  isLegacyCategoryList,
  normalizeCategoryName,
} from '../../src/domain/category.js'

describe('isCategory', () => {
  it('accepts a well-formed category', () => {
    expect(isCategory({ name: 'Loisirs', icon: 'emoji-activities-symbolic' })).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isCategory(null)).toBe(false)
    expect(isCategory('Loisirs')).toBe(false)
  })

  it('rejects an empty name or icon', () => {
    expect(isCategory({ name: '', icon: 'folder-symbolic' })).toBe(false)
    expect(isCategory({ name: 'Loisirs', icon: '' })).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(isCategory({ name: 'Loisirs' })).toBe(false)
  })
})

describe('isCategoryList', () => {
  it('accepts the defaults', () => {
    expect(isCategoryList(DEFAULT_CATEGORIES)).toBe(true)
  })

  it('rejects an empty array', () => {
    expect(isCategoryList([])).toBe(false)
  })

  it('rejects an array with an invalid entry', () => {
    expect(isCategoryList([{ name: 'Loisirs', icon: 'x' }, { name: '' }])).toBe(false)
  })
})

describe('isLegacyCategoryList', () => {
  it('accepts a list of plain names', () => {
    expect(isLegacyCategoryList(['Loisirs', 'Transport'])).toBe(true)
  })

  it('rejects an empty list', () => {
    expect(isLegacyCategoryList([])).toBe(false)
  })

  it('rejects a list containing non-strings', () => {
    expect(isLegacyCategoryList(['Loisirs', 42])).toBe(false)
  })
})

describe('fromLegacyCategories', () => {
  it('restores the icon of known categories', () => {
    expect(fromLegacyCategories(['Transport'])).toEqual([
      { name: 'Transport', icon: 'emoji-travel-symbolic' },
    ])
  })

  it('falls back to the default icon for unknown categories', () => {
    expect(fromLegacyCategories(['Divers'])).toEqual([
      { name: 'Divers', icon: DEFAULT_CATEGORY_ICON },
    ])
  })
})

describe('normalizeCategoryName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCategoryName('  Loisirs  ')).toBe('Loisirs')
  })
})

describe('findCategory', () => {
  it('finds a category by name', () => {
    expect(findCategory(DEFAULT_CATEGORIES, 'Transport')?.icon).toBe('emoji-travel-symbolic')
  })

  it('returns undefined for an unknown name', () => {
    expect(findCategory(DEFAULT_CATEGORIES, 'Inconnu')).toBeUndefined()
  })
})

describe('categoryIcon', () => {
  it('returns the icon of a known category', () => {
    expect(categoryIcon(DEFAULT_CATEGORIES, 'Salaire')).toBe('value-increase-symbolic')
  })

  it('falls back to the default icon for an unknown category', () => {
    expect(categoryIcon(DEFAULT_CATEGORIES, FALLBACK_CATEGORY + '-unknown')).toBe(DEFAULT_CATEGORY_ICON)
  })
})
