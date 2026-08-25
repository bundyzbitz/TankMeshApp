# TankMesh Companion App — PRD

## Overview
A React Native (Expo) mobile companion app that acts as a BLE central for the [BLE-tank-monitoring-system-using-esp32-and-CYD](https://github.com/bundyzbitz/BLE-tank-monitoring-system-using-esp32-and-CYD) project. It listens for TankMesh v3 sensor advertisements (manufacturer ID `0xFFFF`, magic `TM`) and provides the same functionality as the physical CYD `TankMeshMainDisplay` — multi-tank overview, per-tank graphical detail screens, and full sensor settings (matches the ESP32 WiFi AP web portal one-for-one).

## Screens
- **Overview** (`/`) — Multi-tank list filtered by the app's group label. Each row shows tank name, level %, colored fill bar, packet counter, battery %, RSSI.
- **Tank Detail** (`/tank/[mac]`) — Graphical vertical tank fill in the tank's assigned color, big % readout, flags (on-battery, calibrated, low-battery), MAC/group/packets/battery/RSSI/wake-interval/settings-version/raw-ADC.
- **Per-tank Settings** (`/tank/[mac]/settings`) — Name (15 char), color (9 presets + hex), display order, auto-calibrate toggle, live raw ADC, manual ADC min/max, group label, wake interval — writes to GATT NameColor / Cal / Mesh characteristics bundled in one connection.
- **App Settings** (`/settings`) — This display's group label, demo-mode toggle, BLE status, and full list of every sensor heard (regardless of group) so you can find and re-label sensors into your group.

## BLE protocol (parsed from `TankMeshProtocol.h`)
- Service UUID `8f9e1a00-4b2e-4f1a-9c3d-0123456789ab`
- Advertisement: 2-byte company ID `0xFFFF` + 12-byte payload (magic `T`,`M`, protoVersion, levelPercent u8, batteryMv u16 LE, counter u32 LE, settingsVersion u8, flags u8)
- Characteristics (all little-endian, packed):
  - NameColor (20 B): `char name[16]` + `u32 colorRGB`
  - Cal (5 B): `u8 autoCal` + `u16 adcMin` + `u16 adcMax`
  - Mesh (18 B): `char prefix[16]` + `u16 sleepIntervalSec`
  - Diag (8 B, read-only): `u16 rawAdc` + `u16 filteredAdc` + `u8 isCalibrated` + `u8 settingsVersion` + `u16 batteryMv`

## Constraints implemented
- Max 9 tanks (`MAX_TANKS = 9`) as per firmware
- Group-label isolation: only sensors with a matching `mesh.prefix` show on the Overview and are counted in the header
- Persist per-MAC display order via AsyncStorage
- Bundled reads + writes in a single connection (matches Arduino `performBleAction()` sequencing with 150 ms gaps)

## Demo mode
BLE native module cannot run in Expo Go or on the web preview. The app auto-detects this and enables **demo mode**, which cycles 4 mock tanks (Fresh Water, Grey Water, Black Water, Diesel) every 2 s so the UI can be reviewed before publishing an APK. Demo mode is also togglable from Settings.

## APK build
BLE requires a native build. The user must use the Emergent **Publish** button (top-right) which runs EAS build and produces an APK. Expo Go will always fall back to demo mode.

## Files of note
- `src/ble/protocol.ts` — pack/unpack functions for the four characteristics + adv payload
- `src/ble/tankMeshBle.ts` — safe dynamic import of `react-native-ble-plx`, scan + connect wrappers
- `src/ble/mockData.ts` — demo-mode data source
- `src/store/tankStore.ts` — single store instance with `useSyncExternalStore`
- `src/store/persist.ts` — AsyncStorage-backed settings + per-MAC display order
- `app/index.tsx` — Overview
- `app/tank/[mac]/index.tsx` — Tank detail
- `app/tank/[mac]/settings.tsx` — Per-tank settings
- `app/settings.tsx` — App settings
