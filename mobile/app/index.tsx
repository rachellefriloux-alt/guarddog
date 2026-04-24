import React, { useEffect, useState } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CameraView from './CameraView';
import Alerts from './Alerts';

export default function App() {
  const [serverUrl, setServerUrl] = useState(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync('serverUrl').then((v) => {
      if (v) setServerUrl(v);
    });
  }, []);

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

  return <Alerts serverUrl={serverUrl} />;
}
