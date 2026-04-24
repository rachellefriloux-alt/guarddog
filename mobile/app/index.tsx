import React, { useEffect, useState } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CameraView from './CameraView';
import TimelineScreen, { type TimelineEvent } from './TimelineScreen';
import EventViewerScreen from './EventViewerScreen';
import { registerPushToken, onNotificationTap } from './notifications';

/**
 * Top-level navigation:
 *   - Pairing screen (no serverUrl yet)
 *   - Timeline (default)
 *   - Event viewer (tap a card OR push notification with eventId)
 *   - Camera live view (push notification with cameraId, or "Open live view"
 *     from the event viewer)
 */
export default function App() {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  const [viewerEvents, setViewerEvents] = useState<TimelineEvent[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('serverUrl').then((v) => {
      if (v) setServerUrl(v);
    });
  }, []);

  // Once paired, register the Expo push token with the backend and listen
  // for notification taps so we can deep-link into the right screen.
  useEffect(() => {
    if (!serverUrl) return;
    registerPushToken(serverUrl);
    const unsubscribe = onNotificationTap((data) => {
      const eventId = typeof data?.eventId === 'string' ? data.eventId : null;
      const cameraId = typeof data?.cameraId === 'string' ? data.cameraId : null;
      // Prefer event deep-link (richer landing) and fall back to camera.
      if (eventId) setPendingEventId(eventId);
      else if (cameraId) setActiveCamera(cameraId);
    });
    return unsubscribe;
  }, [serverUrl]);

  if (!serverUrl) {
    return (
      <View style={{ padding: 20, marginTop: 80 }}>
        <Text style={{ fontSize: 20, marginBottom: 20 }}>GuardDog Mobile</Text>
        <TextInput
          placeholder="Enter server URL"
          value={input}
          onChangeText={setInput}
          style={{ borderWidth: 1, padding: 10 }}
        />
        <Button
          title="Save"
          onPress={() => {
            SecureStore.setItemAsync('serverUrl', input);
            setServerUrl(input);
          }}
        />
      </View>
    );
  }

  if (viewerEvents) {
    return (
      <EventViewerScreen
        serverUrl={serverUrl}
        events={viewerEvents}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerEvents(null)}
        onOpenLiveView={(cameraId) => {
          setActiveCamera(cameraId);
          setViewerEvents(null);
        }}
      />
    );
  }

  if (activeCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView cameraId={activeCamera} serverUrl={serverUrl} />
        <View style={{ padding: 12, backgroundColor: '#15151a' }}>
          <Button title="Back to timeline" onPress={() => setActiveCamera(null)} />
        </View>
      </View>
    );
  }

  return (
    <TimelineScreen
      serverUrl={serverUrl}
      autoOpenEventId={pendingEventId}
      onSelectEvent={(event, index, all) => {
        setViewerEvents(all);
        setViewerIndex(index);
        setPendingEventId(null);
      }}
    />
  );
}
