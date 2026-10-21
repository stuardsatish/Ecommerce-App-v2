import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { RefundNotice } from '@/components/returns/RequestBits';
import { returnsService } from '@/services/returns';

/**
 * What the customer needs to know about the MONEY of one order that is not part of a return / exchange request: why the order was cancelled and where the refund of
 * it stands (Phase 12), or a refund the shop made on its own (e.g. for an exchange that could not be completed). Shows exactly what is stored, never an optimistic
 * state. Renders nothing for an order without a cancellation or an order-level refund - and nothing at all while the server has no such records yet.
 * Twin of the website's features/returns/OrderRefundSection.jsx.
 */
const fmtDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

export function OrderRefundSection({ order }) {
  const [state, setState] = useState({ loaded: false, cancellation: null, refunds: [] });
  const id = order?.id;

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    Promise.all([
      returnsService.cancellationForOrder(id).catch(() => null),
      returnsService.refundsForOrder(id).catch(() => []),
    ]).then(([cancellation, refunds]) => {
      if (alive) setState({ loaded: true, cancellation, refunds });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loaded, cancellation, refunds } = state;
  if (!loaded || (!cancellation && refunds.length === 0)) return null;
  return (
    <View className="gap-2.5 rounded-xl border border-border bg-surface p-4">
      <Text className="font-sans-bold text-base text-ink">{cancellation ? 'Order cancelled' : 'Refund'}</Text>
      {cancellation ? (
        <Text className="text-sm text-ink">
          {`This order was cancelled on ${fmtDate(cancellation.cancelledAt)}. ${cancellation.reason}`}
        </Text>
      ) : null}
      <RefundNotice refunds={refunds} />
    </View>
  );
}