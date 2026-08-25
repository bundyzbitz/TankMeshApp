// Mock data provider for demo mode / Expo Go (BLE not available).
// Simulates 4 tanks broadcasting every ~2s.

import { Tank } from '../types';

export function makeMockTanks(): Tank[] {
  const now = Date.now();
  const mk = (i: number, name: string, color: number, level: number, mv: number, group = 'TankMesh'): Tank => ({
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
  });
  return [
    mk(0, 'Fresh Water', 0x2AB7FF, 78, 4050),
    mk(1, 'Grey Water',  0x8E8E93, 42, 3980),
    mk(2, 'Black Water', 0x6B4E2E, 15, 3720),
    mk(3, 'Diesel',      0xF0B429, 63, 4110),
  ];
}

// Randomly nudge levels so the UI shows life in demo mode.
export function tickMockTanks(tanks: Tank[]): Tank[] {
  return tanks.map((t) => ({
    ...t,
    levelPercent: Math.max(0, Math.min(100, t.levelPercent + Math.round((Math.random() - 0.5) * 3))),
    counter: t.counter + 1,
    lastSeenMs: Date.now(),
  }));
}
