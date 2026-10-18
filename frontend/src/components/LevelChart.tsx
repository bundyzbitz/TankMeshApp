// Simple SVG sparkline of the last-hour level % history. No axes — a thin
// baseline + the tank's own color polyline. Grows a filled area underneath
// so trends are obvious at a glance (leaks drop steeply, fills ramp up).

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { LevelSample } from '@/src/types';

type Props = {
  samples: LevelSample[];
  color: string;
  width?: number;
  height?: number;
  windowMs?: number; // defaults to 1 h
};

export default function LevelChart({
  samples, color, width = 320, height = 120, windowMs = 60 * 60 * 1000,
}: Props) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const data = samples.filter((s) => s.t >= cutoff);

  if (data.length < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>Gathering history...</Text>
        <Text style={styles.emptySub}>
          Chart appears once two adverts have arrived (every {Math.round((data[0]?.t ? (now - data[0].t) / 1000 : 0))}s so far).
        </Text>
      </View>
    );
  }

  // Y: level%  (0 at bottom, 100 at top). Reserve 10px top padding so the
  // 100% line isn't clipped, and 18px bottom for the x-axis label strip.
  const padTop = 10;
  const padBottom = 18;
  const padLeft = 24; // leaves room for the Y labels
  const plotW = width - padLeft - 4;
  const plotH = height - padTop - padBottom;

  const xOf = (t: number) => padLeft + ((t - cutoff) / windowMs) * plotW;
  const yOf = (level: number) => padTop + (1 - level / 100) * plotH;

  // Build the stroke path and the filled-area path (same but closed to baseline).
  let stroke = '';
  let area = '';
  data.forEach((s, i) => {
    const x = xOf(s.t);
    const y = yOf(s.level);
    stroke += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    area   += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  });
  const lastX = xOf(data[data.length - 1].t);
  const firstX = xOf(data[0].t);
  const baselineY = padTop + plotH;
  area += ` L${lastX.toFixed(1)} ${baselineY} L${firstX.toFixed(1)} ${baselineY} Z`;

  const last = data[data.length - 1];
  const first = data[0];
  const delta = last.level - first.level;

  // Gridlines at 0 / 25 / 50 / 75 / 100
  const grid = [0, 25, 50, 75, 100];

  return (
    <View>
      <Svg width={width} height={height}>
        {grid.map((g) => (
          <Line
            key={g}
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yOf(g)}
            y2={yOf(g)}
            stroke={g === 0 || g === 100 ? '#2A2A38' : '#1A1A2A'}
            strokeWidth={1}
          />
        ))}
        {[0, 50, 100].map((g) => (
          <SvgText
            key={g}
            x={padLeft - 6}
            y={yOf(g) + 3}
            fill="#4A4A55"
            fontSize={9}
            textAnchor="end"
          >
            {g}
          </SvgText>
        ))}
        <Path d={area} fill={color} fillOpacity={0.18} />
        <Path d={stroke} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={lastX} cy={yOf(last.level)} r={3} fill={color} />
        <SvgText
          x={padLeft}
          y={height - 4}
          fill="#4A4A55"
          fontSize={10}
        >
          {Math.round(windowMs / 60000)} min ago
        </SvgText>
        <SvgText
          x={padLeft + plotW}
          y={height - 4}
          fill="#4A4A55"
          fontSize={10}
          textAnchor="end"
        >
          now
        </SvgText>
      </Svg>
      <View style={styles.caption}>
        <Text style={styles.capLabel}>Last hour</Text>
        <Text
          style={[
            styles.capDelta,
            { color: delta > 0 ? '#00C48C' : delta < 0 ? '#FF5A5F' : '#8E8E93' },
          ]}
        >
          {delta === 0 ? '±0' : (delta > 0 ? '+' : '') + delta}%
        </Text>
        <Text style={styles.capSamples}>{data.length} samples</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: { color: '#8E8E93', fontSize: 13, fontWeight: '500' },
  emptySub: { color: '#4A4A55', fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 16 },
  caption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  capLabel: { color: '#6E6E76', fontSize: 11, letterSpacing: 0.4 },
  capDelta: { fontSize: 12, fontWeight: '700' },
  capSamples: { color: '#4A4A55', fontSize: 11 },
});
