# TankMesh App

Native Android (and iOS) companion app for [TankMesh](https://github.com/bundyzbitz/BLE-tank-monitoring-system-using-esp32-and-CYD) — scans your TankMesh BLE sensors directly (no cloud, no internet required) and shows live tank levels, with lock-screen alerts when a tank crosses a threshold you set.

> Built with Expo/React Native. `react-native-ble-plx` talks to the sensors directly over Bluetooth, the same way the ESP32 displays' own GATT reads/writes do — the phone is just another client on the same protocol.

---

## Branch

`main` is now the active development branch and includes everything from the former `1.0.4` branch, including the background notification feature. The `1.0.2` and `1.0.4` branches are retired — all further work happens on `main`, which is also what `.github/workflows/build-apk.yml` builds from.

---

## Features

- Direct BLE scanning for up to 9 TankMesh sensors — no backend, no account, no internet dependency for core monitoring
- Live tank levels, battery status, signal strength
- Per-tank min/max alert thresholds with **lock-screen notifications on crossing** (not just an in-app banner)
- **Background monitoring**: a periodic background task (`src/background/backgroundScan.ts`) wakes roughly every 15 minutes — Android's own enforced floor for background work, not something the app can shorten — does a short BLE scan, and fires a notification if any tank has crossed its threshold, even if the app hasn't been opened in hours
- Remote sensor configuration (name, color, calibration, group label, wake interval) — same fields as the Arduino web portal
- Demo mode for UI development without real sensors nearby

## Known limitations

- **Background checks are ~15-minute granularity, not real-time.** This is an Android platform floor for periodic background work (`expo-background-task`), not a bug — fine for monitoring tanks that don't empty quickly, not suitable for anything needing second-by-second response.
- **Aggressive OEM battery managers can still kill the background task even when correctly registered.** Chinese-OEM Android skins in particular (MIUI, ColorOS, FuntouchOS, OxygenOS, EMUI, and others) are known for killing background work that stock Android would allow. If alerts stop arriving reliably, check the phone's own battery-optimization settings and whitelist the app there — this is a widely-documented limitation of *any* Android app with background requirements, not specific to this one.
- Background checks only cover sensors already known to the app (seen at least once while the app was open) and use whatever thresholds/group settings were last saved locally — they don't pull fresh GATT settings (name, calibration) from the sensor, only the broadcast advertisement (level, battery).
- No cloud relay — if you want alerts to reach you when you're away from BLE range of the sensors entirely, that's out of scope for this architecture (would need a separate always-on gateway device posting to a server, a different project).

## Development

```
cd frontend
yarn install
npx expo start
```

Needs a custom dev client or EAS build — `react-native-ble-plx` is a native module and won't run in plain Expo Go.

## Building a release APK

Via the included GitHub Actions workflow — triggers automatically on every push to `main`, or manually:

```
Actions tab → Build Android APK → Run workflow
```

Or locally:

```
cd frontend
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```
