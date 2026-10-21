import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ReviewPhotoViewer } from '@/components/reviews/ReviewPhotoViewer';
import { returnsService } from '@/services/returns';

/**
 * Thumbnails of the PRIVATE evidence photos of a request. The bucket is private: each photo is shown through a short-lived signed
 * link created for the signed-in customer only (the storage policy lets a customer read their own folder and nobody else's).
 * `paths` = storage paths from the request's evidence rows. Tap a thumbnail for the full-screen viewer.
 * Twin of the website's features/returns/EvidenceGallery.jsx.
 */
export function EvidenceGallery({ paths, size = 72 }) {
  const [urls, setUrls] = useState({});
  const [failed, setFailed] = useState(false);
  const [viewerAt, setViewerAt] = useState(null);
  // storage paths are <uid>/<request>/<n>-<name>: they never contain '|'
  const key = (paths || []).join('|');

  useEffect(() => {
    let alive = true;
    const list = key ? key.split('|') : [];
    if (list.length === 0) return undefined;
    returnsService
      .signedEvidenceUrls(list)
      .then((u) => {
        if (alive) {
          setUrls(u);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key) return null;
  if (failed) {
    return <Text className="font-sans text-xs text-muted">The photos could not be loaded right now.</Text>;
  }
  const list = key.split('|');
  const ready = list.map((p) => urls[p]).filter(Boolean);

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {list.map((p) =>
          urls[p] ? (
            <Pressable
              key={p}
              onPress={() => setViewerAt(ready.indexOf(urls[p]))}
              accessibilityRole="button"
              accessibilityLabel="Open photo"
              className="active:opacity-70">
              <Image
                source={{ uri: urls[p] }}
                style={{ width: size, height: size, borderRadius: 8 }}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          ) : (
            <View key={p} className="rounded-lg bg-surface-muted" style={{ width: size, height: size }} />
          )
        )}
      </View>
      {viewerAt !== null && viewerAt >= 0 ? (
        <ReviewPhotoViewer photos={ready} startIndex={viewerAt} onClose={() => setViewerAt(null)} />
      ) : null}
    </View>
  );
}