/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: ['./src/**/*.{js,jsx}'],
    presets: [require('nativewind/preset')],
    theme: {
        extend: {
            colors: {
                primary: 'var(--color-primary)',
                'primary-hover': 'var(--color-primary-hover)',
                'primary-fg': 'var(--color-primary-fg)',
                accent: 'var(--color-accent)',
                'accent-strong': 'var(--color-accent-strong)',
                'accent-subtle': 'var(--color-accent-subtle)',
                'accent-fg': 'var(--color-accent-fg)',
                link: 'var(--color-link)',
                'link-hover': 'var(--color-link-hover)',
                ring: 'var(--color-ring)',
                disabled: 'var(--color-disabled)',
                'disabled-fg': 'var(--color-disabled-fg)',

                background: 'var(--color-background)',
                surface: 'var(--color-surface)',
                'surface-muted': 'var(--color-surface-muted)',
                'surface-inverse': 'var(--color-surface-inverse)',
                overlay: 'var(--color-overlay)',

                ink: 'var(--color-ink)',
                body: 'var(--color-body)',
                muted: 'var(--color-muted)',
                inverse: 'var(--color-inverse)',

                border: 'var(--color-border)',
                'border-strong': 'var(--color-border-strong)',
                'border-subtle': 'var(--color-border-subtle)',

                success: 'var(--color-success)',
                'success-fg': 'var(--color-success-fg)',
                'success-subtle': 'var(--color-success-subtle)',
                'success-border': 'var(--color-success-border)',

                error: 'var(--color-error)',
                'error-fg': 'var(--color-error-fg)',
                'error-subtle': 'var(--color-error-subtle)',
                'error-border': 'var(--color-error-border)',

                warning: 'var(--color-warning)',
                'warning-fg': 'var(--color-warning-fg)',
                'warning-subtle': 'var(--color-warning-subtle)',
                'warning-border': 'var(--color-warning-border)',

                info: 'var(--color-info)',
                'info-fg': 'var(--color-info-fg)',
                'info-subtle': 'var(--color-info-subtle)',
                'info-border': 'var(--color-info-border)',

                // Rating-star colour — see global.css's header note on why this one
                // chart-* token is ported while the rest are admin-only.
                'chart-gold': 'var(--color-chart-gold)',
            },
            fontFamily: {
                sans: ['Inter_400Regular'],
                'sans-medium': ['Inter_500Medium'],
                'sans-semibold': ['Inter_600SemiBold'],
                'sans-bold': ['Inter_700Bold'],
                accent: ['Caveat_600SemiBold'],
            },
            boxShadow: {
                // The one recurring card shadow found across CartPage/WishlistPage/MyProfile/BillingPage
                card: '0px 4px 20px rgba(26,43,60,0.05)',
            },
        },
    },
    plugins: [],
};