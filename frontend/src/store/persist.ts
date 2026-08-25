// Zustand-free lightweight store using React context + AsyncStorage persistence
// for tank customizations (display order per MAC) and app settings.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';

const KEY_SETTINGS = 'tankmesh.settings';
const KEY_ORDER    = 'tankmesh.order.';   // + MAC

export const DEFAULT_SETTINGS: AppSettings = {
  screenGroupLabel: 'TankMesh',
  demoMode: false,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
