// Converts an RSSI dBm reading into a 0..4 bar indicator and renders it as
// four vertical pills. Mirrors the WiFi-signal glyph most phones already use.

import { View, StyleSheet } from 'react-native';

export function rssiBars(rssi: number | null | undefined): number {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -82) return 2;
  if (rssi >= -92) return 1;
  return 0;
}

type Props = {
  rssi: number | null | undefined;
  color?: string;   // active-bar color (defaults to the tank's color)
  dim?: string;     // inactive-bar color
  size?: number;    // overall width in points
  testID?: string;
};

export default function SignalBars({ rssi, color = '#FFFFFF', dim = '#2A2A38', size = 20, testID }: Props) {
  const active = rssiBars(rssi);
  const barW = size / 4 - 1;
  return (
    <View testID={testID} style={[styles.row, { width: size, height: size }]}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: size * (i / 4),
            backgroundColor: i <= active ? color : dim,
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
});
