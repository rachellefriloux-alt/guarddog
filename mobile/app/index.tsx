import React, { useEffect, useState } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CameraView from './CameraView';
import Alerts from './Alerts';
import { registerPushToken, onNotificationTap } from './notifications';

export default function App() {
  const [serverUrl, setServerUrl] = useState(null);
  const [input, setInput] = useState('');
  const [activeCamera, setActiveCamera] = useState(null);

  useEffect(() => {
    SecureStore.getItemAsync('serverUrl').then((v) => {
      if (v) setServerUrl(v);
    });
  }, []);

  // Once paired, register the Expo push token with the backend and listen
  // for notification taps so we can deep-link into the right CameraView.
  useEffect(() => {
    if (!serverUrl) return;
    registerPushToken(serverUrl);
    const unsubscribe = onNotificationTap((data) => {
      const cameraId = typeof data?.cameraId === 'string' ? data.cameraId : null;
      if (cameraId) setActiveCamera(cameraId);
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

  if (activeCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView cameraId={activeCamera} serverUrl={serverUrl} />
        <View style={{ padding: 12, backgroundColor: '#15151a' }}>
          <Button title="Back to alerts" onPress={() => setActiveCamera(null)} />
        </View>
      </View>
    );
  }

  return <Alerts serverUrl={serverUrl} />;
}
