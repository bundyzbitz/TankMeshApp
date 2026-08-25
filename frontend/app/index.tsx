// Multi-tank overview — the primary "Overview" screen from the Arduino UI.
// Black background, per-tank swatch + level bar in that tank's assigned color.

import { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTankStore, selectMatchingTanks, tankStore } from '@/src/store/tankStore';
import { batteryPercentFromMv, rgbHex } from '@/src/ble/protocol';
import { Tank, TM_FLAG_LOW_BATT } from '@/src/types';

export default function OverviewScreen() {
  const state = useTankStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const matching = useMemo(() => selectMatchingTanks(state), [state]);
  const otherSeen = state.tanks.length - matching.length;

  const bleLabel =
    state.settings.demoMode ? 'DEMO MODE'
    : !state.bleAvailable ? 'BLE UNAVAILABLE'
    : state.bleStatus === 'scanning' ? 'SCANNING'
    : state.bleStatus === 'unsupported' ? 'BLE UNAVAILABLE'
    : state.bleStatus === 'permission-denied' ? 'BT PERMISSION DENIED'
    : state.bleStatus === 'powered-off' ? 'BLUETOOTH OFF'
    : state.bleStatus === 'requesting' ? 'REQUESTING...'
    : state.bleStatus.toUpperCase();

  const bleDotColor =
    state.settings.demoMode ? '#F0B429'
    : !state.bleAvailable ? '#FF5A5F'
    : state.bleStatus === 'scanning' ? '#2AB7FF'
    : state.bleStatus === 'unsupported' || state.bleStatus === 'error' ? '#FF5A5F'
    : '#8E8E93';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="overview-screen">
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} testID="overview-title">
            {state.settings.screenGroupLabel}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: bleDotColor }]} />
            <Text style={styles.statusText} testID="ble-status">{bleLabel}</Text>
            <Text style={styles.statusText}>  ·  {matching.length} tank{matching.length === 1 ? '' : 's'}</Text>
          </View>
        </View>
        <Pressable
          testID="settings-button"
          onPress={() => router.push('/settings')}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor="#8E8E93"
            onRefresh={() => {
              matching.forEach((t) => tankStore.refreshTank(t.mac));
            }}
          />
        }
      >
        {matching.length === 0 ? (
          <EmptyState otherSeen={otherSeen} />
        ) : (
          matching.map((t) => (
            <TankRow key={t.mac} tank={t} onPress={() => router.push(`/tank/${encodeURIComponent(t.mac)}`)} />
          ))
        )}

        {otherSeen > 0 && matching.length > 0 && (
          <Text style={styles.hint} testID="other-hint">
            {otherSeen} other sensor{otherSeen === 1 ? '' : 's'} nearby not in this group.
            {'\n'}Open Settings to relabel them.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function TankRow({ tank, onPress }: { tank: Tank; onPress: () => void }) {
  const color = rgbHex(tank.colorRGB);
  const label = tank.name ? tank.name : `(${tank.mac.slice(-8)})`;
  const battPct = batteryPercentFromMv(tank.batteryMv);
  const lowBatt = (tank.flags & TM_FLAG_LOW_BATT) !== 0;

  return (
    <Pressable
      onPress={onPress}
      testID={`tank-row-${tank.mac}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1} testID={`tank-name-${tank.mac}`}>{label}</Text>
          <Text style={styles.rowPct} testID={`tank-pct-${tank.mac}`}>{tank.levelPercent}%</Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { backgroundColor: color, width: `${Math.max(0, Math.min(100, tank.levelPercent))}%` },
            ]}
          />
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowMeta}>Pkt {tank.counter}</Text>
          {battPct >= 0 && (
            <Text style={[styles.rowMeta, lowBatt && { color: '#FF5A5F' }]}>
              Batt {battPct}%
            </Text>
          )}
          {tank.rssi != null && <Text style={styles.rowMeta}>RSSI {tank.rssi}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({ otherSeen }: { otherSeen: number }) {
  return (
    <View style={styles.empty} testID="empty-state">
      <Ionicons name="bluetooth-outline" size={48} color="#4A4A55" />
      <Text style={styles.emptyTitle}>No tanks in this group yet</Text>
      <Text style={styles.emptyBody}>
        Waiting for TankMesh BLE broadcasts.{'\n'}
        {otherSeen > 0
          ? `${otherSeen} other sensor${otherSeen === 1 ? '' : 's'} nearby — open Settings to relabel.`
          : 'Make sure your sensors are powered on and in range.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', letterSpacing: 0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#8E8E93', fontSize: 12, letterSpacing: 0.5 },
  iconBtn: { padding: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#141422',
  },
  swatch: {
    width: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  rowMain: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', flex: 1, marginRight: 8 },
  rowPct: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  barTrack: {
    height: 6,
    backgroundColor: '#23232D',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  rowBottom: { flexDirection: 'row', gap: 14, marginTop: 8 },
  rowMeta: { color: '#6E6E76', fontSize: 11, letterSpacing: 0.4 },

  hint: {
    color: '#F0B429',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyBody: { color: '#6E6E76', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
