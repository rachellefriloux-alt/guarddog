import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';

export default function Alerts({ serverUrl }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetch(serverUrl + '/api/events')
      .then((r) => r.json())
      .then((data) => setEvents(data));
  }, []);

  return (
    <ScrollView style={{ padding: 20 }}>
      {events.map((e) => (
        <View key={e.id} style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{e.type}</Text>
          <Text>{e.timestamp}</Text>
          <Text>{JSON.stringify(e.metadata)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
