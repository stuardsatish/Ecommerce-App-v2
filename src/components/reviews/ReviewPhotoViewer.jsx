import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';

// A photo viewer is black whatever the app theme, so these are literals rather
// than theme tokens.
const WHITE = '#FFFFFF';

/**
 * Full-screen gallery for a review's photos. Mount it only while open (the
 * parent renders it conditionally), so `startIndex` is read once per opening.
 * Swipe or use the arrows to move between photos; tapping a photo (or the
 * close button / hardware back) dismisses it.
 * @param {{ photos: string[], startIndex?: number, onClose: () => void }} props
 */
export function ReviewPhotoViewer({ photos, startIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);
  const [index, setIndex] = useState(startIndex);
  const count = photos.length;

  const goTo = (next) => {
    if (next < 0 || next >= count) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1" style={{ backgroundColor: '#000000' }}>
        <SafeAreaView className="flex-1">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="font-sans-semibold text-sm" style={{ color: WHITE }}>
              {index + 1} / {count}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close photo viewer"
              hitSlop={10}
              className="active:opacity-60">
              <Icon name="x" size={24} color={WHITE} />
            </Pressable>
          </View>

          <View className="flex-1 justify-center">
            <FlatList
              ref={listRef}
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              keyExtractor={(uri, i) => `${i}-${uri}`}
              initialScrollIndex={startIndex}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => (
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close photo viewer"
                  style={{ width, height: Math.round(height * 0.7) }}>
                  <Image source={{ uri: item }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                </Pressable>
              )}
            />

            {count > 1 && index > 0 ? (
              <Pressable
                onPress={() => goTo(index - 1)}
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                hitSlop={8}
                className="absolute left-3 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Icon name="chevron-left" size={22} color={WHITE} />
              </Pressable>
            ) : null}
            {count > 1 && index < count - 1 ? (
              <Pressable
                onPress={() => goTo(index + 1)}
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                hitSlop={8}
                className="absolute right-3 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Icon name="chevron-right" size={22} color={WHITE} />
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}