// Compact 3-column overview cell. Fits 9 tanks on one phone screen without
// scrolling. Shows swatch, name, big % and a thin level bar.

import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tank, TM_FLAG_LOW_BATT } from '@/src/types';
import { rgbHex, batteryPercentFromMv } from '@/src/ble/protocol';
import SignalBars from './SignalBars';

type Props = {
  tank: Tank;
  onPress: () => void;
  width: number;
};

export function TankGridCell({ tank, onPress, width }: Props) {
  const color = rgbHex(tank.colorRGB);
  const label = tank.name ? tank.name : tank.mac.slice(-5);
  const level = Math.max(0, Math.min(100, tank.levelPercent));
  const lowBatt = (tank.flags & TM_FLAG_LOW_BATT) !== 0;
  const battPct = batteryPercentFromMv(tank.batteryMv);
  const alarm =
    (tank.minThreshold != null && level < tank.minThreshold) ? 'below'
    : (tank.maxThreshold != null && level > tank.maxThreshold) ? 'above'
    : null;

  return (
    <Pressable
      onPress={onPress}
      testID={`tank-cell-${tank.mac}`}
      style={({ pressed }) => [
        styles.cell,
        { width, borderColor: alarm ? '#FF5A5F' : '#1E1E2A' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: color }]} />
      {alarm && (
        <View style={styles.alarmPill} testID={`alarm-${tank.mac}`}>
          <Ionicons
            name={alarm === 'below' ? 'arrow-down' : 'arrow-up'}
            size={10}
            color="#FFFFFF"
          />
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>{label}</Text>
      <Text style={[styles.pct, { color }]}>{level}<Text style={styles.pctUnit}>%</Text></Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${level}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.footer}>
        {battPct >= 0 && (
          <Text style={[styles.footerText, lowBatt && { color: '#FF5A5F' }]}>
            {battPct}%
          </Text>
        )}
        {tank.rssi != null && <SignalBars rssi={tank.rssi} color={color} size={12} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    aspectRatio: 0.95,
    backgroundColor: '#12121C',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  alarmPill: {
    position: 'absolute',
    top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF5A5F',
    alignItems: 'center', justifyContent: 'center',
  },
  name: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginLeft: 4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  pct: {
    marginLeft: 4,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 4,
    fontVariant: Platform.OS === 'web' ? undefined : ['tabular-nums'],
  },
  pctUnit: { fontSize: 14, fontWeight: '600' },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#23232D',
    marginTop: 6,
    marginLeft: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 2 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 4,
  },
  footerText: { color: '#6E6E76', fontSize: 10, letterSpacing: 0.4 },
});
