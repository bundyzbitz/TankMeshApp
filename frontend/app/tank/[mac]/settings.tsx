// Per-sensor settings — matches the "Tank Settings" section of the Arduino
// web portal exactly: name, color, display order, auto-calibration toggle,
// manual ADC min/max, live raw ADC, group label, wake interval.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, Switch, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTankStore, tankStore } from '@/src/store/tankStore';
import { rgbHex } from '@/src/ble/protocol';

const PRESET_COLORS = [
  0x2AB7FF, 0x00C48C, 0xF0B429, 0xFF5A5F,
  0xC26EFF, 0xFFFFFF, 0x8E8E93, 0x6B4E2E, 0xFF7F50,
];

export default function TankSettingsScreen() {
  const { mac: macParam } = useLocalSearchParams<{ mac: string }>();
  const mac = decodeURIComponent(macParam ?? '');
  const state = useTankStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tank = useMemo(() => state.tanks.find((t) => t.mac === mac), [state.tanks, mac]);

  const [name, setName] = useState(tank?.name ?? '');
  const [colorRGB, setColorRGB] = useState(tank?.colorRGB ?? 0x808080);
  const [order, setOrder] = useState(String(tank?.displayOrder ?? 255));
  const [autoCal, setAutoCal] = useState(tank?.cal?.autoCalEnabled ?? true);
  const [adcMin, setAdcMin] = useState(String(tank?.cal?.adcMin ?? 0));
  const [adcMax, setAdcMax] = useState(String(tank?.cal?.adcMax ?? 4095));
  const [group, setGroup] = useState(tank?.mesh?.prefix ?? 'TankMesh');
  const [sleep, setSleep] = useState(String(tank?.mesh?.sleepIntervalSec ?? 60));
  const [saving, setSaving] = useState(false);
  const [customHex, setCustomHex] = useState(rgbHex(tank?.colorRGB ?? 0x808080).slice(1));
  const [hydrated, setHydrated] = useState(false);

  // Re-sync form once the tank data actually arrives (direct URL navigation
  // renders before tankStore.init() finishes populating).
  useEffect(() => {
    if (tank && !hydrated) {
      setName(tank.name ?? '');
      setColorRGB(tank.colorRGB ?? 0x808080);
      setOrder(String(tank.displayOrder ?? 255));
      setAutoCal(tank.cal?.autoCalEnabled ?? true);
      setAdcMin(String(tank.cal?.adcMin ?? 0));
      setAdcMax(String(tank.cal?.adcMax ?? 4095));
      setGroup(tank.mesh?.prefix ?? 'TankMesh');
      setSleep(String(tank.mesh?.sleepIntervalSec ?? 60));
      setCustomHex(rgbHex(tank.colorRGB ?? 0x808080).slice(1));
      setHydrated(true);
    }
  }, [tank, hydrated]);

  if (!tank) {
    return (
      <View style={styles.notFound}>
        <Text style={{ color: '#6E6E76' }}>Tank no longer visible.</Text>
      </View>
    );
  }

  const accent = rgbHex(colorRGB);

  const applyCustomHex = () => {
    const clean = customHex.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setCustomHex(clean);
    if (clean.length === 6) setColorRGB(parseInt(clean, 16));
  };

  const save = async () => {
    setSaving(true);
    try {
      const ord = Math.max(0, Math.min(255, parseInt(order, 10) || 255));
      await tankStore.setDisplayOrder(mac, ord);

      // Write NameColor if changed
      if (name !== tank.name || colorRGB !== tank.colorRGB) {
        await tankStore.writeNameColor(mac, name, colorRGB);
      }
      // Cal
      const newCal = {
        autoCalEnabled: autoCal,
        adcMin: Math.max(0, Math.min(65535, parseInt(adcMin, 10) || 0)),
        adcMax: Math.max(0, Math.min(65535, parseInt(adcMax, 10) || 4095)),
      };
      if (
        !tank.cal ||
        newCal.autoCalEnabled !== tank.cal.autoCalEnabled ||
        newCal.adcMin !== tank.cal.adcMin ||
        newCal.adcMax !== tank.cal.adcMax
      ) {
        await tankStore.writeCal(mac, newCal);
      }
      // Mesh
      const newMesh = {
        prefix: group.trim() || 'TankMesh',
        sleepIntervalSec: Math.max(5, parseInt(sleep, 10) || 60),
      };
      if (
        !tank.mesh ||
        newMesh.prefix !== tank.mesh.prefix ||
        newMesh.sleepIntervalSec !== tank.mesh.sleepIntervalSec
      ) {
        await tankStore.writeMesh(mac, newMesh);
      }
      Alert.alert('Saved', 'Settings sent to sensor. May take one wake cycle to apply.');
    } catch (err: any) {
      Alert.alert(
        'Save failed',
        `${err?.message ?? err}\n\nThe sensor is only connectable briefly after each wake. It will retry automatically.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A14' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]} testID="tank-settings-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="back-button" style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={accent} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: accent }]} numberOfLines={1}>
            Edit {tank.name || tank.mac.slice(-8)}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Section title="Identity">
            <Field label="Name">
              <TextInput
                testID="name-input"
                value={name}
                onChangeText={(v) => setName(v.slice(0, 15))}
                placeholder="e.g. Fresh Water"
                placeholderTextColor="#4A4A55"
                style={styles.input}
                maxLength={15}
              />
            </Field>

            <Field label="Color">
              <View style={styles.swatchRow}>
                {PRESET_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    testID={`color-${c.toString(16)}`}
                    onPress={() => { setColorRGB(c); setCustomHex(rgbHex(c).slice(1)); }}
                    style={[
                      styles.swatch,
                      { backgroundColor: rgbHex(c) },
                      c === colorRGB && styles.swatchSelected,
                    ]}
                  />
                ))}
              </View>
              <View style={styles.hexRow}>
                <Text style={styles.hexHash}>#</Text>
                <TextInput
                  testID="hex-input"
                  value={customHex}
                  onChangeText={setCustomHex}
                  onBlur={applyCustomHex}
                  autoCapitalize="characters"
                  maxLength={6}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="RRGGBB"
                  placeholderTextColor="#4A4A55"
                />
                <View style={[styles.hexPreview, { backgroundColor: accent }]} />
              </View>
            </Field>

            <Field label="Display order" hint="Lower shows first. 255 = default order.">
              <TextInput
                testID="order-input"
                value={order}
                onChangeText={(v) => setOrder(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={3}
              />
            </Field>
          </Section>

          <Section title="Calibration">
            {tank.calMeshKnown ? (
              <>
                <Field label="Auto-calibrate">
                  <Switch
                    testID="autocal-switch"
                    value={autoCal}
                    onValueChange={setAutoCal}
                    trackColor={{ true: accent, false: '#2A2A38' }}
                    thumbColor="#FFFFFF"
                  />
                </Field>
                <Field label="Live raw ADC" hint={`Filtered: ${tank.diag?.filteredAdc ?? '—'}`}>
                  <Text style={styles.readOnly} testID="raw-adc">
                    {tank.diag?.rawAdc ?? '—'}
                  </Text>
                </Field>
                <Field label="Manual ADC min">
                  <TextInput
                    testID="adcmin-input"
                    value={adcMin}
                    onChangeText={(v) => setAdcMin(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.input}
                    editable={!autoCal}
                  />
                </Field>
                <Field label="Manual ADC max">
                  <TextInput
                    testID="adcmax-input"
                    value={adcMax}
                    onChangeText={(v) => setAdcMax(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.input}
                    editable={!autoCal}
                  />
                </Field>
              </>
            ) : (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#F0B429', fontSize: 13 }}>
                  Calibration settings not fetched yet.
                </Text>
                <Text style={{ color: '#6E6E76', fontSize: 12, marginTop: 4 }}>
                  Pull to refresh — the sensor needs to be within its brief post-wake connectable window.
                </Text>
              </View>
            )}
          </Section>

          <Section title="Mesh">
            <Field label="Group label" hint="Must match a display's group label to appear on that screen.">
              <TextInput
                testID="group-input"
                value={group}
                onChangeText={(v) => setGroup(v.slice(0, 15))}
                style={styles.input}
                maxLength={15}
              />
            </Field>
            <Field label="Wake interval (sec)" hint="How often the sensor wakes to broadcast. Min 5.">
              <TextInput
                testID="sleep-input"
                value={sleep}
                onChangeText={(v) => setSleep(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={5}
              />
            </Field>
          </Section>

          <View style={styles.macNote}>
            <Text style={styles.macNoteText}>MAC · {tank.mac}</Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            testID="save-button"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: accent },
              pressed && { opacity: 0.85 },
              saving && { opacity: 0.6 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.saveBtnText}>Save all</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldControl}>{children}</View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  section: { marginTop: 20 },
  sectionTitle: {
    color: '#6E6E76',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginLeft: 12,
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: '#12121C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  field: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  fieldLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  fieldControl: { marginTop: 8 },
  fieldHint: { color: '#4A4A55', fontSize: 11, marginTop: 6, lineHeight: 16 },
  input: {
    backgroundColor: '#1A1A2A',
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  readOnly: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 2, borderColor: '#2A2A38',
  },
  swatchSelected: { borderColor: '#FFFFFF' },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  hexHash: { color: '#6E6E76', fontSize: 18, fontWeight: '600' },
  hexPreview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A38' },

  macNote: { marginTop: 24, alignItems: 'center' },
  macNoteText: { color: '#4A4A55', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  footer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2A',
    backgroundColor: '#0A0A14',
  },
  saveBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A14' },
});
