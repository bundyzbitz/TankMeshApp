// Zustand-free lightweight store using React context + AsyncStorage persistence
// for tank customizations (display order per MAC) and app settings.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';

const KEY_SETTINGS = 'tankmesh.settings';
const KEY_ORDER    = 'tankmesh.order.';     // + MAC
const KEY_MIN      = 'tankmesh.min.';       // + MAC
const KEY_MAX      = 'tankmesh.max.';       // + MAC

export const DEFAULT_SETTINGS: AppSettings = {
  visibleGroups: ['TankMesh'],
  demoMode: false,
  viewMode: 'list',
  alertsEnabled: true,
  notificationsEnabled: true,
  notificationsPermitted: false,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & { screenGroupLabel?: string };
    const merged: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };
    // Migrate legacy single-group config -> visibleGroups list
    if ((!parsed.visibleGroups || parsed.visibleGroups.length === 0) && parsed.screenGroupLabel) {
      merged.visibleGroups = [parsed.screenGroupLabel];
    }
    if (!merged.visibleGroups || merged.visibleGroups.length === 0) {
      merged.visibleGroups = ['TankMesh'];
    }
    delete merged.screenGroupLabel;
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

export async function getDisplayOrder(mac: string): Promise<number> {
  const v = await AsyncStorage.getItem(KEY_ORDER + mac);
  const n = v ? parseInt(v, 10) : 255;
  return isNaN(n) ? 255 : n;
}

export async function setDisplayOrder(mac: string, order: number): Promise<void> {
  await AsyncStorage.setItem(KEY_ORDER + mac, String(Math.max(0, Math.min(255, order))));
}

export async function getThresholds(mac: string): Promise<{ min: number | null; max: number | null }> {
  const [minRaw, maxRaw] = await Promise.all([
    AsyncStorage.getItem(KEY_MIN + mac),
    AsyncStorage.getItem(KEY_MAX + mac),
  ]);
  const parse = (v: string | null) => {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : Math.max(0, Math.min(100, n));
  };
  return { min: parse(minRaw), max: parse(maxRaw) };
}

export async function setThresholds(mac: string, min: number | null, max: number | null): Promise<void> {
  const w = (key: string, v: number | null) =>
    v == null
      ? AsyncStorage.removeItem(key)
      : AsyncStorage.setItem(key, String(Math.max(0, Math.min(100, v))));
  await Promise.all([w(KEY_MIN + mac, min), w(KEY_MAX + mac, max)]);
}
