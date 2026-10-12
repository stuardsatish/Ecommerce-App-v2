import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { OrderCard } from '@/components/OrderCard';
import { OrderCardSkeleton } from '@/components/OrderCardSkeleton';
import { ReviewModal } from '@/components/ReviewModal';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { submitReview as submitReviewApi } from '@/services/reviews';
import {
  removeReviewPhotoFiles,
  setReviewPhotos,
  uploadReviewPhotos,
} from '@/services/reviewsPlus';
import { generateAndShareInvoice } from '@/utils/invoice';
import { mapOrderRows, resolveOrderItemImage } from '@/utils/mappers';

const ONGOING_STATUSES = new Set(['placed', 'confirmed', 'shipped']);
const PAGE_SIZE = 5;

const toJsDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Ported from UserOrdersPage.jsx ("ongoing") + UserPastOrdersPage.jsx
 * ("past") mobile layouts — re-read both actual source files rather than
 * the doc summary. Consolidated into ONE screen with a segmented Ongoing/
 * Past control instead of two separate pages/routes: the RN route tree
 * (§11 of MIGRATION_ANALYSIS.md) only ever planned a single `orders/index`
 * screen ("tabs/segments for ongoing vs past ... decided in Phase 13"), and
 * the two source pages share ~90% of their structure (same order-card
 * shape, same skeleton, same review-modal state) — one fetch of all this
 * user's orders, filtered client-side by tab, avoids fetching the same
 * `orders` table twice.
 *
 * Pagination: the source's numbered `<Pagination>` (page-size selector,
 * page-number buttons) is a desktop-shaped widget with no real mobile
 * precedent in this app — replaced with a simple "Load More" button, which
 * preserves the same page-slicing intent without porting a control that
 * doesn't fit mobile.
 *
 * Reviews (this phase): wired to the real `reviews-create` Edge Function via
 * ReviewModal.jsx. Always sends `orderId` (UserPastOrdersPage's shape) rather
 * than UserOrdersPage's shape (which omits it) — re-reading both source
 * pages in Phase 13 confirmed UserOrdersPage's review entry point is
 * unreachable dead code (delivered orders never appear there), so only the
 * Past-orders behavior is ever actually exercised.
 *
 * Phase 16 addition: `fetchOrders` used to swallow a failure into
 * `console.error` and fall through to the same empty state as "you
 * genuinely have no orders" — now surfaced via ErrorState + retry.
 *
 * Mobile-parity pass: because the source's two order routes collapse into
 * this one screen, the segment is addressable by a `?tab=` param, which is
 * how AppHeader's "Current Orders" / "Past Orders" menu entries reach the
 * right list (they map to the source's `/userorders` and `/userpastorders`).
 * The header title follows the segment, using the source's own
 * `ROUTE_TITLES` strings for those two routes.
 *
 * Known deviation, deliberately kept: the source's mobile Past list shows
 * DELIVERED orders only — cancelled ones are invisible on mobile web, since
 * its All/Delivered/Cancelled tabs are a desktop-only control. This screen's
 * Past segment shows delivered + cancelled. That is a superset: it adds
 * reachability for orders that would otherwise be visible nowhere in this
 * app, and removes nothing. Flagged rather than trimmed.
 */

/** Source `ROUTE_TITLES`: `/userorders` → "Current Orders", `/userpastorders` → "Past Orders". */
const TAB_TITLES = { ONGOING: 'Current Orders', PAST: 'Past Orders' };

export default function OrdersScreen() {
  const user = useSelector((state) => state.user.user);
  const c = useThemeColors();
  const { tab } = useLocalSearchParams();

  const [activeTab, setActiveTab] = useState(tab === 'PAST' ? 'PAST' : 'ONGOING');
  const [allOrders, setAllOrders] = useState([]);
  const [userReviews, setUserReviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const fetchOrders = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setFetchError(false);
    try {
      const { data: rows, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.uid);
      if (error) throw error;
      const rawOrders = mapOrderRows(rows);

      const productIds = [
        ...new Set(rawOrders.flatMap((o) => (o.products || []).map((p) => p.productId)).filter(Boolean)),
      ];
      let productById = {};
      if (productIds.length) {
        const { data: pRows } = await supabase
          .from('products')
          .select('id, thumbnail, image, variants')
          .in('id', productIds);
        (pRows || []).forEach((p) => {
          productById[p.id] = p;
        });
      }
      const enrichedOrders = rawOrders.map((order) => ({
        ...order,
        products: (order.products || []).map((item) => {
          const p = productById[item.productId];
          const img = resolveOrderItemImage(item, p);
          return img ? { ...item, thumbnail: img, image: img } : item;
        }),
      }));

      const sorted = enrichedOrders.sort((a, b) => {
        const ta = toJsDate(a.createdAt)?.getTime() ?? 0;
        const tb = toJsDate(b.createdAt)?.getTime() ?? 0;
        return tb - ta;
      });
      setAllOrders(sorted);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setAllOrders([]);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    let active = true;
    const fetchUserReviews = async () => {
      if (!user?.uid) return;
      try {
        const { data: rows, error } = await supabase.from('reviews').select('*').eq('user_id', user.uid);
        if (error) throw error;
        const map = {};
        (rows || []).forEach((r) => {
          if (r.order_id && r.product_id) {
            map[`${r.order_id}_${r.product_id}`] = {
              rating: r.rating,
              comment: r.comment || '',
              photos: Array.isArray(r.photos) ? r.photos : [],
            };
          }
        });
        if (active) setUserReviews(map);
      } catch (err) {
        console.error('Error fetching reviews:', err);
      }
    };
    fetchUserReviews();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab]);

  // The header menu can push `/orders?tab=…` while this screen is already
  // mounted, in which case only the param changes and the initial useState
  // above never re-runs — so follow the param whenever it changes. Guarded on
  // a recognised value so a hand-typed/stale param can't blank the segment,
  // and left free to diverge afterwards: tapping the segmented control still
  // wins until the next navigation.
  useEffect(() => {
    if (tab === 'PAST' || tab === 'ONGOING') setActiveTab(tab);
  }, [tab]);

  const orders = useMemo(() => {
    return allOrders.filter((o) => {
      const s = (o.orderStatus || '').toLowerCase();
      return activeTab === 'ONGOING' ? ONGOING_STATUSES.has(s) : ['delivered', 'cancelled'].includes(s);
    });
  }, [allOrders, activeTab]);

  const visibleOrders = orders.slice(0, visibleCount);

  const downloadInvoice = (order) => {
    generateAndShareInvoice(order, {
      name: order.userName || user?.name,
      email: order.userEmail || user?.email,
      phone: order.userPhone || user?.phone,
      address: order.address || order.shippingAddress,
    }).catch((err) => {
      console.error('Invoice generation failed:', err);
      Alert.alert('Could not generate invoice', 'Please try again.');
    });
  };

  const openReviewModal = (product, orderId) => {
    setSelectedProduct(product);
    setSelectedOrderId(orderId);
  };

  const existingReview = selectedProduct
    ? userReviews[`${selectedOrderId}_${selectedProduct.productId}`]
    : null;

  // Photos ride on top of the normal review submission: the review is saved
  // first (unchanged Edge Function), then the pictures are uploaded and
  // attached. A photo failure never fails the review — it is reported on its
  // own and the review stays submitted.
  const attachPhotos = async (reviewId, { files, keep }, previous) => {
    const removed = previous.filter((path) => !keep.includes(path));
    if (!files.length && !removed.length) return { paths: previous, failed: false };
    let uploaded = [];
    try {
      uploaded = await uploadReviewPhotos({
        userId: user.uid,
        orderId: selectedOrderId,
        productId: selectedProduct.productId,
        files,
      });
      const finalPaths = [...keep, ...uploaded];
      await setReviewPhotos(reviewId, finalPaths);
      // Only tidy storage once the review no longer points at the old files.
      removeReviewPhotoFiles(removed);
      return { paths: finalPaths, failed: false };
    } catch (err) {
      console.error('Review photo error:', err);
      removeReviewPhotoFiles(uploaded);
      return { paths: previous, failed: true };
    }
  };

  const handleSubmitReview = async (rating, comment, photos = { files: [], keep: [] }) => {
    try {
      const { reviewId } = await submitReviewApi({
        orderId: selectedOrderId,
        productId: selectedProduct.productId,
        productTitle: selectedProduct.title,
        rating,
        comment: comment || '',
      });
      const { paths: photoPaths, failed: photosFailed } = await attachPhotos(
        reviewId || `${user.uid}_${selectedOrderId}_${selectedProduct.productId}`,
        photos,
        existingReview?.photos || []
      );
      setUserReviews((prev) => ({
        ...prev,
        [`${selectedOrderId}_${selectedProduct.productId}`]: {
          rating,
          comment: comment || '',
          photos: photoPaths,
        },
      }));
      setSelectedProduct(null);
      setSelectedOrderId(null);
      // Source: UserPastOrdersPage's submitReview — toast, not a modal. Only
      // one toast shows at a time, so a photo failure replaces the success one.
      if (photosFailed) toast.error("Review submitted, but the photos couldn't be uploaded.");
      else toast.success('Your review has been submitted.');
    } catch (err) {
      console.error('Review error:', err);
      toast.error(err.message || 'Could not submit review. Please try again.');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1">
        <AppHeader title={TAB_TITLES[activeTab]} />
        <View className="flex-row gap-2 px-5 pt-4">
          {[
            { key: 'ONGOING', label: 'Ongoing' },
            { key: 'PAST', label: 'Past' },
          ].map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              className={`flex-1 items-center rounded-full py-2.5 ${
                activeTab === t.key ? 'bg-primary' : 'border border-border bg-surface'
              }`}>
              <Text
                className={`font-sans-semibold text-sm ${
                  activeTab === t.key ? 'text-inverse' : 'text-body'
                }`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View className="gap-4 px-5 pt-4">
            {[0, 1, 2].map((i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </View>
        ) : fetchError ? (
          <ErrorState message="Couldn't load your orders." onRetry={fetchOrders} />
        ) : orders.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            {/*
              Source uses a different glyph per page: `Package size={44}` on
              UserOrdersPage, `Archive size={44}` on UserPastOrdersPage, both
              in border-strong. Keyed off the segment here since one screen
              stands in for both routes.
            */}
            <Icon
              name={activeTab === 'ONGOING' ? 'package' : 'archive'}
              size={44}
              color={c.borderStrong}
            />
            <Text className="font-sans-semibold text-sm text-muted">
              {activeTab === 'ONGOING' ? 'No active orders yet.' : 'No past orders yet.'}
            </Text>
            <Pressable
              onPress={() => router.push('/products')}
              className="rounded-full bg-primary px-6 py-3">
              <Text className="font-sans-bold text-sm text-inverse">Start Shopping</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={visibleOrders}
            keyExtractor={(order) => String(order.id)}
            contentContainerClassName="gap-4 px-5 py-4"
            renderItem={({ item: order }) => (
              <OrderCard
                order={order}
                getReview={(productId) => userReviews[`${order.id}_${productId}`]}
                onDownloadInvoice={() => downloadInvoice(order)}
                onReviewPress={(item) => openReviewModal(item, order.id)}
                onPress={() => router.push(`/orders/${order.id}`)}
              />
            )}
            ListFooterComponent={
              visibleCount < orders.length ? (
                <Pressable
                  onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="items-center rounded-full border border-border py-3">
                  <Text className="font-sans-semibold text-sm text-body">Load More</Text>
                </Pressable>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      <ReviewModal
        visible={!!selectedProduct}
        onClose={() => {
          setSelectedProduct(null);
          setSelectedOrderId(null);
        }}
        product={selectedProduct}
        initialRating={existingReview?.rating || 0}
        initialComment={existingReview?.comment || ''}
        initialPhotos={existingReview?.photos || []}
        onSubmit={handleSubmitReview}
      />
    </View>
  );
}