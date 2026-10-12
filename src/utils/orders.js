// Ported from Ecommerce-sept-1-2026/src/features/orders/UserOrderCard.jsx's
// two exported pure helpers. Colors are re-expressed as NativeWind className
// fragments (bg-*/text-*) instead of CSS var strings, since there's no CSS
// cascade to read `var(--color-*)` from in RN — same token names either way.
export const orderNo = (o) => {
  if (!o) return '';
  return o.externalOrderId ? String(o.externalOrderId).replace(/^#/, '') : o.id || o.orderId || '';
};

/**
 * `icon` is an `@/components/Icon` name, and `tone` the `useThemeColors()` key
 * for the literal colour that icon needs (vector-icons take a `color` prop,
 * not a className, so the glyph can't inherit `text` the way the source's
 * `currentColor` SVG does).
 *
 * The source stores short discriminators here (`"check"`, `"x"`, `"truck"`)
 * and dispatches on them at each call site — `{m.icon === "check" &&
 * <CheckCircle2 …>}` etc. in both UserOrderCard and OrderDetailPage. Storing
 * the icon name directly collapses that three-way branch into one
 * `<Icon name={m.icon}>`; the names below are the lucide components those
 * branches actually render, so the rendered glyph is unchanged.
 */
export const statusMeta = (o) => {
  const s = (o?.orderStatus || '').toLowerCase();
  if (s === 'delivered') {
    return { key: 'DELIVERED', label: 'Delivered', bg: 'bg-success-subtle', text: 'text-success', icon: 'check-circle-2', tone: 'success' };
  }
  if (s === 'cancelled') {
    return { key: 'CANCELLED', label: 'Cancelled', bg: 'bg-error-subtle', text: 'text-error', icon: 'x-circle', tone: 'error' };
  }
  if (s === 'shipped') {
    return { key: 'IN_TRANSIT', label: 'In Transit', bg: 'bg-info', text: 'text-info-fg', icon: 'truck', tone: 'infoFg' };
  }
  return { key: 'PROCESSING', label: 'Processing', bg: 'bg-info-subtle', text: 'text-info', icon: 'truck', tone: 'info' };
};