import React from 'react';
import { View } from 'react-native';
import Video from 'react-native-video';

export default function CameraView({ cameraId, serverUrl }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <Video
        source={{ uri: serverUrl + '/api/streams/' + cameraId }}
        style={{ flex: 1 }}
        resizeMode="cover"
        controls
      />
    </View>
  );
}
