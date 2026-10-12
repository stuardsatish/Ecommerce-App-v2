import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * Phase 16 (Shared Components / Polish) addition — not ported from any
 * single source file, since the web app's biggest inconsistency here (per
 * MIGRATION_ANALYSIS.md's Phase 16 objective) was exactly this: several
 * pages swallow a fetch failure into `console.error` and fall through to
 * their ordinary EMPTY state, so a real network/server error looks
 * identical to "you genuinely have nothing here." Products (`ProductsPage`)
 * and the order-history pages are the clearest examples — re-reading them
 * for this phase confirmed a failed fetch there sets an empty array with no
 * distinct error UI at all.
 *
 * This is a single shared component so every screen's failure state uses
 * the same visual language (the phase's own acceptance bar) instead of each
 * screen growing its own bespoke one.
 */
export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  const c = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center gap-3 px-6">
      {/*
        Was a `⚠` text glyph. Now a real icon, at the 44px every other
        full-screen state in this app uses (empty cart, empty wishlist, no
        orders) — the mobile-parity pass's rule that no UI icon is a font
        character applies here too, even though this component has no source
        counterpart to port from.
      */}
      <Icon name="alert-triangle" size={44} color={c.error} />
      <Text className="text-center font-sans-semibold text-sm text-ink">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="rounded-full border border-border px-6 py-2.5 active:opacity-70">
          <Text className="font-sans-bold text-sm text-primary">Try Again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}