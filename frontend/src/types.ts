export type LevelSample = {
  t: number;     // epoch ms
  level: number; // 0-100
};

export type Tank = {
  mac: string;                // "AA:BB:CC:DD:EE:FF"
  name: string;               // NUL-trimmed
  colorRGB: number;           // 0x00RRGGBB
  levelPercent: number;       // 0-100
  batteryMv: number;          // 0 if not measured
  counter: number;
  advSettingsVersion: number;
  cachedSettingsVersion: number;
  flags: number;              // TM_FLAG_LOW_BATT | TM_FLAG_CAL_VALID | TM_FLAG_ON_BATTERY
  lastSeenMs: number;
  rssi: number | null;
  displayOrder: number;       // 0..255, 255 = unset
  minThreshold: number | null;  // alert when level drops below (0-100), null = disabled
  maxThreshold: number | null;  // alert when level rises above (0-100), null = disabled
  // Cached GATT fields (fetched over connection)
  cal?: TankCal;
  mesh?: TankMesh;
  diag?: TankDiag;
  calMeshKnown: boolean;
  // Rolling level-% history (last ~1 h), appended on every advert
  history: LevelSample[];
};

export type TankCal = {
  autoCalEnabled: boolean;
  adcMin: number;
  adcMax: number;
};

export type TankMesh = {
  prefix: string;             // group label
  sleepIntervalSec: number;
};

export type TankDiag = {
  rawAdc: number;
  filteredAdc: number;
  isCalibrated: boolean;
  settingsVersion: number;
  batteryMillivolts: number;
};

export const TM_FLAG_LOW_BATT = 0x01;
export const TM_FLAG_CAL_VALID = 0x02;
export const TM_FLAG_ON_BATTERY = 0x04;

export const MAX_TANKS = 9;
export const TANKMESH_MFG_ID = 0xFFFF;
export const TANKMESH_MAGIC = 'TM';
export const TANKMESH_PROTO_VERSION = 1;

export const TANKMESH_SERVICE_UUID   = '8f9e1a00-4b2e-4f1a-9c3d-0123456789ab';
export const TANKMESH_NAMECOLOR_UUID = '8f9e1a01-4b2e-4f1a-9c3d-0123456789ab';
export const TANKMESH_CAL_UUID       = '8f9e1a02-4b2e-4f1a-9c3d-0123456789ab';
export const TANKMESH_MESH_UUID      = '8f9e1a03-4b2e-4f1a-9c3d-0123456789ab';
export const TANKMESH_DIAG_UUID      = '8f9e1a04-4b2e-4f1a-9c3d-0123456789ab';

export type AppSettings = {
  // Legacy single-group label; kept for backward compat during migration.
  screenGroupLabel?: string;
  // Group labels this phone is monitoring. A tank shows on the overview
  // iff its mesh.prefix is in this list. Supports monitoring multiple
  // installs (e.g. Boat + RV) from one phone without re-labeling sensors.
  visibleGroups: string[];
  demoMode: boolean;
  viewMode: 'list' | 'grid';
  alertsEnabled: boolean;
  notificationsEnabled: boolean;   // whether the user wants lock-screen notifications
  notificationsPermitted: boolean; // whether the OS has granted permission
};
