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
import {
  requestNotificationPermission,
  fireTankAlert,
  notificationsSupported,
  ensureNotificationChannel,
} from '../notifications/local';

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

    // Register Android notification channel so the OS permission prompt
    // can appear on first threshold crossing. Do NOT request permission
    // here — ask contextually when the user turns on notifications.
    if (notificationsSupported()) {
      await ensureNotificationChannel();
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
    // Auto-discover new groups so freshly-powered-on sensors show up on
    // the overview without the user having to open Settings and add them.
    this.autoAddGroup(next);
    // If sensor bumped its settings version, re-pull
    if (next.advSettingsVersion !== next.cachedSettingsVersion) {
      this.pullSettings(next.mac);
    }
  };

  private autoAddGroup(tank: Tank) {
    const g = tank.mesh?.prefix;
    if (!g) return;
    if (this.state.settings.visibleGroups.includes(g)) return;
    // Don't await — fire-and-forget persistence
    this.setVisibleGroups([...this.state.settings.visibleGroups, g]);
  }

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
      this.fireAlert(next, now);
    }
  }

  private fireAlert(tank: Tank, kind: 'below' | 'above') {
    if (Platform.OS !== 'web') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 220);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 440);
      } catch {
        /* haptics not available on this device - ignore */
      }
    }
    // Lock-screen notification — only if the user has enabled them and the
    // OS has granted permission. Falls through silently otherwise.
    const s = this.state.settings;
    if (s.notificationsEnabled && s.notificationsPermitted) {
      const name = tank.name || `Tank ${tank.mac.slice(-5)}`;
      const title = kind === 'below' ? `${name} is low` : `${name} is high`;
      const body =
        kind === 'below'
          ? `Level ${tank.levelPercent}% dropped below your ${tank.minThreshold}% alert threshold.`
          : `Level ${tank.levelPercent}% rose above your ${tank.maxThreshold}% alert threshold.`;
      fireTankAlert(title, body);
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
      // Mesh prefix is only known after the first successful GATT read on a
      // real BLE sensor — auto-add it here too.
      const after = this.state.tanks.find((t) => t.mac === mac);
      if (after) this.autoAddGroup(after);
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

  async setScreenGroupLabel(_group: string) {
    // Deprecated — group filtering now uses visibleGroups. Kept as a no-op
    // so any lingering caller doesn't crash.
  }

  async setVisibleGroups(groups: string[]) {
    const dedup = Array.from(new Set(groups.map((g) => g.trim()).filter(Boolean)));
    const s = { ...this.state.settings, visibleGroups: dedup.length ? dedup : ['TankMesh'] };
    // Update state synchronously first so queued autoAddGroup calls read
    // the up-to-date list instead of racing with the AsyncStorage write.
    this.set({ settings: s });
    saveSettings(s).catch(() => { /* best effort */ });
  }

  async toggleGroupVisibility(group: string) {
    const g = group.trim();
    if (!g) return;
    const cur = this.state.settings.visibleGroups;
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g];
    await this.setVisibleGroups(next);
  }

  async addGroup(group: string) {
    const g = group.trim();
    if (!g) return;
    if (this.state.settings.visibleGroups.includes(g)) return;
    await this.setVisibleGroups([...this.state.settings.visibleGroups, g]);
  }

  async removeGroup(group: string) {
    const g = group.trim();
    const next = this.state.settings.visibleGroups.filter((x) => x !== g);
    await this.setVisibleGroups(next);
  }

  async setNotificationsEnabled(enabled: boolean) {
    if (enabled) {
      const granted = await requestNotificationPermission();
      const s = {
        ...this.state.settings,
        notificationsEnabled: granted,
        notificationsPermitted: granted,
      };
      await saveSettings(s);
      this.set({ settings: s });
    } else {
      const s = { ...this.state.settings, notificationsEnabled: false };
      await saveSettings(s);
      this.set({ settings: s });
    }
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
    const tanks = makeMockTanks();
    this.set({ tanks, bleStatus: 'idle' });
    // Auto-add every demo tank's group so the overview isn't empty on
    // first run with demoMode on.
    tanks.forEach((t) => this.autoAddGroup(t));
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
  const groups = state.settings.visibleGroups;
  const filtered = state.tanks.filter((t) => !!t.mesh && groups.includes(t.mesh.prefix));
  return filtered.sort((a, b) => (a.displayOrder - b.displayOrder));
}

export function selectAllTanks(state: State): Tank[] {
  return state.tanks.slice().sort((a, b) => a.displayOrder - b.displayOrder);
}

// Every distinct group label this phone has heard from a sensor, union'd
// with the user-added groups — drives the group chip row in Settings.
export function selectKnownGroups(state: State): string[] {
  const set = new Set<string>(state.settings.visibleGroups);
  for (const t of state.tanks) {
    if (t.mesh?.prefix) set.add(t.mesh.prefix);
  }
  return Array.from(set).sort();
}
