// TankMesh BLE central. Wraps react-native-ble-plx with:
//   * safe dynamic import so Expo Go doesn't crash
//   * passive scan for manufacturer 0xFFFF "TM" adverts
//   * on-demand connect() to read/write NameColor/Cal/Mesh/Diag characteristics
//
// UI code talks to this through the TankStore hook, never directly.

import { Platform, PermissionsAndroid } from 'react-native';
import {
  TANKMESH_SERVICE_UUID,
  TANKMESH_NAMECOLOR_UUID,
  TANKMESH_CAL_UUID,
  TANKMESH_MESH_UUID,
  TANKMESH_DIAG_UUID,
  TANKMESH_MFG_ID,
  TankCal,
  TankMesh,
} from '../types';
import {
  tryParseAdvAnyFormat,
  decodeNameColor,
  encodeNameColor,
  decodeCal,
  encodeCal,
  decodeMesh,
  encodeMesh,
  decodeDiag,
  ParsedAdv,
} from './protocol';

// Dynamically load the native module. If it's not present (Expo Go / web),
// the manager stays null and every call becomes a no-op — the UI falls back
// to demo mode.
let BleManager: any = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx');
    BleManager = mod?.BleManager ?? null;
  } catch {
    BleManager = null;
  }
}

export type AdvEvent = {
  mac: string;
  rssi: number | null;
  adv: ParsedAdv;
};

export type TankMeshBleStatus =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'permission-denied'
  | 'powered-off'
  | 'scanning'
  | 'error';

export class TankMeshBle {
  private manager: any = null;
  private onAdv: ((e: AdvEvent) => void) | null = null;
  private onStatus: ((s: TankMeshBleStatus, msg?: string) => void) | null = null;
  private started = false;

  get available(): boolean {
    return !!BleManager && (Platform.OS === 'android' || Platform.OS === 'ios');
  }

  init(
    onAdv: (e: AdvEvent) => void,
    onStatus: (s: TankMeshBleStatus, msg?: string) => void,
  ) {
    this.onAdv = onAdv;
    this.onStatus = onStatus;
    if (!this.available) {
      onStatus('unsupported', 'react-native-ble-plx not linked (Expo Go build)');
      return;
    }
    if (!this.manager) {
      try {
        this.manager = new BleManager();
      } catch (err: any) {
        // Native module registration fails in Expo Go — degrade gracefully.
        BleManager = null;
        this.manager = null;
        onStatus('unsupported', `BLE native module missing: ${err?.message ?? err}`);
      }
    }
  }

  private async ensureAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const perms: any[] = [];
    // Android 12+
    perms.push('android.permission.BLUETOOTH_SCAN');
    perms.push('android.permission.BLUETOOTH_CONNECT');
    // Legacy fine location fallback (Android < 12)
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const res = await PermissionsAndroid.requestMultiple(perms);
    const allGranted = Object.values(res).every(
      (v) => v === PermissionsAndroid.RESULTS.GRANTED,
    );
    return allGranted;
  }

  async startScan(): Promise<void> {
    if (!this.available || !this.manager) {
      this.onStatus?.('unsupported');
      return;
    }
    if (this.started) return;
    this.onStatus?.('requesting');
    const ok = await this.ensureAndroidPermissions();
    if (!ok) {
      this.onStatus?.('permission-denied');
      return;
    }
    // Wait until powered on
    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      const sub = this.manager.onStateChange((s: string) => {
        if (s === 'PoweredOn') {
          sub.remove();
          this.beginScan();
        } else if (s === 'PoweredOff') {
          this.onStatus?.('powered-off');
        }
      }, true);
      return;
    }
    this.beginScan();
  }

  private beginScan() {
    if (!this.manager) return;
    this.started = true;
    this.onStatus?.('scanning');
    // scan with null UUID filter — we filter by manufacturer bytes ourselves,
    // matches the ESP firmware which does the same.
    this.manager.startDeviceScan(
      null,
      { allowDuplicates: true, scanMode: 2 /* low latency */ },
      (error: any, device: any) => {
        if (error) {
          this.onStatus?.('error', String(error?.message ?? error));
          return;
        }
        if (!device) return;
        const mfgB64 = device.manufacturerData;
        if (!mfgB64) return;
        const adv = tryParseAdvAnyFormat(mfgB64);
        if (!adv) return;
        this.onAdv?.({
          mac: device.id,
          rssi: device.rssi ?? null,
          adv,
        });
      },
    );
  }

  stopScan() {
    if (this.manager && this.started) {
      this.manager.stopDeviceScan();
      this.started = false;
    }
  }

  destroy() {
    this.stopScan();
    if (this.manager) {
      try { this.manager.destroy(); } catch { /* ignore */ }
      this.manager = null;
    }
  }

  // Bundle a fetch + optional writes into one connection, mirroring the
  // Arduino performBleAction() function.
  async syncTank(
    mac: string,
    opts: {
      writeNameColor?: { name: string; colorRGB: number };
      writeCal?: TankCal;
      writeMesh?: TankMesh;
    } = {},
  ): Promise<{
    name?: string;
    colorRGB?: number;
    cal?: TankCal;
    mesh?: TankMesh;
    diag?: ReturnType<typeof decodeDiag>;
  }> {
    if (!this.available || !this.manager) throw new Error('BLE unsupported');
    // Stop scanning during connect to reduce radio contention.
    const wasScanning = this.started;
    this.stopScan();

    let device: any = null;
    try {
      device = await this.manager.connectToDevice(mac, { timeout: 8000 });
      await device.discoverAllServicesAndCharacteristics();

      // Writes first, so subsequent reads reflect the new state.
      if (opts.writeNameColor) {
        await device.writeCharacteristicWithResponseForService(
          TANKMESH_SERVICE_UUID,
          TANKMESH_NAMECOLOR_UUID,
          encodeNameColor(opts.writeNameColor.name, opts.writeNameColor.colorRGB),
        );
        await sleep(150);
      }
      if (opts.writeCal) {
        await device.writeCharacteristicWithResponseForService(
          TANKMESH_SERVICE_UUID,
          TANKMESH_CAL_UUID,
          encodeCal(opts.writeCal),
        );
        await sleep(150);
      }
      if (opts.writeMesh) {
        await device.writeCharacteristicWithResponseForService(
          TANKMESH_SERVICE_UUID,
          TANKMESH_MESH_UUID,
          encodeMesh(opts.writeMesh),
        );
        await sleep(150);
      }

      const [nc, cal, mesh, diag] = await Promise.all([
        safeRead(device, TANKMESH_NAMECOLOR_UUID),
        safeRead(device, TANKMESH_CAL_UUID),
        safeRead(device, TANKMESH_MESH_UUID),
        safeRead(device, TANKMESH_DIAG_UUID),
      ]);

      const result: any = {};
      if (nc)   { const p = decodeNameColor(nc); result.name = p.name; result.colorRGB = p.colorRGB; }
      if (cal)  { result.cal  = decodeCal(cal); }
      if (mesh) { result.mesh = decodeMesh(mesh); }
      if (diag) { result.diag = decodeDiag(diag); }
      return result;
    } finally {
      if (device) {
        try { await device.cancelConnection(); } catch { /* ignore */ }
      }
      if (wasScanning) {
        this.beginScan();
      }
    }
  }
}

async function safeRead(device: any, uuid: string): Promise<string | null> {
  try {
    const c = await device.readCharacteristicForService(TANKMESH_SERVICE_UUID, uuid);
    return c?.value ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Re-export the manufacturer ID for anyone that might advertise-emulate a
// fake sensor for testing.
export { TANKMESH_MFG_ID };
