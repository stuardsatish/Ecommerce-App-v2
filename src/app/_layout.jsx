import '@/global.css';

import { Caveat_600SemiBold } from '@expo-google-fonts/caveat/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch, useSelector } from 'react-redux';

import { ToastHost } from '@/components/ToastHost';
import useSessionWatcher from '@/hooks/useSessionWatcher';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initColorScheme } from '@/lib/colorScheme';
import { supabase } from '@/lib/supabase';
import { store } from '@/store';
import { setCart } from '@/store/CartSlice';
import { clearUser, setUser } from '@/store/UserSlice';
import { setWishlist } from '@/store/WishlistSlice';

SplashScreen.preventAutoHideAsync();

// Ported from Ecommerce-sept-1-2026/src/App.jsx — used by loadCartAndWishlist
// below to skip a redundant dispatch when a Realtime-triggered re-fetch
// resolves to the same data Redux already has.
const areCartItemsEqual = (arr1, arr2) => {
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;
    for (const item1 of arr1) {
        const item2 = arr2.find((x) => x.id === item1.id);
        if (!item2) return false;
        if (item1.quantity !== item2.quantity) return false;
        if (item1.price !== item2.price) return false;
        if (Number(item1.storedPrice || 0) !== Number(item2.storedPrice || 0)) return false;
        if (Number(item1.discount || 0) !== Number(item2.discount || 0)) return false;
        if ((item1.discountExpiry || '') !== (item2.discountExpiry || '')) return false;
        if ((item1.variant_id || '') !== (item2.variant_id || '')) return false;
    }
    return true;
};

/**
 * Session-restore bootstrap — ported from Ecommerce-sept-1-2026/src/App.jsx's
 * "AUTH + LOAD USER + CART + WISHLIST" effect (Phase 5 ported the auth half;
 * this phase adds the cart/wishlist half). Gates rendering until the initial
 * session check resolves, exactly like the web app's `authChecked` flag.
 */
