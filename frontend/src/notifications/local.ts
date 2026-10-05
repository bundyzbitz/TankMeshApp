// Local lock-screen notifications fired on threshold crossings.
// expo-notifications works in both Expo Go and standalone builds for local
// notifications (push requires a dev build). We only lazy-load the module
// so web preview still boots when it isn't available.

import { Platform } from 'react-native';

let Notifications: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  if (Platform.OS !== 'web' && Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch {
  Notifications = null;
}

export const ANDROID_CHANNEL = 'tank-alerts';

export const notificationsSupported = () =>
  !!Notifications && (Platform.OS === 'android' || Platform.OS === 'ios');

export async function ensureNotificationChannel(): Promise<void> {
  if (!notificationsSupported() || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Tank threshold alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF5A5F',
    });
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    await ensureNotificationChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === 3 /* provisional */) return true;
    if (current.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return !!req.granted;
  } catch {
    return false;
  }
}

export async function fireTankAlert(
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: 'high',
      },
      trigger: null, // fire immediately
      ...(Platform.OS === 'android' ? { identifier: undefined } : {}),
    });
  } catch {
    /* notifications unavailable - ignore */
  }
}
