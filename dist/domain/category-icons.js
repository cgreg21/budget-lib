/*
 * domain/category-icons.ts ? the icon of a category is stored as a symbolic
 * icon name (`emoji-food-symbolic`, `tabler:car`?), so the desktop and the
 * mobile applications share the very same `categories.json`. Each app draws a
 * name its own way: an icon of the GTK theme or a bundled SVG on the desktop,
 * a glyph of the Material Design Icons font on the phone.
 *
 * Categories saved by earlier versions hold an emoji instead; those are
 * converted to the matching name when loaded.
 */
import { DEFAULT_CATEGORY_ICON } from './category.js';
export const CATEGORY_ICON_CHOICES = [
    { name: 'emoji-food-symbolic', legacyEmoji: '\u{1F6D2}' },
    { name: 'user-home-symbolic', legacyEmoji: '\u{1F3E0}' },
    { name: 'thunderbolt-symbolic', legacyEmoji: '\u26A1' },
    { name: 'weather-showers-symbolic', legacyEmoji: '\u{1F4A7}' },
    { name: 'night-light-symbolic', legacyEmoji: '\u{1F525}' },
    { name: 'applications-engineering-symbolic', legacyEmoji: '\u{1F527}' },
    { name: 'emoji-travel-symbolic', legacyEmoji: '\u{1F697}' },
    { name: 'airplane-mode-symbolic', legacyEmoji: '\u2708' },
    { name: 'find-location-symbolic', legacyEmoji: '\u{1F4CD}' },
    { name: 'emoji-activities-symbolic', legacyEmoji: '\u{1F3AE}' },
    { name: 'applications-games-symbolic', legacyEmoji: '\u{1F579}' },
    { name: 'folder-music-symbolic', legacyEmoji: '\u{1F3B5}' },
    { name: 'audio-headphones-symbolic', legacyEmoji: '\u{1F3A7}' },
    { name: 'camera-photo-symbolic', legacyEmoji: '\u{1F4F7}' },
    { name: 'tv-symbolic', legacyEmoji: '\u{1F4FA}' },
    { name: 'media-optical-symbolic', legacyEmoji: '\u{1F4BF}' },
    { name: 'emote-love-symbolic', legacyEmoji: '\u2764' },
    { name: 'emoji-body-symbolic', legacyEmoji: '\u{1F3C3}' },
    { name: 'security-high-symbolic', legacyEmoji: '\u{1F6E1}' },
    { name: 'value-increase-symbolic', legacyEmoji: '\u{1F4B0}' },
    { name: 'value-decrease-symbolic', legacyEmoji: '\u{1F4B8}' },
    { name: 'accessories-calculator-symbolic', legacyEmoji: '\u{1F9EE}' },
    { name: 'package-x-generic-symbolic', legacyEmoji: '\u{1F4E6}' },
    { name: 'x-office-spreadsheet-symbolic', legacyEmoji: '\u{1F4CA}' },
    { name: 'x-office-document-symbolic', legacyEmoji: '\u{1F4C4}' },
    { name: 'mail-send-symbolic', legacyEmoji: '\u2709' },
    { name: 'x-office-calendar-symbolic', legacyEmoji: '\u{1F4C5}' },
    { name: 'web-browser-symbolic', legacyEmoji: '\u{1F310}' },
    { name: 'network-wireless-symbolic', legacyEmoji: '\u{1F4F6}' },
    { name: 'phone-symbolic', legacyEmoji: '\u{1F4F1}' },
    { name: 'computer-symbolic', legacyEmoji: '\u{1F4BB}' },
    { name: 'accessories-dictionary-symbolic', legacyEmoji: '\u{1F4D6}' },
    { name: 'user-bookmarks-symbolic', legacyEmoji: '\u{1F516}' },
    { name: 'system-users-symbolic', legacyEmoji: '\u{1F46A}' },
    { name: 'avatar-default-symbolic', legacyEmoji: '\u{1F464}' },
    { name: 'emoji-nature-symbolic', legacyEmoji: '\u{1F33F}' },
    { name: 'weather-clear-symbolic', legacyEmoji: '\u2600' },
    { name: 'starred-symbolic', legacyEmoji: '\u2B50' },
    { name: 'emblem-important-symbolic', legacyEmoji: '\u2757' },
    { name: 'folder-symbolic', legacyEmoji: '\u{1F4C1}' },
    { name: 'tabler:car', legacyEmoji: '\u{1F699}' },
    { name: 'tabler:bicycle', legacyEmoji: '\u{1F6B2}' },
    { name: 'tabler:bus', legacyEmoji: '\u{1F68C}' },
    { name: 'tabler:train', legacyEmoji: '\u{1F686}' },
    { name: 'tabler:map', legacyEmoji: '\u{1F5FA}' },
    { name: 'tabler:pin', legacyEmoji: '\u{1F4CC}' },
    { name: 'tabler:shopping-cart', legacyEmoji: '\u{1F6CD}' },
    { name: 'tabler:basket', legacyEmoji: '\u{1F9FA}' },
    { name: 'tabler:tag', legacyEmoji: '\u{1F3F7}' },
    { name: 'tabler:wallet', legacyEmoji: '\u{1F45B}' },
    { name: 'tabler:bank', legacyEmoji: '\u{1F3E6}' },
    { name: 'tabler:folder', legacyEmoji: '\u{1F5C2}' },
    { name: 'tabler:folder-down', legacyEmoji: '\u{1F4E5}' },
    { name: 'tabler:folder-pictures', legacyEmoji: '\u{1F5BC}' },
    { name: 'tabler:folder-videos', legacyEmoji: '\u{1F39E}' },
    { name: 'tabler:video', legacyEmoji: '\u{1F3A5}' },
    { name: 'tabler:microphone', legacyEmoji: '\u{1F3A4}' },
    { name: 'tabler:printer', legacyEmoji: '\u{1F5A8}' },
    { name: 'tabler:alarm', legacyEmoji: '\u23F0' },
    { name: 'tabler:clock', legacyEmoji: '\u{1F552}' },
    { name: 'tabler:face-smile', legacyEmoji: '\u{1F642}' },
    { name: 'tabler:heart', legacyEmoji: '\u{1F497}' },
    { name: 'tabler:trash', legacyEmoji: '\u{1F5D1}' },
];
// The emoji presentation selector is optional when typing, so it is ignored when comparing.
const bare = (emoji) => emoji.replace(/\uFE0F/g, '');
const NAMES = new Set(CATEGORY_ICON_CHOICES.map((choice) => choice.name));
const BY_EMOJI = new Map(CATEGORY_ICON_CHOICES.map((choice) => [bare(choice.legacyEmoji), choice.name]));
export function isKnownCategoryIcon(name) {
    return NAMES.has(name);
}
/**
 * The stored form of an icon: known names stay, legacy emoji become their name,
 * other emoji fall back to the default icon, and unknown plain names (a custom
 * icon of the desktop theme) are kept so that the shared file is left untouched.
 */
export function normalizeCategoryIcon(icon) {
    if (NAMES.has(icon))
        return icon;
    const legacy = BY_EMOJI.get(bare(icon));
    if (legacy !== undefined)
        return legacy;
    return /^[\x20-\x7E]+$/.test(icon) ? icon : DEFAULT_CATEGORY_ICON;
}
export function normalizeCategoryIcons(list) {
    return list.map((category) => ({ name: category.name, icon: normalizeCategoryIcon(category.icon) }));
}
//# sourceMappingURL=category-icons.js.map