function AuthGate({ children }) {
    const dispatch = useDispatch();
    const [authChecked, setAuthChecked] = useState(false);
    const user = useSelector((state) => state.user.user);
    const cartItems = useSelector((state) => state.cart.cartItems);
    const cancelledRef = useRef(false);

    // Keep a ref to current cartItems to prevent infinite listener update loops.
    const cartItemsRef = useRef(cartItems);
    useEffect(() => {
        cartItemsRef.current = cartItems;
    }, [cartItems]);

    useSessionWatcher(user?.uid);

    // Phase 7.2 — push-notification token registration.
    // usePushNotifications handles permission request, EPT registration,
    // and de-registration on sign-out automatically.
    usePushNotifications();

    useEffect(() => {
        let unsubCart = null; // holds the Realtime channel unsubscribe for cart_items

        // Cart is per-row in `cart_items` (one row per user+product), so every
        // event just re-selects the full set for this user — cheap, and it
        // always re-joins `products` for live price/discount/expiry.
        const loadCartAndWishlist = async (uid) => {
            if (unsubCart) {
                unsubCart();
                unsubCart = null;
            }

            let fetchCartTimeout = null;

            const fetchCart = async () => {
                const { data, error } = await supabase
                    .from('cart_items')
                    .select(
                        'quantity, product_id, variant_id, variant_name, price, discount, discount_expiry, title, image, category, products(id, title, price, discount, discount_expiry, stock, thumbnail, image, category, variants)'
                    )
                    .eq('user_id', uid);

                if (error) {
                    console.error('Error loading cart:', error);
                    return;
                }

                const formattedItems = (data || []).map((row) => {
                    const p = row.products || {};
                    const variantId = row.variant_id || '';
                    // Compound id matches CartSlice expectations: productId_variantId for variants
                    const compoundId = variantId ? `${row.product_id}_${variantId}` : row.product_id;
                    const variantObj = (Array.isArray(p.variants) ? p.variants : []).find(
                        (v) => v.id === variantId
                    );
                    const resolvedImage = variantObj?.image || row.image || p.thumbnail || p.image || '';

                    // Stored price & discount snapshot from cart_items row:
                    const storedPrice = Number(row.price != null ? row.price : 0);
                    const storedDiscount = Number(row.discount || 0);
                    const storedDiscountExpiry = row.discount_expiry || '';

                    // Live product price:
                    const livePrice = variantId && variantObj?.price != null
                        ? Number(variantObj.price)
                        : (p.price != null ? Number(p.price) : storedPrice);
                    const liveDiscount = Number(p.discount || 0);
                    const liveDiscountExpiry = p.discount_expiry || '';

                    return {
                        id: compoundId,
                        compound_id: compoundId,
                        productId: row.product_id,
                        variant_id: variantId,
                        variant_name: row.variant_name || '',
                        title: p.title || row.title || '',
                        price: livePrice,
                        storedPrice: storedPrice > 0 ? storedPrice : livePrice,
                        storedDiscount,
                        storedDiscountExpiry,
                        quantity: row.quantity,
                        image: resolvedImage,
                        thumbnail: resolvedImage,
                        stock: variantObj?.stock != null ? Number(variantObj.stock) : p.stock || 0,
                        category: p.category || row.category || 'general',
                        discount: liveDiscount,
                        discountExpiry: liveDiscountExpiry,
                    };
                });

                // Merge with optimistic local state so fast taps aren't rolled back by delayed DB fetches.
                const mergedItems = formattedItems.map((dbItem) => {
                    const localItem = cartItemsRef.current.find(
                        (x) => String(x.id || x.compound_id) === String(dbItem.id)
                    );
                    if (localItem && localItem.quantity > dbItem.quantity) {
                        return { ...dbItem, quantity: localItem.quantity };
                    }
                    return dbItem;
                });

                if (!areCartItemsEqual(mergedItems, cartItemsRef.current)) {
                    dispatch(setCart(mergedItems));
                }
            };

            await fetchCart();

            const debouncedFetchCart = () => {
                if (fetchCartTimeout) clearTimeout(fetchCartTimeout);
                fetchCartTimeout = setTimeout(fetchCart, 300);
            };

            const channel = supabase
                .channel(`cart-items-${uid}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${uid}` },
                    debouncedFetchCart
                )
                .subscribe();

            unsubCart = () => {
                if (fetchCartTimeout) clearTimeout(fetchCartTimeout);
                supabase.removeChannel(channel);
            };

            const { data: wishlistRows, error: wishlistError } = await supabase
                .from('wishlist_items')
                .select('*')
                .eq('user_id', uid);

            if (wishlistError) {
                console.error('Error loading wishlist:', wishlistError);
            } else {
                const wishlistData = (wishlistRows || []).map((row) => ({
                    id: row.product_id,
                    userId: row.user_id,
                    productId: row.product_id,
                    title: row.title,
                    image: row.image,
                    price: row.price,
                    category: row.category,
                    addedAt: row.added_at,
                }));
                dispatch(setWishlist(wishlistData));
            }

            return () => {
                if (unsubCart) unsubCart();
            };
        };

        const handleSession = async (session) => {
            if (cancelledRef.current) return;

            if (session?.user) {
                try {
                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();
                    if (error) throw error;
                    dispatch(setUser({ ...profile, uid: session.user.id }));
                    await loadCartAndWishlist(session.user.id);
                } catch (error) {
                    console.error('Error loading user data:', error);
                }
            } else {
                if (unsubCart) {
                    unsubCart();
                    unsubCart = null;
                }
                dispatch(clearUser());
                dispatch(setCart([]));
                dispatch(setWishlist([]));
            }

            setAuthChecked(true);
        };

        // Defensive addition, not ported from source: on a slow/unreliable
        // mobile connection, `getSession()` can hang while it tries to refresh
        // an expired token over the network before resolving. Without a
        // timeout, `authChecked` would never flip and the root layout would
        // show a blank screen forever (it returns `null` until then) — no
        // error, no retry, nothing. If this fires, `handleSession(null)` runs
        // (safe default: falls through to the login screen); if the real
        // session then resolves late, `handleSession` runs again with the
        // actual session and logs the user in retroactively.
        let sessionSettled = false;
        const timeoutId = setTimeout(() => {
            if (!sessionSettled) handleSession(null);
        }, 8000);
        supabase.auth
            .getSession()
            .then(({ data: { session } }) => {
                sessionSettled = true;
                clearTimeout(timeoutId);
                handleSession(session);
            })
            .catch((err) => {
                // e.g. a network error while refreshing an expired token — fail to
                // "logged out" immediately rather than waiting out the full timeout.
                console.error('getSession failed:', err);
                sessionSettled = true;
                clearTimeout(timeoutId);
                handleSession(null);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            // INITIAL_SESSION is already handled by getSession().then() above.
            if (event === 'INITIAL_SESSION') return;
            handleSession(session);
        });

        return () => {
            cancelledRef.current = true;
            clearTimeout(timeoutId);
            subscription.unsubscribe();
            if (unsubCart) unsubCart();
        };
    }, [dispatch]);

    if (!authChecked) {
        return null;
    }

    return children;
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Caveat_600SemiBold,
    });

    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded]);

    useEffect(() => {
        initColorScheme();
    }, []);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <Provider store={store}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider style={{ flex: 1 }}>
                    <View
                        style={{
                            flex: 1,
                            width: '100%',
                            height: '100%',
                            maxWidth: Platform.OS === 'web' ? 480 : undefined,
                            alignSelf: 'center',
                        }}>
                        <AuthGate>
                            <Stack screenOptions={{ headerShown: false }} />
                        </AuthGate>
                        {/* Outside AuthGate (which renders null until the session check
                    resolves) and a sibling of the navigator, so a toast survives
                    route changes and is available on the auth screens too — the web
                    app mounts <ToastContainer> above <BrowserRouter> for the same
                    reason. */}
                        <ToastHost />
                    </View>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </Provider>
    );
}