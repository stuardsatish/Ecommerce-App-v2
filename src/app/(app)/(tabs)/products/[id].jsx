import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { AppHeader } from '@/components/AppHeader';
import { Icon } from '@/components/Icon';
import { ImageCarousel } from '@/components/ImageCarousel';
import { PolicyLinks } from '@/components/PolicyLinks';
import { ProductCard } from '@/components/ProductCard';
import { ProductDetailSkeleton } from '@/components/ProductDetailSkeleton';
import { Stars } from '@/components/Stars';
import { ProductQA } from '@/components/reviews/ProductQA';
import { ReviewsList } from '@/components/reviews/ReviewsList';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  decrementOrRemoveCartItem,
  nextAddQuantity,
  nextRemoveQuantity,
  upsertCartItem,
} from '@/services/supabaseCart';
import { addWishlistItem, removeWishlistItem } from '@/services/supabaseWishlist';
import { addStockAlert, hasStockAlert, removeStockAlert } from '@/services/notifications';
import { addCart, removeCart } from '@/store/CartSlice';
import { addWishlist, removeWishlist } from '@/store/WishlistSlice';
import { mapProductRow, mapProductRows } from '@/utils/mappers';
import { addRecentlyViewed } from '@/utils/recentlyViewed';

// Pure helpers ported from Ecommerce-sept-1-2026/src/pages/ProductDetail/ProductDetail.jsx.
// Kept local to this screen (not moved into utils/) since they're only used
// here, same as the source file keeps them module-local rather than shared.
const normalizeSpecs = (specs) => {
  if (!specs) return [];
  if (Array.isArray(specs)) {
    return specs.map((s) => {
      if (s && typeof s === 'object') {
        const label = s.label ?? s.key ?? s.name ?? s.title ?? null;
        const rawVal = s.value ?? s.val ?? s.detail ?? null;
        return {
          label,
          value: rawVal != null ? String(rawVal) : label ? '' : JSON.stringify(s),
        };
      }
      return { label: null, value: String(s) };
    });
  }
  if (typeof specs === 'object') {
    return Object.entries(specs).map(([k, v]) => ({
      label: k,
      value: v != null && typeof v === 'object' ? JSON.stringify(v) : String(v),
    }));
  }
  return [{ label: null, value: String(specs) }];
};

