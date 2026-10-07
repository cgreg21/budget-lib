import { describe, expect, it } from 'vitest'

import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_ICON } from '../src/category.js'
import {
  CATEGORY_ICON_CHOICES,
  isKnownCategoryIcon,
  normalizeCategoryIcon,
  normalizeCategoryIcons,
} from '../src/category-icons.js'

describe('CATEGORY_ICON_CHOICES', () => {
  it('lists each icon name and legacy emoji once', () => {
    const names = CATEGORY_ICON_CHOICES.map((choice) => choice.name)
    const emojis = CATEGORY_ICON_CHOICES.map((choice) => choice.legacyEmoji)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  it('offers the icons of the default categories', () => {
    for (const { icon } of DEFAULT_CATEGORIES) expect(isKnownCategoryIcon(icon)).toBe(true)
  })
})

describe('normalizeCategoryIcon', () => {
  it('keeps a known name', () => {
    expect(normalizeCategoryIcon('emoji-food-symbolic')).toBe('emoji-food-symbolic')
    expect(normalizeCategoryIcon('tabler:car')).toBe('tabler:car')
  })

  it('turns a legacy emoji into its name', () => {
    expect(normalizeCategoryIcon('\u{1F6D2}')).toBe('emoji-food-symbolic')
    expect(normalizeCategoryIcon('\u{1F3E0}')).toBe('user-home-symbolic')
  })

  it('ignores the emoji presentation selector', () => {
    expect(normalizeCategoryIcon('\u2708\uFE0F')).toBe('airplane-mode-symbolic')
    expect(normalizeCategoryIcon('\u2708')).toBe('airplane-mode-symbolic')
  })

  it('falls back to the default icon for an emoji it does not know', () => {
    expect(normalizeCategoryIcon('\u{1F984}')).toBe(DEFAULT_CATEGORY_ICON)
  })

  it('keeps an unknown plain name, so a custom theme icon survives', () => {
    expect(normalizeCategoryIcon('my-custom-symbolic')).toBe('my-custom-symbolic')
  })
})

describe('normalizeCategoryIcons', () => {
  it('upgrades the icon of every category and leaves the names alone', () => {
    expect(normalizeCategoryIcons([
      { name: 'Courses', icon: '\u{1F6D2}' },
      { name: 'Loyer', icon: 'user-home-symbolic' },
    ])).toEqual([
      { name: 'Courses', icon: 'emoji-food-symbolic' },
      { name: 'Loyer', icon: 'user-home-symbolic' },
    ])
  })
})
