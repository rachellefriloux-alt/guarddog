/**
 * Mobile event viewer with clip playback, AI bbox overlay, swipe-to-paginate
 * between events, and a deep-link "Open live view" affordance.
 *
 * The component is fully controlled — the parent owns the active index so
 * the back stack and push deep-links can scroll the carousel directly.
 */
import React, { useMemo, useRef } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import Video from 'react-native-video';
import type { TimelineEvent } from './TimelineScreen';

interface Props {
  serverUrl: string;
  events: TimelineEvent[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onOpenLiveView?: (cameraId: string) => void;
}

function absUrl(serverUrl: string, maybeRelative: string | null | undefined): string | null {
  if (!maybeRelative) return null;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith('/')) return serverUrl.replace(/\/+$/, '') + maybeRelative;
  return maybeRelative;
}

export default function EventViewerScreen({
  serverUrl,
  events,
  index,
  onIndexChange,
  onClose,
  onOpenLiveView,
}: Props) {
  const width = Dimensions.get('window').width;
  const listRef = useRef<FlatList<TimelineEvent>>(null);

  const safeIndex = Math.max(0, Math.min(events.length - 1, index));
  const active: TimelineEvent | undefined = events[safeIndex];

  // Keep the carousel in sync with the controlled index (e.g. when the
  // parent jumps to a deep-linked event).
  React.useEffect(() => {
    if (!events.length) return;
    listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
  }, [events.length, safeIndex]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first && typeof first.index === 'number') onIndexChange(first.index);
  }).current;

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [],
  );

  if (!active) return null;

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <View
        style={{
          padding: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14, flex: 1 }} numberOfLines={1}>
          {(active.cameraName || active.cameraId || 'unknown') +
            ' • ' +
            new Date(active.timestamp).toLocaleString()}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: '#aaa', fontSize: 14, marginLeft: 12 }}>Close</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={events}
        keyExtractor={(e) => e.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={safeIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <View style={{ width, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width, aspectRatio: 16 / 9, position: 'relative' }}>
              {item.clipUrl ? (
                <Video
                  source={{ uri: absUrl(serverUrl, item.clipUrl) ?? '' }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                  controls
                  paused={item.id !== active.id}
                />
              ) : item.thumbnailUrl ? (
                <Image
                  source={{ uri: absUrl(serverUrl, item.thumbnailUrl) ?? '' }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#888' }}>No media available</Text>
                </View>
              )}
              {(item.ai?.boxes ?? []).map((b, i) => (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    left: `${Math.max(0, Math.min(1, b.x)) * 100}%`,
                    top: `${Math.max(0, Math.min(1, b.y)) * 100}%`,
                    width: `${Math.max(0, Math.min(1, b.w)) * 100}%`,
                    height: `${Math.max(0, Math.min(1, b.h)) * 100}%`,
                  }}
                />
              ))}
            </View>
          </View>
        )}
      />

      <View style={{ padding: 12 }}>
        <Text style={{ color: '#fff' }}>Type: {active.type}</Text>
        {active.ai?.score != null && (
          <Text style={{ color: '#fff' }}>
            Confidence: {Math.round((active.ai.score ?? 0) * 100)}%
          </Text>
        )}
        <Text style={{ color: '#666', marginTop: 4, fontSize: 12 }}>
          {`Event ${safeIndex + 1} of ${events.length} — swipe to navigate`}
        </Text>
        {onOpenLiveView && active.cameraId && (
          <TouchableOpacity
            onPress={() => onOpenLiveView(active.cameraId as string)}
            style={{ marginTop: 12 }}
          >
            <Text style={{ color: '#4ade80' }}>Open live view</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
