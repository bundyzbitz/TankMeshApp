// Mock data provider for demo mode / Expo Go (BLE not available).
// Simulates 4 tanks broadcasting every ~2s.

import { Tank } from '../types';

export function makeMockTanks(): Tank[] {
  const now = Date.now();
  // Seed one hour of synthetic history so the chart isn't empty in demo mode.
  const seedHistory = (startLevel: number, drift: number) => {
    const samples: { t: number; level: number }[] = [];
    for (let i = 59; i >= 0; i--) {
      const t = now - i * 60_000; // one sample per minute
      const noise = (Math.random() - 0.5) * 2;
      const level = Math.max(0, Math.min(100, startLevel + drift * (59 - i) / 59 + noise));
      samples.push({ t, level: Math.round(level) });
    }
    return samples;
  };
  const mk = (i: number, name: string, color: number, level: number, mv: number, drift: number, group = 'TankMesh'): Tank => ({
    mac: `DE:MO:${i.toString(16).padStart(2, '0').toUpperCase()}:00:00:0${i}`,
    name,
    colorRGB: color,
    levelPercent: level,
    batteryMv: mv,
    counter: 100 + i,
    advSettingsVersion: 1,
    cachedSettingsVersion: 1,
    flags: 0x04,
    lastSeenMs: now,
    rssi: -55 - i * 3,
    displayOrder: i,
    calMeshKnown: true,
    cal: { autoCalEnabled: true, adcMin: 300, adcMax: 3800 },
    mesh: { prefix: group, sleepIntervalSec: 60 },
    diag: { rawAdc: 1800 + i * 100, filteredAdc: 1810 + i * 100, isCalibrated: true, settingsVersion: 1, batteryMillivolts: mv },
    history: seedHistory(level - drift, drift),
  });
  return [
    mk(0, 'Fresh Water', 0x2AB7FF, 78,  4050, -4),  // slowly draining
    mk(1, 'Grey Water',  0x8E8E93, 42,  3980, +6),  // filling
    mk(2, 'Black Water', 0x6B4E2E, 15,  3720, +2),
    mk(3, 'Diesel',      0xF0B429, 63,  4110, -1),
  ];
}

// Randomly nudge levels so the UI shows life in demo mode.
export function tickMockTanks(tanks: Tank[]): Tank[] {
  const now = Date.now();
  return tanks.map((t) => {
    const level = Math.max(0, Math.min(100, t.levelPercent + Math.round((Math.random() - 0.5) * 3)));
    return {
      ...t,
      levelPercent: level,
      counter: t.counter + 1,
      lastSeenMs: now,
      rssi: Math.max(-95, Math.min(-40, (t.rssi ?? -60) + Math.round((Math.random() - 0.5) * 4))),
      history: appendAndPruneHistory(t.history, { t: now, level }),
    };
  });
}

const HISTORY_WINDOW_MS = 60 * 60 * 1000; // 1 h

export function appendAndPruneHistory(prev: { t: number; level: number }[], sample: { t: number; level: number }): { t: number; level: number }[] {
  const cutoff = sample.t - HISTORY_WINDOW_MS;
  // Keep at most ~240 points (1 every 15s on real BLE; cheaper to render)
  const kept = prev.filter((p) => p.t >= cutoff);
  kept.push(sample);
  if (kept.length > 240) kept.splice(0, kept.length - 240);
  return kept;
}
