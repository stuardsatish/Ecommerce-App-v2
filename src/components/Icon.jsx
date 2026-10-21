import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Single icon entry point for the whole app.
 *
 * The source web app draws every icon from `lucide-react` (plus `react-icons`'
 * `FaHeart`/`FaRegHeart` on the product cards). Lucide is a fork of Feather
 * Icons and keeps Feather's names and 24×24/2px-stroke geometry, so
 * `@expo/vector-icons`' Feather set is the closest available match on RN — the
 * glyphs line up with the web build rather than approximating it.
 *
 * `NAMES` below is keyed by the *lucide* name used in the source (kebab-case),
 * so a lookup here reads directly against the web file it was ported from.
 * Three kinds of entry exist:
 *   - Feather, for the stroke icons Lucide shares with it.
 *   - Ionicons, for the SOLID variants Feather has no equivalent of — filled
 *     stars and filled hearts. Feather is stroke-only, so `<Star fill=...>`
 *     and `<FaHeart>` (both used in the source) can't be expressed with it.
 *   - MaterialCommunityIcons / Ionicons brand glyphs, for the two icons in
 *     neither set: Lucide's `banknote` (COD button) and the inline WhatsApp
 *     logo SVG the source hand-writes in CartPage's payment modal.
 *
 * Usage: `<Icon name="shopping-cart" size={22} color={c.primary} />`
 * Pass colours as literal values (see `useThemeColors`) — vector-icons take a
 * `color` prop, not a className.
 */
const NAMES = {
  // — navigation / chrome —
  'chevron-left': [Feather, 'chevron-left'],
  'chevron-right': [Feather, 'chevron-right'],
  'chevron-down': [Feather, 'chevron-down'],
  'chevron-up': [Feather, 'chevron-up'],
  'more-vertical': [Feather, 'more-vertical'],
  'arrow-left': [Feather, 'arrow-left'],
  'arrow-right': [Feather, 'arrow-right'],
  x: [Feather, 'x'],
  search: [Feather, 'search'],
  'sliders-horizontal': [Feather, 'sliders'],
  home: [Feather, 'home'],
  store: [Feather, 'shopping-bag'],
  user: [Feather, 'user'],
  'log-out': [Feather, 'log-out'],
  moon: [Feather, 'moon'],
  sun: [Feather, 'sun'],

  // — commerce —
  'shopping-cart': [Feather, 'shopping-cart'],
  'shopping-bag': [Feather, 'shopping-bag'],
  heart: [Ionicons, 'heart-outline'],
  'heart-filled': [Ionicons, 'heart'],
  star: [Ionicons, 'star-outline'],
  'star-filled': [Ionicons, 'star'],
  minus: [Feather, 'minus'],
  plus: [Feather, 'plus'],
  'trash-2': [Feather, 'trash-2'],
  truck: [Feather, 'truck'],
  package: [Feather, 'package'],
  archive: [Feather, 'archive'],
  bell: [Feather, 'bell'],
  'map-pin': [Feather, 'map-pin'],
  'rotate-ccw': [Feather, 'rotate-ccw'],
  download: [Feather, 'download'],
  'share-2': [Feather, 'share-2'],
  'thumbs-up': [Feather, 'thumbs-up'],
  'thumbs-down': [Feather, 'thumbs-down'],
  bookmark: [Feather, 'bookmark'],
  tag: [Feather, 'tag'],
  gift: [Feather, 'gift'],

  // — status —
  clock: [Feather, 'clock'],
  'check-circle-2': [Feather, 'check-circle'],
  'x-circle': [Feather, 'x-circle'],
  'alert-triangle': [Feather, 'alert-triangle'],
  info: [Feather, 'info'],
  check: [Feather, 'check'],

  // — account / forms —
  pencil: [Feather, 'edit-2'],
  camera: [Feather, 'camera'],
  image: [Feather, 'image'],
  lock: [Feather, 'lock'],
  copy: [Feather, 'copy'],
  'external-link': [Feather, 'external-link'],
  eye: [Feather, 'eye'],
  'eye-off': [Feather, 'eye-off'],

  // — payment —
  'credit-card': [Feather, 'credit-card'],
  banknote: [MaterialCommunityIcons, 'cash-multiple'],
  whatsapp: [Ionicons, 'logo-whatsapp'],
};

export function Icon({ name, size = 20, color, style }) {
  const entry = NAMES[name];
  if (!entry) {
    // Loud in development, harmless in production: a typo'd name renders
    // nothing rather than crashing the screen it sits on.
    console.warn(`<Icon>: unknown name "${name}"`);
    return null;
  }
  const [Set, glyph] = entry;
  return <Set name={glyph} size={size} color={color} style={style} />;
}