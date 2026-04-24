# GuardDog Mobile

React Native + Expo client for the GuardDog server.

## Develop

```bash
cd mobile
npm install
npm start    # opens Expo dev tools
npm run ios  # or: npm run android
```

On first launch the app prompts for a GuardDog server URL (e.g.
`http://192.168.1.50:5000`). The URL is stored in
[`expo-secure-store`](https://docs.expo.dev/versions/latest/sdk/securestore/)
and reused on subsequent launches.

## Layout

- `app/index.tsx` — entry; pairing screen on first launch, otherwise renders Alerts
- `app/CameraView.tsx` — HLS player via `react-native-video`
- `app/Alerts.tsx` — alerts feed from `/api/events`
- `app/Settings.tsx` — server URL, notification / dark-mode / auto-play preferences

## Backend endpoints used

- `GET /api/devices` — camera list
- `GET /api/streams/:id` — HLS stream
- `GET /api/events` — alert feed
