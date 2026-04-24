/**
 * Scrollable mobile timeline. Pulls events from the backend list endpoint
 * (which returns either {events: [...]} or a bare array, kept compatible
 * for older deployments) and lets the parent open one in the viewer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface TimelineEvent {
  id: string;
  cameraId: string | null;
  cameraName?: string;
  type: string;
  timestamp: string;
  thumbnailUrl: string | null;
  clipUrl: string | null;
  ai?: { boxes?: Array<{ x: number; y: number; w: number; h: number; label?: string }>; score?: number | null };
  metadata?: Record<string, unknown> | null;
}

interface Props {
  serverUrl: string;
  onSelectEvent: (event: TimelineEvent, index: number, all: TimelineEvent[]) => void;
  /**
   * If set, automatically invokes `onSelectEvent` for the matching event
   * once the list loads. Used for push-notification deep-links.
   */
  autoOpenEventId?: string | null;
}

function absUrl(serverUrl: string, maybeRelative: string | null | undefined): string | null {
  if (!maybeRelative) return null;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith('/')) return serverUrl.replace(/\/+$/, '') + maybeRelative;
  return maybeRelative;
}

export default function TimelineScreen({ serverUrl, onSelectEvent, autoOpenEventId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoOpenedRef = React.useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(serverUrl.replace(/\/+$/, '') + '/api/events');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      const list: TimelineEvent[] = Array.isArray(body) ? body : (body.events ?? []);
      setEvents(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    load();
  }, [load]);

  // Honor a deep-link request once the matching event is loaded.
  useEffect(() => {
    if (!autoOpenEventId || autoOpenedRef.current === autoOpenEventId) return;
    const idx = events.findIndex((e) => e.id === autoOpenEventId);
    if (idx >= 0) {
      autoOpenedRef.current = autoOpenEventId;
      onSelectEvent(events[idx], idx, events);
    }
  }, [autoOpenEventId, events, onSelectEvent]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: 'black' }}
      contentContainerStyle={{ padding: 16 }}
      data={events}
      keyExtractor={(e) => e.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Timeline</Text>
          {error ? <Text style={{ color: '#f87171', marginTop: 4 }}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No events yet.</Text>
      }
      renderItem={({ item, index }) => {
        const thumb = absUrl(serverUrl, item.thumbnailUrl);
        return (
          <TouchableOpacity
            onPress={() => onSelectEvent(item, index, events)}
            style={{
              flexDirection: 'row',
              marginBottom: 12,
              alignItems: 'center',
              backgroundColor: '#15151a',
              borderRadius: 8,
              padding: 8,
            }}
          >
            {thumb ? (
              <Image
                source={{ uri: thumb }}
                style={{ width: 96, height: 54, borderRadius: 4, backgroundColor: '#222' }}
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 54,
                  borderRadius: 4,
                  backgroundColor: '#222',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#666', fontSize: 11 }}>no preview</Text>
              </View>
            )}
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{item.type}</Text>
              <Text style={{ color: '#aaa', fontSize: 12 }}>
                {(item.cameraName || item.cameraId || 'unknown') +
                  ' • ' +
                  new Date(item.timestamp).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
