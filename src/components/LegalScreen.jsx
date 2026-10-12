import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';

/**
 * Shared chrome for this app's static policy/help screens (Help Center,
 * Return Policy, Delivery Policy).
 *
 * RN counterpart of the web app's `Common/LegalPageLayout.jsx` — same
 * title + "Last updated" + stacked-prose shape, so the two apps read as the
 * same document. The web version centres itself in a 760px column; here the
 * single phone-width column makes that moot, so the only structural change is
 * swapping that wrapper for this app's standard `AppHeader` + `ScrollView`
 * screen frame (matching Profile/Orders).
 */
export function LegalScreen({ title, lastUpdated, children }) {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top']}>
        <AppHeader title={title} />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
          <Text className="font-sans-bold text-2xl text-ink">{title}</Text>
          {lastUpdated ? (
            <Text className="mt-1.5 font-sans-medium text-xs text-muted">
              Last updated: {lastUpdated}
            </Text>
          ) : null}
          <View className="mt-6 gap-5">{children}</View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Web parity: `LegalSection` from LegalPageLayout.jsx. */
export function LegalSection({ title, children }) {
  return (
    <View>
      <Text className="mb-2 font-sans-semibold text-base text-ink">{title}</Text>
      {typeof children === 'string' ? (
        <Text className="font-sans text-[15px] leading-6 text-body">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/** Plain body paragraph, for sections that mix text with other elements. */
export function LegalText({ children }) {
  return <Text className="font-sans text-[15px] leading-6 text-body">{children}</Text>;
}