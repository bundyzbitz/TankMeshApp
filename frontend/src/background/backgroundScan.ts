// Headless background task: periodically wakes (Android enforces a ~15min
// floor on this regardless of what we request), does a short BLE scan,
// checks any heard tank against its persisted thresholds, and fires a local
// notification on a crossing — all without the app being open.
//
// Uses expo-background-task (NOT the deprecated expo-background-fetch —
// blocked by this project's own install guard, scripts/cmd-guard/rules.js).
//
// This runs in a separate headless JS context each time, so it can't use
// the live TankStore (React state, in-memory alertState Map) at all. It
// talks directly to the same lower-level modules TankStore itself uses
// (TankMeshBle, persist.ts, notifications/local.ts), and keeps its own
// persisted copy of "was this tank already alerting" so repeated wake
// cycles don't re-fire the same alert every 15 minutes while a tank stays
// low — only on the actual crossing, same behavior as the foreground store.

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TankMeshBle, AdvEvent } from '../ble/tankMeshBle';
import { loadSettings, getThresholds } from '../store/persist';
import { fireTankAlert } from '../notifications/local';

export const BACKGROUND_SCAN_TASK = 'tankmesh-background-scan';

// How long each background wake spends actively scanning. Long enough to
// have a reasonable chance of catching sensors on a ~30-60s wake interval;
// sensors on a much longer interval may occasionally be missed on any one
// cycle, which is fine given we run again in ~15 minutes regardless.
const SCAN_WINDOW_MS = 20_000;

const KEY_BG_ALERT_STATE = 'tankmesh.bg.alertstate.'; // + MAC

type AlertState = 'below' | 'above' | 'ok';

async function getBgAlertState(mac: string): Promise<AlertState> {
  const v = await AsyncStorage.getItem(KEY_BG_ALERT_STATE + mac);
  return (v as AlertState) ?? 'ok';
}

async function setBgAlertState(mac: string, state: AlertState): Promise<void> {
  await AsyncStorage.setItem(KEY_BG_ALERT_STATE + mac, state);
}

function classify(levelPercent: number, min: number | null, max: number | null): AlertState {
  if (min != null && levelPercent < min) return 'below';
  if (max != null && levelPercent > max) return 'above';
  return 'ok';
}

async function handleAdvert(e: AdvEvent, nameCache: Map<string, string>) {
  const { min, max } = await getThresholds(e.mac);
  const was = await getBgAlertState(e.mac);
  const now = classify(e.adv.levelPercent, min, max);
  if (now === was) return;
  await setBgAlertState(e.mac, now);
  if (now === 'ok') return; // only alert when entering below/above, not when leaving it

  const name = nameCache.get(e.mac) || `Tank ${e.mac.slice(-5)}`;
  const title = now === 'below' ? `${name} is low` : `${name} is high`;
  const body =
    now === 'below'
      ? `Level ${e.adv.levelPercent}% dropped below your ${min}% alert threshold.`
      : `Level ${e.adv.levelPercent}% rose above your ${max}% alert threshold.`;
  await fireTankAlert(title, body);
}

TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (!settings.notificationsEnabled || !settings.notificationsPermitted) {
      return BackgroundTask.BackgroundTaskResult.Success; // nothing to do, not a failure
    }

    const ble = new TankMeshBle();
    const nameCache = new Map<string, string>(); // best-effort; background task has no GATT name pull

    await new Promise<void>((resolve) => {
      ble.init(
        (e) => {
          handleAdvert(e, nameCache).catch(() => { /* one bad advert shouldn't kill the cycle */ });
        },
        () => { /* ignore status changes - nothing to show the user here */ },
      );
      ble.startScan().catch(() => resolve());
      setTimeout(() => {
        ble.stopScan();
        ble.destroy();
        resolve();
      }, SCAN_WINDOW_MS);
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundScan(): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SCAN_TASK, {
      minimumInterval: 15, // MINUTES — the package's own floor regardless of a lower value
    });
  } catch {
    /* background task registration can fail on some OEM skins even with
       permissions granted — nothing actionable to show the user here, the
       foreground path still works as a fallback */
  }
}

export async function unregisterBackgroundScan(): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
    if (already) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
  } catch {
    /* ignore */
  }
}
