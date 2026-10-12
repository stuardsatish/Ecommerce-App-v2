/**
 * Plain-JS mirror of the same tokens defined as CSS variables in global.css.
 * Use NativeWind className utilities (bg-primary, text-ink, ...) for styling
 * components — only reach for these raw values when a native prop needs a
 * literal color (e.g. ActivityIndicator color, StatusBar, icon tintColor).
 *
 * Ported from the source web app's "default" theme
 * (Ecommerce-sept-1-2026/src/theme/themes.js) — the brand-a/brand-b alternate
 * themes and all chart-* tokens except `chartGold` are not ported; see
 * global.css's header comment for why chartGold is the exception (the mobile
 * user screens use it as the rating-star colour).
 */
export const Colors = {
  light: {
    primary: '#A43B31',
    primaryHover: '#8A322A',
    primaryFg: '#FFFFFF',
    accent: '#F59E0B',
    accentStrong: '#B45309',
    accentSubtle: '#FEF3C7',
    accentFg: '#1B1C1C',
    link: '#2563EB',
    linkHover: '#1D4ED8',
    ring: '#F59E0B',
    disabled: '#E4E2E1',
    disabledFg: '#A6A9AE',

    background: '#FBF9F8',
    surface: '#FFFFFF',
    surfaceMuted: '#F6F3F2',
    surfaceInverse: '#1B1C1C',
    overlay: 'rgba(0,0,0,0.4)',

    ink: '#1B1C1C',
    body: '#44474C',
    muted: '#74777D',
    inverse: '#FFFFFF',

    border: '#E4E2E1',
    borderStrong: '#C3C7C8',
    borderSubtle: '#F0EEED',

    success: '#16A34A',
    successFg: '#FFFFFF',
    successSubtle: '#DCFCE7',
    successBorder: '#86EFAC',

    error: '#BA1A1A',
    errorFg: '#FFFFFF',
    errorSubtle: '#FEE2E2',
    errorBorder: '#FCA5A5',

    warning: '#CA8A04',
    warningFg: '#1B1C1C',
    warningSubtle: '#FEF3C7',
    warningBorder: '#FDE68A',

    info: '#2563EB',
    infoFg: '#FFFFFF',
    infoSubtle: '#DBEAFE',
    infoBorder: '#BFDBFE',

    chartGold: '#D4AF37',
  },
  dark: {
    primary: '#D46A5E',
    primaryHover: '#E27B6F',
    primaryFg: '#2A0C08',
    accent: '#FBBF24',
    accentStrong: '#FCD34D',
    accentSubtle: '#3A2E00',
    accentFg: '#1B1C1C',
    link: '#7CB0FF',
    linkHover: '#A9CBFF',
    ring: '#FBBF24',
    disabled: '#2C3033',
    disabledFg: '#6B7075',

    background: '#141618',
    surface: '#1E2123',
    surfaceMuted: '#282C2E',
    surfaceInverse: '#F6F3F2',
    overlay: 'rgba(0,0,0,0.6)',

    ink: '#F2F3F4',
    body: '#C7C9CC',
    muted: '#9BA0A6',
    inverse: '#141618',

    border: '#33383B',
    borderStrong: '#464C50',
    borderSubtle: '#262A2C',

    success: '#4ADE80',
    successFg: '#052B12',
    successSubtle: '#0E2A17',
    successBorder: '#166534',

    error: '#FF7A6F',
    errorFg: '#2A0806',
    errorSubtle: '#3A1512',
    errorBorder: '#93000A',

    warning: '#FBBF24',
    warningFg: '#1B1C1C',
    warningSubtle: '#2E2405',
    warningBorder: '#B7791F',

    info: '#60A5FA',
    infoFg: '#06122A',
    infoSubtle: '#10233F',
    infoBorder: '#1E40AF',

    chartGold: '#E6C34D',
  },
};