const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Ported from ProductDetail.jsx's mobile (≤lg) layout only — this app has no
 * desktop breakpoint, matching every prior phase's mobile-only porting scope.
 * Two things confirmed by re-reading the real source and deliberately NOT
 * carried over, both flagged in detail where they matter below:
 *
 * 1. Related products (§3/Phase 9 doc says "fetch ... related products") are
 *    a desktop-only section in the real source (rendered only past the
 *    `hidden lg:block` boundary) — the mobile layout has no related-products
 *    UI at all. Skipped entirely, consistent with the mobile-only scope.
 * 2. `ratingStats` (the 5/4/3/2/1 rating histogram) is likewise desktop-only
 *    — skipped, see the reviews effect below.
 */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const dispatch = useDispatch();
  const c = useThemeColors();

  // Backs the Reviews header's "View All" action, which in the source scrolls
  // the page to `#mobile-reviews`.
  const scrollRef = useRef(null);
  const reviewsY = useRef(0);

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [ratingStats, setRatingStats] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);

  // Phase 7.2 — stock alert state
  const [hasAlert, setHasAlert] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);


  const wishlistItems = useSelector((state) => state.wishlist.wishlistItems);
  const isWishlisted = wishlistItems.some((item) => String(item.id) === String(id));
  const user = useSelector((state) => state.user.user);
  const cartItems = useSelector((state) => state.cart.cartItems);

  useEffect(() => {
    setError(false);
    setSelectedVariant(null);
    setActiveImgIdx(0);
    setDescExpanded(false);
    setSpecsOpen(false);

    const fetchProduct = async () => {
      try {
        const { data: row, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (row) {
          setProduct(mapProductRow(row));
          addRecentlyViewed(row.id);
        } else {
          setProduct(null);
          setError(true);
        }
      } catch (err) {
        setError(true);
        console.log('Product fetch error:', err);
      }
    };
    fetchProduct();
  }, [id]);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const { data: rows, error: fetchError } = await supabase
          .from('reviews')
          .select('*, profiles(name)')
          .eq('product_id', id);
        if (fetchError) throw fetchError;
        const reviewList = (rows || []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          orderId: row.order_id,
          productId: row.product_id,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.created_at,
          userName: row.profiles?.name || 'User',
          // Absent until the review-photos migration is applied.
          photos: Array.isArray(row.photos) ? row.photos : [],
        }));
        setReviews(reviewList);

        // The source computes avg/count via a SECOND, separate
        // `reviews.select('rating').eq('product_id', id)` query — same
        // table, same filter, same `rating` column already present in the
        // rows just fetched above. Deriving it from `reviewList` instead
        // avoids a confirmed-redundant round trip (same fix pattern as
        // Phase 8's ProductCard N+1); the displayed numbers are identical.
        let total = 0;
        let count = 0;
        const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviewList.forEach((r) => {
          if (r.rating) {
            const rating = Number(r.rating);
            total += rating;
            count += 1;
            const bucket = Math.round(rating);
            if (stats[bucket] !== undefined) stats[bucket] += 1;
          }
        });
        setAvgRating(count > 0 ? total / count : 0);
        setReviewCount(count);
        setRatingStats(stats);
      } catch (err) {
        console.log('Review fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [id]);

  useEffect(() => {
    if (!product?.category) {
      setRelatedProducts([]);
      return;
    }
    let active = true;
    const fetchRelated = async () => {
      try {
        const { data: rows, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('category', product.category)
          .neq('id', product.id)
          .limit(10);
        if (fetchError) throw fetchError;
        if (!active) return;

        const relatedRows = rows || [];
        const { data: reviewsData } = await supabase
          .from('reviews')
          .select('product_id, rating')
          .in('product_id', relatedRows.map((row) => row.id));

        const ratingsMap = {};
        (reviewsData || []).forEach((review) => {
          const pid = String(review.product_id);
          if (!ratingsMap[pid]) ratingsMap[pid] = { total: 0, count: 0 };
          ratingsMap[pid].total += Number(review.rating || 0);
          ratingsMap[pid].count += 1;
        });

        const related = mapProductRows(relatedRows).map((p) => {
          const ratingInfo = ratingsMap[p.id];
          return {
            ...p,
            rating: ratingInfo ? ratingInfo.total / ratingInfo.count : 0,
            reviewCount: ratingInfo ? ratingInfo.count : 0,
          };
        });
        if (active) setRelatedProducts(related);
      } catch (err) {
        console.log('Related products fetch error:', err);
      }
    };
    fetchRelated();
    return () => {
      active = false;
    };
  }, [product?.id, product?.category]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${product.title} — ₹${Number(product.price || 0).toFixed(2)}\n${product.description || ''}`.trim(),
        title: product.title,
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const handleWishlist = async () => {
    if (!user) {
      // The source uses a native `alert()` here — the one place in the app
      // that does, flagged in MIGRATION_ANALYSIS.md §5 as an inconsistency
      // with the toast pattern used everywhere else. Routed through the toast.
      toast.error('Please login first');
      return;
    }
    const productId = String(id);
    try {
      if (isWishlisted) {
        dispatch(removeWishlist(productId));
        await removeWishlistItem(user.uid, productId);
      } else {
        dispatch(
          addWishlist({
            userId: user.uid,
            productId,
            id: productId,
            title: product.title,
            price: product.price,
            image: product.thumbnail || product.image,
            category: product.category,
            addedAt: new Date().toISOString(),
          })
        );
        await addWishlistItem(user.uid, product);
      }
    } catch (err) {
      console.log('Wishlist error:', err);
    }
  };

  const activeVariant = selectedVariant;
  const mainImage = product?.thumbnail || product?.image;
  const galleryImages = product?.images || product?.productImages || product?.gallery || [];
  const allImages = [mainImage, ...galleryImages].filter(Boolean);

  const displayStock = activeVariant
    ? Number(activeVariant.stock) || 0
    : product
      ? Number(product.stock) || 0
      : 0;
  const isOutOfStock = displayStock <= 0;
  const stockWarning = isOutOfStock
    ? 'Out of stock'
    : displayStock <= 10
      ? `Only ${displayStock} left in stock - order soon`
      : null;

  // Phase 7.2: check existing stock alert when product + user are known
  useEffect(() => {
    if (!isOutOfStock || !user?.uid || !product?.id) return;
    let active = true;
    hasStockAlert(product.id, activeVariant?.id || null)
      .then((v) => { if (active) setHasAlert(v); })
      .catch(() => {});
    return () => { active = false; };
  }, [isOutOfStock, product?.id, activeVariant?.id, user?.uid]);

  const handleToggleStockAlert = async () => {
    if (!user?.uid) {
      toast.error('Please login to enable stock alerts');
      return;
    }
    setAlertBusy(true);
    try {
      if (hasAlert) {
        await removeStockAlert(product.id, activeVariant?.id || null);
        setHasAlert(false);
        toast.success('Stock alert removed');
      } else {
        await addStockAlert(product.id, activeVariant?.id || null);
        setHasAlert(true);
        toast.success('We\'ll notify you when it\'s back in stock!');
      }
    } catch (err) {
      toast.error(err.message || 'Could not set alert.');
    } finally {
      setAlertBusy(false);
    }
  };

  const mrpNum = activeVariant ? Number(activeVariant.price) || 0 : Number(product?.price || 0);
  const discountPct = (() => {
    if (product?.discountExpiry) {
      const expiry = new Date(product.discountExpiry).getTime();
      if (Date.now() > expiry) return 0;
    }
    return Number(product?.discount || 0);
  })();
  const priceNum = mrpNum - (mrpNum * discountPct) / 100;

  const specRows = useMemo(() => normalizeSpecs(product?.specs), [product?.specs]);

  const currentCartCompoundId = activeVariant
    ? `${product?.id || id}_${activeVariant.id}`
    : product?.id || id;
  const currentCartItem = cartItems.find(
    (item) => String(item.compound_id || item.id) === String(currentCartCompoundId)
  );

  const buildCartPayload = () => {
    const variantImg = activeVariant?.image || product.thumbnail || product.image;
    return activeVariant
      ? {
          ...product,
          variant_id: activeVariant.id,
          variant_name: activeVariant.name,
          selected_variant: activeVariant,
          price: activeVariant.price,
          stock: activeVariant.stock,
          image: variantImg,
          thumbnail: variantImg,
        }
      : product;
  };

  const handleAddToCart = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    const qty = nextAddQuantity(cartItems, currentCartCompoundId);
    const cartPayload = buildCartPayload();
    dispatch(
      addCart({
        ...cartPayload,
        id: currentCartCompoundId,
        compound_id: currentCartCompoundId,
        qtyToAdd: 1,
      })
    );
    upsertCartItem(user.uid, cartPayload, qty);
    toast.success('Added to cart');
  };

  const handleIncrement = () => {
    const qty = nextAddQuantity(cartItems, currentCartCompoundId);
    const cartPayload = buildCartPayload();
    dispatch(
      addCart({
        ...cartPayload,
        id: currentCartCompoundId,
        compound_id: currentCartCompoundId,
        qtyToAdd: 1,
      })
    );
    upsertCartItem(user.uid, cartPayload, qty);
  };

  const handleDecrement = () => {
    const qty = nextRemoveQuantity(cartItems, currentCartCompoundId);
    dispatch(removeCart(String(currentCartCompoundId)));
    // Pass {productId, variantId} rather than the compound string id —
    // supabaseCart.js's parseCartIds only special-cases a literal "_var_"
    // delimiter in string ids, which this app's `${productId}_${variantId}`
    // compound ids don't use, so a raw compound string here would write the
    // wrong product_id. The object form is the path parseCartIds handles
    // correctly for a variant purchase.
    decrementOrRemoveCartItem(
      user?.uid,
      { productId: product.id, variantId: activeVariant?.id || '' },
      qty
    );
  };

  const handleBuyNow = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!currentCartItem) {
      const qty = nextAddQuantity(cartItems, currentCartCompoundId);
      const cartPayload = buildCartPayload();
      dispatch(
        addCart({
          ...cartPayload,
          id: currentCartCompoundId,
          compound_id: currentCartCompoundId,
          qtyToAdd: 1,
        })
      );
      upsertCartItem(user.uid, cartPayload, qty);
    }
    router.push('/cart');
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={['top']}>
          <AppHeader title="Product" />
        </SafeAreaView>
        <ProductDetailSkeleton />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={['top']}>
          <AppHeader title="Product" />
        </SafeAreaView>
        <View className="flex-1 items-center justify-center gap-6 px-6">
          <Text className="text-center font-sans-semibold text-2xl text-ink">Product not found</Text>
          <Pressable
            onPress={() => router.push('/products')}
            className="h-12 flex-row items-center gap-2 rounded-xl bg-ink px-6 active:opacity-80">
            <Icon name="arrow-left" size={18} color={c.inverse} />
            <Text className="font-sans-bold text-inverse">Back to Products</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader title={product.title} />
        <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-6 px-5 pb-6 pt-4">
          <View className="relative">
            <ImageCarousel
              images={allImages}
              activeIndex={activeImgIdx}
              onIndexChange={setActiveImgIdx}
            />
            <View className="absolute right-4 top-4 gap-2">
              <Pressable
                onPress={handleWishlist}
                accessibilityLabel="Toggle wishlist"
                accessibilityRole="button"
                className="h-9 w-9 items-center justify-center rounded-full bg-surface/80 active:opacity-60">
                <Icon
                  name={isWishlisted ? 'heart-filled' : 'heart'}
                  size={20}
                  color={isWishlisted ? c.primary : c.ink}
                />
              </Pressable>
              <Pressable
                onPress={handleShare}
                accessibilityLabel="Share product"
                accessibilityRole="button"
                className="h-9 w-9 items-center justify-center rounded-full bg-surface/80 active:opacity-60">
                <Icon name="share-2" size={18} color={c.ink} />
              </Pressable>
            </View>
          </View>

          <View className="gap-2">
            <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
              {product.category}
            </Text>
            <Text className="font-sans-bold text-2xl text-ink">{product.title}</Text>

            <View className="flex-row items-center gap-1.5">
              <Stars rating={avgRating} size={12} />
              <Text className="font-sans-semibold text-xs text-body">
                {reviewCount > 0
                  ? `${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
                  : 'No reviews yet'}
              </Text>
            </View>

            <View className="flex-row flex-wrap items-center gap-2.5 pt-2">
              {discountPct > 0 ? (
                <>
                  <Text className="font-sans-bold text-3xl text-primary">{formatINR(priceNum)}</Text>
                  <Text className="font-sans text-sm text-muted line-through">
                    {formatINR(mrpNum)}
                  </Text>
                  <View className="rounded bg-error-subtle px-2 py-0.5">
                    <Text className="font-sans-semibold text-xs text-error">{discountPct}% OFF</Text>
                  </View>
                  {product.discountExpiry ? (
                    <Text className="w-full font-sans-medium text-xs text-accent-strong">
                      Offer ends:{' '}
                      {new Date(product.discountExpiry).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text className="font-sans-bold text-3xl text-primary">{formatINR(mrpNum)}</Text>
              )}
            </View>

            {product.hasVariants && product.variants?.length > 0 ? (
              <View className="gap-2 pt-2">
                <Text className="font-sans-semibold text-xs uppercase tracking-wide text-muted">
                  {product.attributes?.[0]?.name || 'Select Variant'}
                  {activeVariant ? ` — ${activeVariant.name}` : ''}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const isSelected = activeVariant?.id === v.id;
                    const outOfStock = Number(v.stock) <= 0;
                    return (
                      <Pressable
                        key={v.id}
                        disabled={outOfStock}
                        onPress={() => setSelectedVariant(isSelected ? null : v)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected, disabled: outOfStock }}
                        className={`flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 active:opacity-70 ${
                          isSelected ? 'border-2 border-ink bg-ink' : 'border-border-strong'
                        }`}>
                        {v.image || mainImage ? (
                          <Image
                            source={{ uri: v.image || mainImage }}
                            style={{ width: 44, height: 44, borderRadius: 6 }}
                            contentFit="cover"
                          />
                        ) : null}
                        <Text
                          className={`font-sans-semibold text-[13px] ${
                            isSelected
                              ? 'text-inverse'
                              : outOfStock
                                ? 'text-muted line-through'
                                : 'text-ink'
                          }`}>
                          {v.name} · ₹{v.price}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {stockWarning ? (
              <View className="flex-row items-center gap-2">
                <Icon name="alert-triangle" size={15} color={c.error} />
                <Text className="font-sans-medium text-sm text-error">{stockWarning}</Text>
              </View>
            ) : null}

            <View className="mt-2 gap-1 rounded-xl border border-border bg-surface-muted p-3">
              <View className="flex-row items-center gap-2">
                <Icon name="truck" size={18} color={c.ink} />
                <Text className="font-sans-semibold text-sm text-ink">Free shipping</Text>
              </View>
              {product.shippingInfo ? (
                <Text className="font-sans-semibold text-xs text-body">
                  {String(product.shippingInfo)}
                </Text>
              ) : null}
            </View>
          </View>

          {product.description ? (
            <View className="gap-2 border-t border-border pt-6">
              <Text className="font-sans-semibold text-lg text-ink">Description</Text>
              <Text
                numberOfLines={descExpanded ? undefined : 3}
                className="font-sans text-sm leading-5 text-body">
                {product.description}
              </Text>
              {product.description.length > 120 ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)}>
                  <Text className="font-sans-bold text-xs uppercase tracking-wide text-ink">
                    {descExpanded ? 'Read Less' : 'Read More'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {specRows.length > 0 ? (
            <View className="overflow-hidden rounded-xl border border-border">
              <Pressable
                onPress={() => setSpecsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: specsOpen }}
                className="flex-row items-center justify-between bg-surface p-4 active:opacity-70">
                <Text className="font-sans-semibold text-lg text-ink">Tech Specs</Text>
                <Icon name={specsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.ink} />
              </Pressable>
              {specsOpen ? (
                <View className="gap-2 px-4 pb-4">
                  {specRows.map((row, i) => (
                    <View key={i} className={`flex-row gap-3 ${row.label ? 'justify-between' : ''}`}>
                      {row.label ? (
                        <>
                          <Text className="font-sans text-sm text-muted">{row.label}</Text>
                          <Text className="font-sans text-sm text-body">{row.value}</Text>
                        </>
                      ) : (
                        <Text className="font-sans text-sm text-body">{row.value}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <PolicyLinks />

          {relatedProducts.length > 0 ? (
            <View className="gap-3 border-t border-border pt-6">
              <Text className="font-sans-semibold text-lg text-ink">You May Also Like</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-3">
                  {relatedProducts.map((related) => (
                    <View key={related.id} style={{ width: 160 }}>
                      <ProductCard product={related} />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          <View className="gap-4" onLayout={(e) => (reviewsY.current = e.nativeEvent.layout.y)}>
            <View className="flex-row items-center justify-between">
              <Text className="font-sans-semibold text-lg text-ink">Reviews</Text>
              {reviews.length > 0 ? (
                <Pressable
                  onPress={() =>
                    scrollRef.current?.scrollTo({ y: reviewsY.current, animated: true })
                  }
                  className="active:opacity-60">
                  <Text className="font-sans-bold text-xs tracking-wide text-ink">View All</Text>
                </Pressable>
              ) : null}
            </View>

            {reviewCount > 0 ? (
              <View className="flex-row items-center gap-4 rounded-xl bg-surface-muted p-4">
                <View className="items-center gap-0.5">
                  <Text className="font-sans-bold text-2xl text-ink">{avgRating.toFixed(1)}</Text>
                  <Stars rating={avgRating} size={11} />
                </View>
                <View className="flex-1 gap-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const starCount = ratingStats[star] || 0;
                    const pct = reviewCount > 0 ? (starCount / reviewCount) * 100 : 0;
                    return (
                      <View key={star} className="flex-row items-center gap-1.5">
                        <Text className="w-2 font-sans text-[11px] text-muted">{star}</Text>
                        <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                          <View
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </View>
                        <Text className="w-5 text-right font-sans text-[11px] text-muted">
                          {starCount}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {reviews.length === 0 ? (
              <View className="items-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-surface-muted p-8">
                <Icon name="star-filled" size={24} color={c.primary} style={{ marginBottom: 4 }} />
                <Text className="font-sans-semibold text-[15px] text-ink">No reviews yet</Text>
                <Text className="text-center font-sans text-[13px] text-muted">
                  Have you purchased this product? Share your thoughts!
                </Text>
              </View>
            ) : (
              <ReviewsList key={id} productId={String(id)} reviews={reviews} userId={user?.uid} />
            )}
          </View>

          <ProductQA key={id} productId={String(id)} userId={user?.uid} />
        </ScrollView>

        <View
          className="flex-row items-center gap-4 border-t border-border bg-surface px-5 py-4"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          }}>
          {isOutOfStock ? (
            <Pressable
              onPress={handleToggleStockAlert}
              disabled={alertBusy}
              className="h-12 w-[135px] flex-row items-center justify-center gap-1.5 rounded-full border active:opacity-70"
              style={{ borderColor: hasAlert ? c.primary : c.borderStrong, opacity: alertBusy ? 0.5 : 1 }}>
              <Icon name={hasAlert ? 'bell-off' : 'bell'} size={15} color={hasAlert ? c.primary : c.muted} />
              <Text className="font-sans-bold text-sm" style={{ color: hasAlert ? c.primary : c.muted }}>
                {hasAlert ? 'Notifying' : 'Notify Me'}
              </Text>
            </Pressable>
          ) : currentCartItem ? (
            <View className="h-12 w-[135px] flex-row items-center justify-between overflow-hidden rounded-full border border-ink">
              <Pressable
                onPress={handleDecrement}
                accessibilityLabel="Decrease quantity"
                className="h-full w-11 items-center justify-center active:opacity-60">
                <Icon name="minus" size={16} color={c.ink} />
              </Pressable>
              <Text className="min-w-[20px] text-center font-sans-bold text-base text-ink">
                {currentCartItem.quantity}
              </Text>
              <Pressable
                onPress={handleIncrement}
                disabled={currentCartItem.quantity >= displayStock}
                accessibilityLabel="Increase quantity"
                className="h-full w-11 items-center justify-center active:opacity-60"
                style={{ opacity: currentCartItem.quantity >= displayStock ? 0.3 : 1 }}>
                <Icon name="plus" size={16} color={c.ink} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleAddToCart}
              className="h-12 w-[135px] items-center justify-center rounded-full border border-ink active:opacity-70">
              <Text className="font-sans-bold text-base text-ink">Add to Cart</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleBuyNow}
            className="h-12 flex-1 items-center justify-center rounded-full bg-primary active:opacity-80"
            style={{
              // Source: `0px 10px 15px -3px`/`0px 4px 6px -4px` of primary@20%.
              shadowColor: c.primary,
              shadowOpacity: 0.2,
              shadowRadius: 15,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
            }}>
            <Text className="font-sans-bold text-base text-inverse">Buy Now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}