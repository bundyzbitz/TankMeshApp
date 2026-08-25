// Individual tank detail — graphical vertical fill in the tank's assigned color,
// large percentage readout, and per-packet diagnostics. Mirrors the Arduino
// drawTankDetail() screen with a settings button in the corner.

import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTankStore } from '@/src/store/tankStore';
import { batteryPercentFromMv, rgbHex, textColorFor } from '@/src/ble/protocol';
import { TM_FLAG_LOW_BATT, TM_FLAG_CAL_VALID, TM_FLAG_ON_BATTERY } from '@/src/types';

export default function TankDetailScreen() {
  const params = useLocalSearchParams<{ mac: string }>();
  const mac = decodeURIComponent(params.mac ?? '');
  const state = useTankStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tank = useMemo(() => state.tanks.find((t) => t.mac === mac), [state.tanks, mac]);

  if (!tank) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} onSettings={() => {}} title="Tank not found" />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>This tank is no longer broadcasting.</Text>
        </View>
      </View>
    );
  }

  const color = rgbHex(tank.colorRGB);
  const accentText = textColorFor(tank.colorRGB);
  const label = tank.name ? tank.name : `Unnamed ${tank.mac.slice(-8)}`;
  const battPct = batteryPercentFromMv(tank.batteryMv);
  const level = Math.max(0, Math.min(100, tank.levelPercent));

  const flagLow = (tank.flags & TM_FLAG_LOW_BATT) !== 0;
  const flagCal = (tank.flags & TM_FLAG_CAL_VALID) !== 0;
  const flagBat = (tank.flags & TM_FLAG_ON_BATTERY) !== 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="tank-detail-screen">
      <Header
        title={label}
        color={color}
        onBack={() => router.back()}
        onSettings={() => router.push(`/tank/${encodeURIComponent(tank.mac)}/settings`)}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.tankArea}>
          <View style={styles.tankBody}>
            {/* Fill grows from bottom */}
            <View
              testID="tank-fill"
              style={[
                styles.tankFill,
                { backgroundColor: color, height: `${level}%` },
              ]}
            />
            {/* Level ticks */}
            {[25, 50, 75].map((tk) => (
              <View key={tk} style={[styles.tick, { bottom: `${tk}%` }]} />
            ))}
          </View>

          <View style={styles.pctBlock}>
            <Text style={[styles.pctBig, { color }]} testID="tank-pct-big">
              {level}
            </Text>
            <Text style={styles.pctUnit}>%</Text>
          </View>
        </View>

        <View style={styles.flagsRow}>
          <FlagChip
            label="On battery"
            active={flagBat}
            color={color}
            testID="flag-battery"
          />
          <FlagChip
            label="Calibrated"
            active={flagCal}
            color={color}
            testID="flag-cal"
          />
          <FlagChip
            label="Low batt"
            active={flagLow}
            color="#FF5A5F"
            testID="flag-lowbatt"
          />
        </View>

        <View style={styles.metaCard}>
          <MetaRow k="MAC" v={tank.mac} />
          <MetaRow k="Group" v={tank.mesh?.prefix ?? '—'} />
          <MetaRow k="Packets" v={String(tank.counter)} />
          <MetaRow
            k="Battery"
            v={battPct >= 0 ? `${battPct}% (${tank.batteryMv} mV)` : 'Not measured'}
            valueColor={flagLow ? '#FF5A5F' : undefined}
          />
          <MetaRow k="RSSI" v={tank.rssi != null ? `${tank.rssi} dBm` : '—'} />
          <MetaRow k="Wake interval" v={tank.mesh ? `${tank.mesh.sleepIntervalSec} s` : '—'} />
          <MetaRow k="Settings ver" v={String(tank.advSettingsVersion)} />
          <MetaRow k="Raw ADC" v={tank.diag ? `${tank.diag.rawAdc} (filt ${tank.diag.filteredAdc})` : '—'} />
        </View>
      </ScrollView>

      <Pressable
        testID="edit-color-fab"
        onPress={() => router.push(`/tank/${encodeURIComponent(tank.mac)}/settings`)}
        style={[styles.fab, { backgroundColor: color, bottom: insets.bottom + 20 }]}
      >
        <Ionicons name="create-outline" size={22} color={accentText} />
        <Text style={[styles.fabText, { color: accentText }]}>Edit sensor</Text>
      </Pressable>
    </View>
  );
}

function Header({
  title, color, onBack, onSettings,
}: {
  title: string;
  color?: string;
  onBack: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} testID="back-button" hitSlop={12} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={26} color={color ?? '#FFFFFF'} />
      </Pressable>
      <Text style={[styles.headerTitle, color && { color }]} numberOfLines={1}>{title}</Text>
      <Pressable onPress={onSettings} testID="header-settings-button" hitSlop={12} style={styles.iconBtn}>
        <Ionicons name="settings-outline" size={22} color={color ?? '#FFFFFF'} />
      </Pressable>
    </View>
  );
}

function FlagChip({ label, active, color, testID }:
  { label: string; active: boolean; color: string; testID: string }) {
  return (
    <View
      testID={testID}
      style={[
        styles.chip,
        { borderColor: active ? color : '#2A2A38' },
        active && { backgroundColor: color + '22' },
      ]}
    >
      <Text style={[styles.chipText, active ? { color } : { color: '#4A4A55' }]}>{label}</Text>
    </View>
  );
}

function MetaRow({ k, v, valueColor }: { k: string; v: string; valueColor?: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaK}>{k}</Text>
      <Text style={[styles.metaV, valueColor && { color: valueColor }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  iconBtn: { padding: 8, minWidth: 44, alignItems: 'center' },

  tankArea: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  tankBody: {
    width: 130,
    height: 300,
    borderWidth: 2,
    borderColor: '#5A5A6A',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#12121C',
    position: 'relative',
  },
  tankFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  tick: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#2A2A38',
  },
  pctBlock: { marginLeft: 24, flexDirection: 'row', alignItems: 'baseline' },
  pctBig: { fontSize: 92, fontWeight: '800', letterSpacing: -2 },
  pctUnit: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginLeft: 4 },

  flagsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 24,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },

  metaCard: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: '#12121C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  metaK: { color: '#6E6E76', fontSize: 13 },
  metaV: { color: '#FFFFFF', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    gap: 8,
    boxShadow: '0px 4px 8px rgba(0,0,0,0.5)',
    elevation: 6,
  },
  fabText: { fontSize: 14, fontWeight: '700' },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: '#6E6E76' },
});
