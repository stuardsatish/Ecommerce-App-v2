import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { RequestCard } from '@/components/returns/RequestCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { returnsService } from '@/services/returns';
import { requestStatusMeta } from '@/utils/requestModel';

const FILTERS = [
  { key: 'active', label: 'In progress' },
  { key: 'all', label: 'All' },
  { key: 'return', label: 'Returns' },
  { key: 'exchange', label: 'Exchanges' },
];

/**
 * "My returns & exchanges": every request the customer has made, newest first, with the same detail and actions as on the order
 * screen (RequestCard). Twin of the website's pages/MyReturnsPage. Requests are only ever CREATED from an order (the order screen
 * knows what can still be returned), so the empty state points to Past Orders.
 */
export default function MyReturnsScreen() {
  const c = useThemeColors();
  const user = useSelector((state) => state.user.user);
  const [state, setState] = useState({ loading: true, requests: [], parcels: [], refunds: [], replacements: {}, error: false });
  const [filter, setFilter] = useState('active');

  const load = useCallback(async () => {
    try {
      const requests = await returnsService.listMine();
      const parcels = await returnsService.returnShipmentsFor(requests.map((r) => r.id));
      // a convenience on top of the requests: a failure to read the refunds must not hide the requests themselves
      const refunds = await returnsService.refundsForRequests(requests.map((r) => r.id)).catch(() => []);
      const replacements = await returnsService
        .replacementsFor(requests.filter((r) => r.type === 'exchange').map((r) => r.id))
        .catch(() => ({}));
      setState({ loading: false, requests, parcels, refunds, replacements, error: false });
    } catch (err) {
      console.error('my returns:', err);
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(
    () =>
      state.requests.filter((r) => {
        if (filter === 'active') return !requestStatusMeta(r.status).final;
        if (filter === 'all') return true;
        return r.type === filter;
      }),
    [state.requests, filter]
  );

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1">
        <AppHeader title="My Returns" />

        <View className="flex-row flex-wrap gap-2 px-5 pt-4">
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
              className={`rounded-full px-4 py-2 ${filter === f.key ? 'bg-primary' : 'border border-border bg-surface'}`}>
              <Text className={`font-sans-semibold text-[13px] ${filter === f.key ? 'text-inverse' : 'text-body'}`}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {state.loading ? (
          <View className="gap-3 px-5 pt-4">
            {[0, 1].map((i) => (
              <View key={i} className="h-24 rounded-xl bg-border" />
            ))}
          </View>
        ) : state.error ? (
          <ErrorState
            message="Couldn't load your requests."
            onRetry={() => {
              setState((s) => ({ ...s, loading: true, error: false }));
              load();
            }}
          />
        ) : shown.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Icon name="rotate-ccw" size={44} color={c.borderStrong} />
            <Text className="font-sans-bold text-base text-ink">
              {filter === 'active' ? 'Nothing in progress' : 'No requests yet'}
            </Text>
            <Text className="text-center text-sm text-body">
              To return or exchange something, open the order it came in (Past Orders).
            </Text>
            <Pressable onPress={() => router.push('/orders?tab=PAST')} className="rounded-full bg-primary px-6 py-3 active:opacity-90">
              <Text className="font-sans-bold text-sm text-inverse">Go to my past orders</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerClassName="gap-4 px-5 py-4">
            {shown.map((r) => (
              <View key={r.id} className="gap-1.5">
                <Pressable onPress={() => router.push(`/orders/${r.orderId}`)} hitSlop={6} className="active:opacity-60">
                  <Text className="font-sans-bold text-xs text-link">View order #{String(r.orderId).slice(-8).toUpperCase()}</Text>
                </Pressable>
                <RequestCard
                  request={r}
                  order={{ shipments: state.parcels.filter((p) => p.requestId === r.id) }}
                  refunds={state.refunds.filter((f) => f.requestId === r.id)}
                  replacement={state.replacements[r.id] || null}
                  user={user}
                  onChanged={load}
                />
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}