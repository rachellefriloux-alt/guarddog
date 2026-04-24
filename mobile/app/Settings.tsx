import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Button } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Listed in the PR 8 folder tree alongside the other screens; covers the
// stated Settings surface: server URL, notification preferences, dark mode,
// auto-play video toggle. Preferences persist via expo-secure-store so they
// survive app restarts on iOS and Android.
export default function Settings({ serverUrl }) {
  const [url, setUrl] = useState(serverUrl || '');
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('pref.notifications').then((v) => {
      if (v !== null) setNotifications(v === '1');
    });
    SecureStore.getItemAsync('pref.darkMode').then((v) => {
      if (v !== null) setDarkMode(v === '1');
    });
    SecureStore.getItemAsync('pref.autoPlay').then((v) => {
      if (v !== null) setAutoPlay(v === '1');
    });
  }, []);

  return (
    <View style={{ padding: 20, marginTop: 60 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>Server URL</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 10, marginBottom: 10 }}
      />
      <Button
        title="Save URL"
        onPress={() => {
          SecureStore.setItemAsync('serverUrl', url);
        }}
      />

      <Row
        label="Push notifications"
        value={notifications}
        onChange={(v) => {
          setNotifications(v);
          SecureStore.setItemAsync('pref.notifications', v ? '1' : '0');
        }}
      />
      <Row
        label="Dark mode"
        value={darkMode}
        onChange={(v) => {
          setDarkMode(v);
          SecureStore.setItemAsync('pref.darkMode', v ? '1' : '0');
        }}
      />
      <Row
        label="Auto-play video"
        value={autoPlay}
        onChange={(v) => {
          setAutoPlay(v);
          SecureStore.setItemAsync('pref.autoPlay', v ? '1' : '0');
        }}
      />
    </View>
  );
}

function Row({ label, value, onChange }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
      }}
    >
      <Text>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}
