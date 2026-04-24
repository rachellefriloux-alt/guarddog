/**
 * Expo push notification helper.
 *
 * Responsibilities:
 *   1. Ask the OS for notification permission (idempotent).
 *   2. Fetch the device's Expo push token.
 *   3. Cache it in SecureStore so we only re-register on change.
 *   4. POST it to `${serverUrl}/api/push/register`.
 *   5. Configure how foreground notifications surface, plus an Android
 *      channel so background delivery works on Android 8+.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = 'expoPushToken';
const REGISTERED_KEY = 'expoPushTokenRegisteredFor';

// Show banner + play sound when a notification arrives while app is foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('alerts', {
    name: 'GuardDog alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function getOrRequestPushToken() {
  // Push tokens only work on real devices.
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return tokenResp.data;
}

/**
 * Registers the device's push token with the GuardDog backend. Skips the
 * network call if we've already registered the same token against the same
 * server URL, so this is safe to call on every launch.
 */
export async function registerPushToken(serverUrl: string) {
  try {
    const token = await getOrRequestPushToken();
    if (!token) return null;

    const fingerprint = serverUrl + '|' + token;
    const prev = await SecureStore.getItemAsync(REGISTERED_KEY);
    if (prev === fingerprint) return token;

    const res = await fetch(serverUrl + '/api/push/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, deviceLabel: Device.modelName ?? undefined }),
    });
    if (!res.ok) return null;

    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REGISTERED_KEY, fingerprint);
    return token;
  } catch {
    // Push registration is best-effort; failures must not break the app.
    return null;
  }
}

/**
 * Subscribe to taps on incoming notifications. The handler receives the
 * `data` payload the backend attached (cameraId, type, timestamp, ...).
 * Returns an unsubscribe function.
 */
export function onNotificationTap(
  handler: (data: Record<string, unknown>) => void,
) {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data ?? {};
    handler(data as Record<string, unknown>);
  });
  return () => sub.remove();
}
