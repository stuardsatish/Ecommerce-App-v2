import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { RequestCard } from '@/components/returns/RequestCard';
import { ReturnRequestSheet } from '@/components/returns/ReturnRequestSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { returnsService } from '@/services/returns';
import { anyEligible, describeEligibility } from '@/utils/requestModel';

/**
 * "Returns & exchanges" of the order-detail screen: which lines can be returned / exchanged right now (the server decides, this only
 * shows its answer), the buttons to start a request, and every request already made for this order with its status. Renders nothing
 * when the server has no returns feature yet, or when the order was never delivered and has no request.
 * Twin of the website's features/returns/OrderReturnsSection.jsx.
 */
export function OrderReturnsSection({ order, user }) {
  const c = useThemeColors();
  const [state, setState] = useState({
    loading: true,
    eligibility: null,
    reasons: [],
    requests: [],
    refunds: [],
    replacements: {},
    error: '',
  });
  const [sheet, setSheet] = useState(null); // { type, itemId }
  const delivered = String(order?.orderStatus || '').toLowerCase() === 'delivered';
  const orderId = order?.id;

  const load = useCallback(async () => {
    try {
      const [eligibility, reasons, requests] = await Promise.all([
        delivered ? returnsService.eligibility(orderId) : Promise.resolve(null),
        returnsService.reasons(),
        returnsService.listForOrder(orderId),
      ]);
      // the refunds and the replacements are a convenience on top of the requests: a failure to read them must not hide the requests themselves
      const [refunds, replacements] = await Promise.all([
        returnsService.refundsForRequests(requests.map((r) => r.id)).catch(() => []),
        returnsService
          .replacementsFor(requests.filter((r) => r.type === 'exchange').map((r) => r.id))
          .catch(() => ({})),
      ]);
      setState({ loading: false, eligibility, reasons, requests, refunds, replacements, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Could not load your return options' }));
    }
  }, [orderId, delivered]);
  useEffect(() => {
    load();
  }, [load]);

  const { loading, eligibility, reasons, requests, refunds, replacements, error } = state;
  if (loading) return null;
  if (!eligibility && requests.length === 0 && !error) return null;

  const canReturn = anyEligible(eligibility, 'return');
  const canExchange = anyEligible(eligibility, 'exchange');
  const items = (eligibility && eligibility.items) || [];
  const open = (type, itemId = null) => setSheet({ type, itemId });

  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <Icon name="rotate-ccw" size={16} color={c.primary} />
        <Text className="font-sans-bold text-base text-ink">Returns &amp; exchanges</Text>
      </View>

      {error ? <Text className="text-[13px] text-error">{error}</Text> : null}

      {canReturn || canExchange ? (
        <View className="flex-row gap-2">
          {canReturn ? (
            <Pressable
              onPress={() => open('return')}
              accessibilityRole="button"
              className="h-11 flex-1 items-center justify-center rounded-full bg-primary active:opacity-90">
              <Text className="font-sans-bold text-sm text-inverse">Return items</Text>
            </Pressable>
          ) : null}
          {canExchange ? (
            <Pressable
              onPress={() => open('exchange')}
              accessibilityRole="button"
              className="h-11 flex-1 items-center justify-center rounded-full border border-border active:opacity-70">
              <Text className="font-sans-bold text-sm text-ink">Exchange items</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {eligibility ? (
        <View className="gap-2">
          {items.map((line) => {
            const r = describeEligibility(line.return, 'return');
            const x = describeEligibility(line.exchange, 'exchange');
            return (
              <View key={line.order_item_id} className="gap-1.5 border-t border-info-subtle pt-2.5">
                <Text className="font-sans-semibold text-[14px] text-ink">
                  {line.title}
                  {line.variant_name ? ` · ${line.variant_name}` : ''}
                  <Text className="font-sans text-muted">{` x${line.quantity}`}</Text>
                </Text>
                <Text className="text-xs text-body">{`Return: ${r.hint}`}</Text>
                <Text className="text-xs text-body">{`Exchange: ${x.hint}`}</Text>
                {r.eligible || x.eligible ? (
                  <View className="flex-row gap-2">
                    {r.eligible ? (
                      <Pressable
                        onPress={() => open('return', line.order_item_id)}
                        accessibilityRole="button"
                        className="h-9 items-center justify-center rounded-full border border-border px-4 active:opacity-70">
                        <Text className="font-sans-semibold text-[13px] text-ink">Return</Text>
                      </Pressable>
                    ) : null}
                    {x.eligible ? (
                      <Pressable
                        onPress={() => open('exchange', line.order_item_id)}
                        accessibilityRole="button"
                        className="h-9 items-center justify-center rounded-full border border-border px-4 active:opacity-70">
                        <Text className="font-sans-semibold text-[13px] text-ink">Exchange</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {requests.length ? (
        <View className="gap-2.5">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              order={order}
              refunds={refunds.filter((f) => f.requestId === r.id)}
              replacement={replacements[r.id] || null}
              user={user}
              onChanged={load}
            />
          ))}
        </View>
      ) : null}

      {sheet ? (
        <ReturnRequestSheet
          key={`${sheet.type}-${sheet.itemId || 'all'}`}
          order={order}
          eligibility={eligibility}
          reasons={reasons}
          user={user}
          initialType={sheet.type}
          initialItemId={sheet.itemId}
          onClose={() => {
            setSheet(null);
            load();
          }}
        />
      ) : null}
    </View>
  );
}