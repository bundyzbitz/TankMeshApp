// React store: single global instance that owns the tank list, BLE service,
// and settings. Uses useSyncExternalStore for tearing-free reads.

import { useSyncExternalStore } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { TankMeshBle, TankMeshBleStatus, AdvEvent } from '../ble/tankMeshBle';
import { makeMockTanks, tickMockTanks, appendAndPruneHistory } from '../ble/mockData';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  getDisplayOrder,
  setDisplayOrder,
  getThresholds,
  setThresholds,
} from './persist';
import { AppSettings, Tank, MAX_TANKS, TankCal, TankMesh } from '../types';

type State = {
  tanks: Tank[];
  settings: AppSettings;
  bleStatus: TankMeshBleStatus;
  bleError: string | null;
  bleAvailable: boolean;
  hydrated: boolean;
};

class TankStore {
  private state: State = {
    tanks: [],
    settings: DEFAULT_SETTINGS,
    bleStatus: 'idle',
    bleError: null,
    bleAvailable: false,
    hydrated: false,
  };
  private listeners = new Set<() => void>();
  private ble = new TankMeshBle();
  private demoTimer: any = null;
  private started = false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): State => this.state;

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async init() {
    if (this.started) return;
    this.started = true;
    const settings = await loadSettings();
    this.set({ settings, hydrated: true, bleAvailable: this.ble.available });

    this.ble.init(this.onAdv, this.onStatus);

    if (settings.demoMode || !this.ble.available) {
      this.startDemo();
    } else {
      await this.ble.startScan();
    }
  }

  destroy() {
    this.stopDemo();
    this.ble.destroy();
  }

  // ---------- BLE callbacks ----------
  private onAdv = async (e: AdvEvent) => {
    const list = this.state.tanks.slice();
    let idx = list.findIndex((t) => t.mac === e.mac);
    if (idx < 0) {
      if (list.length >= MAX_TANKS) return;
      const [displayOrder, thresholds] = await Promise.all([
        getDisplayOrder(e.mac),
        getThresholds(e.mac),
      ]);
      const now = Date.now();
      const fresh: Tank = {
        mac: e.mac,
        name: '',
        colorRGB: 0x808080,
        levelPercent: e.adv.levelPercent,
        batteryMv: e.adv.batteryMv,
        counter: e.adv.counter,
        advSettingsVersion: e.adv.settingsVersion,
        cachedSettingsVersion: 0xFE,
        flags: e.adv.flags,
        lastSeenMs: now,
        rssi: e.rssi,
        displayOrder,
        minThreshold: thresholds.min,
        maxThreshold: thresholds.max,
        calMeshKnown: false,
        history: [{ t: now, level: e.adv.levelPercent }],
        // v2 adverts carry raw/filtered ADC inline — seed the diag block
        // so the detail screen can show them before the GATT pull lands.
        diag: e.adv.rawAdc != null && e.adv.filteredAdc != null ? {
          rawAdc: e.adv.rawAdc,
          filteredAdc: e.adv.filteredAdc,
          isCalibrated: false,
          settingsVersion: e.adv.settingsVersion,
          batteryMillivolts: e.adv.batteryMv,
        } : undefined,
      };
      list.push(fresh);
      idx = list.length - 1;
      this.set({ tanks: list });
      // pull GATT settings (name, color, cal, mesh) once
      this.pullSettings(fresh.mac);
      return;
    }
    const cur = list[idx];
    // v2 adverts carry raw/filtered ADC inline — merge them into the
    // existing diag block on every advert so the Raw ADC readout stays
    // live without needing a GATT pull. v1 adverts omit these fields,
    // so cur.diag (populated by the Diag characteristic read) is left
    // untouched for v1 sensors.
    const diag =
      e.adv.rawAdc != null && e.adv.filteredAdc != null
        ? {
            ...(cur.diag ?? {
              isCalibrated: false,
              settingsVersion: e.adv.settingsVersion,
              batteryMillivolts: e.adv.batteryMv,
            }),
            rawAdc: e.adv.rawAdc,
            filteredAdc: e.adv.filteredAdc,
            batteryMillivolts: e.adv.batteryMv,
            settingsVersion: e.adv.settingsVersion,
          }
        : cur.diag;
    const next: Tank = {
      ...cur,
      levelPercent: e.adv.levelPercent,
      batteryMv: e.adv.batteryMv,
      counter: e.adv.counter,
      advSettingsVersion: e.adv.settingsVersion,
      flags: e.adv.flags,
      lastSeenMs: Date.now(),
      rssi: e.rssi,
      diag,
      history: appendAndPruneHistory(cur.history, { t: Date.now(), level: e.adv.levelPercent }),
    };
    list[idx] = next;
    this.set({ tanks: list });
    // Threshold edge detection — fire haptic only on *crossing* so a tank
    // that stays below min doesn't keep buzzing every advert.
    this.checkThresholdCrossing(cur, next);
    // If sensor bumped its settings version, re-pull
    if (next.advSettingsVersion !== next.cachedSettingsVersion) {
      this.pullSettings(next.mac);
    }
  };

  private alertState = new Map<string, 'ok' | 'below' | 'above'>();

  private checkThresholdCrossing(prev: Tank, next: Tank) {
    if (!this.state.settings.alertsEnabled) return;
    const classify = (t: Tank): 'ok' | 'below' | 'above' => {
      if (t.minThreshold != null && t.levelPercent < t.minThreshold) return 'below';
      if (t.maxThreshold != null && t.levelPercent > t.maxThreshold) return 'above';
      return 'ok';
    };
    const was = this.alertState.get(next.mac) ?? classify(prev);
    const now = classify(next);
    this.alertState.set(next.mac, now);
    // Only buzz on a transition into an alarm state (ok -> below/above),
    // not on continued alarm or recovery.
    if (now !== 'ok' && was !== now) {
      this.fireAlert();
    }
  }

  private fireAlert() {
    if (Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Two short follow-up pulses so it reads as "attention" not just a tap.
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 220);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 440);
    } catch {
      /* haptics not available on this device - ignore */
    }
  }

  private onStatus = (s: TankMeshBleStatus, msg?: string) => {
    this.set({ bleStatus: s, bleError: msg ?? null });
  };

  private pullSettings = async (mac: string) => {
    if (!this.ble.available) return;
    try {
      const r = await this.ble.syncTank(mac);
      this.updateTank(mac, (t) => ({
        ...t,
        name: r.name ?? t.name,
        colorRGB: r.colorRGB ?? t.colorRGB,
        cal: r.cal ?? t.cal,
        mesh: r.mesh ?? t.mesh,
        diag: r.diag ?? t.diag,
        calMeshKnown: !!(r.cal && r.mesh) || t.calMeshKnown,
        cachedSettingsVersion: r.diag?.settingsVersion ?? t.cachedSettingsVersion,
      }));
    } catch (err: any) {
      // silent — will retry next adv
      console.log('pullSettings error', mac, err?.message);
    }
  };

  // ---------- Public actions ----------
  updateTank(mac: string, updater: (t: Tank) => Tank) {
    const list = this.state.tanks.slice();
    const idx = list.findIndex((t) => t.mac === mac);
    if (idx < 0) return;
    list[idx] = updater(list[idx]);
    this.set({ tanks: list });
  }

  async setDisplayOrder(mac: string, order: number) {
    await setDisplayOrder(mac, order);
    this.updateTank(mac, (t) => ({ ...t, displayOrder: order }));
  }

  async setThresholds(mac: string, min: number | null, max: number | null) {
    await setThresholds(mac, min, max);
    this.updateTank(mac, (t) => ({ ...t, minThreshold: min, maxThreshold: max }));
    // Reset edge state so the next out-of-range advert buzzes once.
    this.alertState.delete(mac);
  }

  async setViewMode(mode: 'list' | 'grid') {
    const s = { ...this.state.settings, viewMode: mode };
    await saveSettings(s);
    this.set({ settings: s });
  }

  async setAlertsEnabled(enabled: boolean) {
    const s = { ...this.state.settings, alertsEnabled: enabled };
    await saveSettings(s);
    this.set({ settings: s });
  }

  async setScreenGroupLabel(group: string) {
    const s = { ...this.state.settings, screenGroupLabel: group || 'TankMesh' };
    await saveSettings(s);
    this.set({ settings: s });
  }

  async setDemoMode(demo: boolean) {
    const s = { ...this.state.settings, demoMode: demo };
    await saveSettings(s);
    this.set({ settings: s, tanks: [] });
    if (demo) {
      this.ble.stopScan();
      this.startDemo();
    } else {
      this.stopDemo();
      if (this.ble.available) await this.ble.startScan();
    }
  }

  async writeNameColor(mac: string, name: string, colorRGB: number) {
    if (this.state.settings.demoMode || !this.ble.available) {
      this.updateTank(mac, (t) => ({ ...t, name, colorRGB }));
      return;
    }
    const r = await this.ble.syncTank(mac, { writeNameColor: { name, colorRGB } });
    this.updateTank(mac, (t) => ({
      ...t,
      name: r.name ?? name,
      colorRGB: r.colorRGB ?? colorRGB,
      cal: r.cal ?? t.cal,
      mesh: r.mesh ?? t.mesh,
      diag: r.diag ?? t.diag,
      calMeshKnown: !!(r.cal && r.mesh) || t.calMeshKnown,
    }));
  }

  async writeCal(mac: string, cal: TankCal) {
    if (this.state.settings.demoMode || !this.ble.available) {
      this.updateTank(mac, (t) => ({ ...t, cal, calMeshKnown: true }));
      return;
    }
    const r = await this.ble.syncTank(mac, { writeCal: cal });
    this.updateTank(mac, (t) => ({ ...t, cal: r.cal ?? cal, diag: r.diag ?? t.diag }));
  }

  async writeMesh(mac: string, mesh: TankMesh) {
    if (this.state.settings.demoMode || !this.ble.available) {
      this.updateTank(mac, (t) => ({ ...t, mesh, calMeshKnown: true }));
      return;
    }
    const r = await this.ble.syncTank(mac, { writeMesh: mesh });
    this.updateTank(mac, (t) => ({ ...t, mesh: r.mesh ?? mesh, diag: r.diag ?? t.diag }));
  }

  async refreshTank(mac: string) {
    if (this.state.settings.demoMode || !this.ble.available) return;
    await this.pullSettings(mac);
  }

  // ---------- Demo mode ----------
  private startDemo() {
    this.set({ tanks: makeMockTanks(), bleStatus: 'idle' });
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = setInterval(() => {
      this.set({ tanks: tickMockTanks(this.state.tanks) });
    }, 2000);
  }
  private stopDemo() {
    if (this.demoTimer) { clearInterval(this.demoTimer); this.demoTimer = null; }
  }
}

export const tankStore = new TankStore();

export function useTankStore(): State {
  return useSyncExternalStore(tankStore.subscribe, tankStore.getSnapshot, tankStore.getSnapshot);
}

// derived helpers
export function selectMatchingTanks(state: State): Tank[] {
  const g = state.settings.screenGroupLabel;
  const filtered = state.tanks.filter((t) => !!t.mesh && t.mesh.prefix === g);
  return filtered.sort((a, b) => (a.displayOrder - b.displayOrder));
}

export function selectAllTanks(state: State): Tank[] {
  return state.tanks.slice().sort((a, b) => a.displayOrder - b.displayOrder);
}
