import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Carousel } from 'react-native-reanimated-carousel';

/**
 * Product photo gallery for the PDP hero. NOTE — this does NOT port an
 * existing web behavior: the source app's mobile ProductDetail.jsx imports
 * Swiper/SwiperSlide but never actually renders a <Swiper> anywhere (dead
 * import — confirmed by grep, only a stray unused `thumbsSwiper` state
 * variable references it). The real mobile-web gallery is a static <img> plus
 * a tap-only thumbnail strip; there's no swipe gesture on web at all.
 *
 * Swipe-to-browse is added here anyway as a standard touch-platform
 * affordance (not a business-logic change — wishlist/variant/cart logic is
 * untouched), which also fulfills MIGRATION_ANALYSIS.md's Phase 9 spec that
 * called for a `react-native-reanimated-carousel`-based gallery. Flagged
 * since it's a UI enhancement beyond strict source parity, not a silent one.
 *
 * Tapping a thumbnail still jumps the main image to that index (ported
 * behavior), and swiping the main image keeps the thumbnail strip in sync.
 */
export function ImageCarousel({ images, activeIndex, onIndexChange }) {
  const carouselRef = useRef(null);
  const [width, setWidth] = useState(0);

  const handleThumbnailPress = (index) => {
    carouselRef.current?.scrollTo({ index, animated: true });
    onIndexChange(index);
  };

  if (images.length === 0) {
    // Defensive guard, not a ported behavior: the web app's plain <img> tag
    // tolerates an empty/undefined src (renders a broken-image icon), but
    // react-native-reanimated-carousel expects a non-empty `data` array.
    return <View className="aspect-square w-full rounded-xl bg-surface-muted" />;
  }

  return (
    <View className="gap-2">
      <View
        className="w-full overflow-hidden rounded-xl bg-surface"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Carousel
            ref={carouselRef}
            itemSize={width}
            style={{ width, height: width }}
            data={images}
            defaultIndex={activeIndex}
            loop={false}
            onSnapToItem={onIndexChange}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={{ width, height: width }}
                contentFit="cover"
                transition={150}
              />
            )}
          />
        )}
      </View>

      {images.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4">
          <View className="flex-row gap-4">
            {images.map((img, i) => (
              <Pressable
                key={i}
                onPress={() => handleThumbnailPress(i)}
                accessibilityLabel={`Show image ${i + 1}`}
                accessibilityRole="button"
                className={`h-20 w-20 items-center justify-center rounded-lg border bg-surface p-2 active:opacity-70 ${
                  i === activeIndex ? 'border-2 border-ink' : 'border-border-strong'
                }`}>
                <Image
                  source={{ uri: img }}
                  style={{ width: 60, height: 60, borderRadius: 4 }}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}