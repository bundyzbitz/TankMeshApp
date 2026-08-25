// Encoding / decoding TankMesh BLE protocol buffers.
// Layout is little-endian and matches TankMeshProtocol.h exactly.

import { Buffer } from 'buffer';
import {
  TANKMESH_MAGIC,
  TANKMESH_MFG_ID,
  Tank,
  TankCal,
  TankMesh,
  TankDiag,
} from '../types';

// ---- base64 helpers (react-native-ble-plx returns base64 strings) ----
export const b64ToBuf = (b64: string): Buffer => Buffer.from(b64, 'base64');
export const bufToB64 = (buf: Buffer): string => buf.toString('base64');

// ---- Advertisement (12-byte manufacturer payload after 2-byte company ID) ----
export type ParsedAdv = {
  levelPercent: number;
  batteryMv: number;
  counter: number;
  settingsVersion: number;
  flags: number;
};

// input: the base64 payload from advertisement.manufacturerData
// react-native-ble-plx already includes the leading 2 company ID bytes.
export function parseManufacturerAdv(b64: string): ParsedAdv | null {
  if (!b64) return null;
  const buf = b64ToBuf(b64);
  if (buf.length < 2 + 12) return null;
  const companyId = buf.readUInt16LE(0);
  if (companyId !== TANKMESH_MFG_ID) return null;
  const magic0 = String.fromCharCode(buf.readUInt8(2));
  const magic1 = String.fromCharCode(buf.readUInt8(3));
  if (magic0 + magic1 !== TANKMESH_MAGIC) return null;
  // protoVersion at byte 4 (unused today, still validated loosely)
  const levelPercent = buf.readUInt8(5);
  const batteryMv    = buf.readUInt16LE(6);
  const counter      = buf.readUInt32LE(8);
  const settingsVer  = buf.readUInt8(12);
  const flags        = buf.readUInt8(13);
  return {
    levelPercent: Math.max(0, Math.min(100, levelPercent)),
    batteryMv,
    counter,
    settingsVersion: settingsVer,
    flags,
  };
}

// Some Android stacks strip the company ID and give only the payload;
// try both interpretations.
export function tryParseAdvAnyFormat(b64: string): ParsedAdv | null {
  const p = parseManufacturerAdv(b64);
  if (p) return p;
  const buf = b64ToBuf(b64);
  if (buf.length < 12) return null;
  const magic0 = String.fromCharCode(buf.readUInt8(0));
  const magic1 = String.fromCharCode(buf.readUInt8(1));
  if (magic0 + magic1 !== TANKMESH_MAGIC) return null;
  return {
    levelPercent: buf.readUInt8(3),
    batteryMv: buf.readUInt16LE(4),
    counter: buf.readUInt32LE(6),
    settingsVersion: buf.readUInt8(10),
    flags: buf.readUInt8(11),
  };
}

// ---- NameColor characteristic (20 bytes) ----
export function decodeNameColor(b64: string): { name: string; colorRGB: number } {
  const buf = b64ToBuf(b64);
  const nameRaw = buf.slice(0, 16);
  const nulIdx = nameRaw.indexOf(0);
  const name = nameRaw.slice(0, nulIdx < 0 ? 16 : nulIdx).toString('utf8');
  const colorRGB = buf.readUInt32LE(16) & 0x00FFFFFF;
  return { name, colorRGB };
}

export function encodeNameColor(name: string, colorRGB: number): string {
  const buf = Buffer.alloc(20);
  buf.write(name.slice(0, 15), 0, 'utf8');
  buf.writeUInt32LE(colorRGB & 0x00FFFFFF, 16);
  return bufToB64(buf);
}

// ---- Cal characteristic (5 bytes) ----
export function decodeCal(b64: string): TankCal {
  const buf = b64ToBuf(b64);
  return {
    autoCalEnabled: buf.readUInt8(0) !== 0,
    adcMin: buf.readUInt16LE(1),
    adcMax: buf.readUInt16LE(3),
  };
}

export function encodeCal(cal: TankCal): string {
  const buf = Buffer.alloc(5);
  buf.writeUInt8(cal.autoCalEnabled ? 1 : 0, 0);
  buf.writeUInt16LE(cal.adcMin & 0xFFFF, 1);
  buf.writeUInt16LE(cal.adcMax & 0xFFFF, 3);
  return bufToB64(buf);
}

// ---- Mesh characteristic (18 bytes) ----
export function decodeMesh(b64: string): TankMesh {
  const buf = b64ToBuf(b64);
  const raw = buf.slice(0, 16);
  const nulIdx = raw.indexOf(0);
  const prefix = raw.slice(0, nulIdx < 0 ? 16 : nulIdx).toString('utf8');
  const sleepIntervalSec = buf.readUInt16LE(16);
  return { prefix, sleepIntervalSec };
}

export function encodeMesh(mesh: TankMesh): string {
  const buf = Buffer.alloc(18);
  buf.write(mesh.prefix.slice(0, 15), 0, 'utf8');
  buf.writeUInt16LE(Math.max(5, mesh.sleepIntervalSec) & 0xFFFF, 16);
  return bufToB64(buf);
}

// ---- Diag characteristic (8 bytes) ----
export function decodeDiag(b64: string): TankDiag {
  const buf = b64ToBuf(b64);
  return {
    rawAdc: buf.readUInt16LE(0),
    filteredAdc: buf.readUInt16LE(2),
    isCalibrated: buf.readUInt8(4) !== 0,
    settingsVersion: buf.readUInt8(5),
    batteryMillivolts: buf.readUInt16LE(6),
  };
}

// ---- helpers ----
export function batteryPercentFromMv(mv: number): number {
  if (!mv) return -1;
  const fullMv = 4200, emptyMv = 3300;
  if (mv >= fullMv) return 100;
  if (mv <= emptyMv) return 0;
  return Math.round(((mv - emptyMv) * 100) / (fullMv - emptyMv));
}

export function rgbHex(colorRGB: number): string {
  return '#' + (colorRGB & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
}

export function textColorFor(colorRGB: number): string {
  const r = (colorRGB >> 16) & 0xFF;
  const g = (colorRGB >> 8) & 0xFF;
  const b = colorRGB & 0xFFFF & 0xFF;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 140 ? '#000000' : '#FFFFFF';
}

export function tankMatchesGroup(t: Tank, group: string): boolean {
  return !!t.mesh && t.mesh.prefix === group;
}
