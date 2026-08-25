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
  // Cached GATT fields (fetched over connection)
  cal?: TankCal;
  mesh?: TankMesh;
  diag?: TankDiag;
  calMeshKnown: boolean;
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
  screenGroupLabel: string;
  demoMode: boolean;
};
