// Global app settings: this display's group label, BLE / demo toggle,
// and a full list of every sensor heard so far (matches the Arduino
// "Tank Settings (all sensors seen)" section).

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTankStore, tankStore, selectAllTanks, selectKnownGroups } from '@/src/store/tankStore';
import { rgbHex, batteryPercentFromMv } from '@/src/ble/protocol';

export default function SettingsScreen() {
  const state = useTankStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [newGroup, setNewGroup] = useState('');
  const allTanks = selectAllTanks(state);
  const knownGroups = selectKnownGroups(state);
  const visibleGroups = state.settings.visibleGroups;

  const addGroup = () => {
    const g = newGroup.trim();
    if (!g) return;
    tankStore.addGroup(g);
    setNewGroup('');
  };

  const statusLine =
    state.settings.demoMode ? 'Demo mode — showing simulated tanks'
    : !state.bleAvailable ? 'BLE native module unavailable — build a development APK to use real BLE'
    : state.bleStatus === 'scanning' ? 'Scanning for TankMesh advertisements...'
    : state.bleStatus === 'permission-denied' ? 'Bluetooth permission was denied'
    : state.bleStatus === 'powered-off' ? 'Bluetooth is turned off'
    : state.bleStatus === 'error' ? `BLE error: ${state.bleError ?? 'unknown'}`
    : 'Idle';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A14' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]} testID="settings-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="back-button" style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}>
          <View style={styles.logoWrap}>
            <Image
              source={require('../assets/images/tankmesh-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Section title="Groups">
            <View style={styles.stackedField}>
              <Text style={styles.stackedLabel}>Visible groups</Text>
              <Text style={styles.stackedHint}>
                Tap to toggle. Only sensors whose group label is highlighted appear on the overview. Monitor multiple installs (e.g. Boat + RV) from one phone.
              </Text>
              <View style={styles.groupChipRow}>
                {knownGroups.length === 0 && (
                  <Text style={styles.chipEmpty}>No groups yet — add one below.</Text>
                )}
                {knownGroups.map((g) => {
                  const active = visibleGroups.includes(g);
                  const count = state.tanks.filter((t) => t.mesh?.prefix === g).length;
                  return (
                    <Pressable
                      key={g}
                      testID={`group-chip-${g}`}
                      onPress={() => tankStore.toggleGroupVisibility(g)}
                      style={[
                        styles.groupChip,
                        active ? styles.groupChipActive : styles.groupChipInactive,
                      ]}
                    >
                      {active && (
                        <Ionicons name="checkmark" size={13} color="#0A0A14" />
                      )}
                      <Text style={active ? styles.groupChipTextActive : styles.groupChipTextInactive}>
                        {g}
                      </Text>
                      {count > 0 && (
                        <View style={active ? styles.groupBadgeActive : styles.groupBadgeInactive}>
                          <Text style={active ? styles.groupBadgeTextActive : styles.groupBadgeTextInactive}>
                            {count}
                          </Text>
                        </View>
                      )}
                      {active && visibleGroups.length > 1 && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); tankStore.removeGroup(g); }}
                          hitSlop={6}
                          style={{ marginLeft: 2 }}
                        >
                          <Ionicons name="close-circle" size={14} color="rgba(10,10,20,0.5)" />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.stackedField}>
              <Text style={styles.stackedLabel}>Add a group</Text>
              <View style={styles.rowInput}>
                <TextInput
                  testID="new-group-input"
                  value={newGroup}
                  onChangeText={(v) => setNewGroup(v.slice(0, 15))}
                  onSubmitEditing={addGroup}
                  placeholder="e.g. Workshop"
                  placeholderTextColor="#4A4A55"
                  style={styles.input}
                  maxLength={15}
                  returnKeyType="done"
                />
                <Pressable
                  testID="add-group-button"
                  onPress={addGroup}
                  style={styles.saveInlineBtn}
                >
                  <Text style={styles.saveInlineText}>Add</Text>
                </Pressable>
              </View>
              <Text style={styles.stackedHint}>
                You can also create a group by assigning it to any sensor on its edit page — new groups appear here automatically.
              </Text>
            </View>
          </Section>

          <Section title="This display">

            <Field label="Demo mode" hint="Simulate 4 tanks for UI preview. Turn off to use real BLE (APK build only).">
              <Switch
                testID="demo-switch"
                value={state.settings.demoMode}
                onValueChange={(v) => tankStore.setDemoMode(v)}
                trackColor={{ true: '#2AB7FF', false: '#2A2A38' }}
                thumbColor="#FFFFFF"
              />
            </Field>

            <Field label="Alerts" hint="Vibrate when any tank crosses its min/max threshold. Set thresholds per-tank in each sensor's edit page.">
              <Switch
                testID="alerts-switch"
                value={state.settings.alertsEnabled}
                onValueChange={(v) => tankStore.setAlertsEnabled(v)}
                trackColor={{ true: '#FF5A5F', false: '#2A2A38' }}
                thumbColor="#FFFFFF"
              />
            </Field>

            <Field
              label="Lock-screen alerts"
              hint={
                state.settings.notificationsEnabled && state.settings.notificationsPermitted
                  ? 'Also push a notification to the lock screen when a tank trips.'
                  : state.settings.notificationsEnabled && !state.settings.notificationsPermitted
                    ? 'Permission denied — enable notifications for this app in your phone\'s Settings, then toggle back on.'
                    : 'Push a notification to the lock screen when a tank trips.'
              }
            >
              <Switch
                testID="notifications-switch"
                value={state.settings.notificationsEnabled && state.settings.notificationsPermitted}
                onValueChange={(v) => tankStore.setNotificationsEnabled(v)}
                trackColor={{ true: '#FF5A5F', false: '#2A2A38' }}
                thumbColor="#FFFFFF"
              />
            </Field>

            <View style={styles.stackedField}>
              <Text style={styles.stackedLabel}>Test alert</Text>
              <Text style={styles.stackedHint}>
                Fires one haptic + one lock-screen notification right now so you can confirm the plumbing works.
              </Text>
              <Pressable
                testID="test-alert-button"
                onPress={() => tankStore.testAlert()}
                style={({ pressed }) => [styles.testAlertBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
                <Text style={styles.testAlertText}>Send test alert</Text>
              </Pressable>
            </View>

            <Field label="BLE status">
              <Text style={styles.statusText} testID="ble-status-text">{statusLine}</Text>
            </Field>
          </Section>

          <Section title={`All sensors seen (${allTanks.length}/9)`}>
            <Text style={styles.helpText}>
              Every sensor this app has heard, regardless of group. Tap to open its edit page.
            </Text>
            {allTanks.length === 0 && (
              <Text style={styles.emptyText} testID="all-empty">
                Nothing yet. Waiting for TankMesh broadcasts.
              </Text>
            )}
            {allTanks.map((t) => {
              const color = rgbHex(t.colorRGB);
              const pct = batteryPercentFromMv(t.batteryMv);
              const inGroup = t.mesh?.prefix ? state.settings.visibleGroups.includes(t.mesh.prefix) : false;
              return (
                <Pressable
                  key={t.mac}
                  testID={`sensor-item-${t.mac}`}
                  onPress={() => router.push(`/tank/${encodeURIComponent(t.mac)}/settings`)}
                  style={({ pressed }) => [styles.sensorRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.sensorSwatch, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.sensorTop}>
                      <Text style={styles.sensorName} numberOfLines={1}>
                        {t.name ? t.name : '(unassigned)'}
                      </Text>
                      <Text style={styles.sensorPct}>{t.levelPercent}%</Text>
                    </View>
                    <View style={styles.sensorMeta}>
                      <Text style={styles.sensorMac}>{t.mac}</Text>
                    </View>
                    <View style={styles.sensorMeta}>
                      <MetaPill
                        label={t.mesh?.prefix ?? 'no group'}
                        active={inGroup}
                        color={inGroup ? '#00C48C' : '#6E6E76'}
                      />
                      {pct >= 0 && (
                        <MetaPill label={`Batt ${pct}%`} color="#8E8E93" active={false} />
                      )}
                      {!t.calMeshKnown && (
                        <MetaPill label="fetching" color="#F0B429" active={false} />
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#4A4A55" />
                </Pressable>
              );
            })}
          </Section>

          <Text style={styles.footer}>
            TankMesh companion app · BLE central (react-native-ble-plx){'\n'}
            Compatible with the ESP32 TankMesh v3 protocol
          </Text>
        </ScrollView>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View>{children}</View>
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function MetaPill({ label, color, active }: { label: string; color: string; active: boolean }) {
  return (
    <View style={[
      styles.pill,
      { borderColor: active ? color : '#2A2A38' },
      active && { backgroundColor: color + '22' },
    ]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
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
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  logoWrap: { alignItems: 'center', marginTop: 20, marginBottom: 4 },
  logo: { width: 220, height: 90 },

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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  fieldHint: { color: '#4A4A55', fontSize: 11, marginTop: 6, lineHeight: 16 },
  statusText: { color: '#8E8E93', fontSize: 13, textAlign: 'right', maxWidth: '65%' },
  rowInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1A1A2A',
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },

  groupChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chipEmpty: { color: '#4A4A55', fontSize: 12 },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  groupChipActive: {
    backgroundColor: '#2AB7FF',
    borderColor: '#2AB7FF',
  },
  groupChipInactive: {
    backgroundColor: '#1A1A2A',
    borderColor: '#2A2A38',
  },
  groupChipTextActive: { color: '#0A0A14', fontSize: 13, fontWeight: '700' },
  groupChipTextInactive: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  groupBadgeActive: {
    backgroundColor: 'rgba(10,10,20,0.25)',
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  groupBadgeInactive: {
    backgroundColor: '#2A2A38',
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  groupBadgeTextActive: { color: '#0A0A14', fontSize: 10, fontWeight: '800' },
  groupBadgeTextInactive: { color: '#8E8E93', fontSize: 10, fontWeight: '700' },

  testAlertBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FF5A5F',
  },
  testAlertText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stackedField: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  stackedLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  stackedHint: {
    color: '#4A4A55',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  saveInlineBtn: {
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#2AB7FF', borderRadius: 8,
  },
  saveInlineText: { color: '#000', fontWeight: '700', fontSize: 13 },
  helpText: { color: '#6E6E76', fontSize: 12, paddingVertical: 12, lineHeight: 18 },
  emptyText: { color: '#4A4A55', fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  sensorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A1A2A',
  },
  sensorSwatch: { width: 8, alignSelf: 'stretch', borderRadius: 4 },
  sensorTop: { flexDirection: 'row', justifyContent: 'space-between' },
  sensorName: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  sensorPct: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  sensorMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  sensorMac: { color: '#4A4A55', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },

  footer: { color: '#4A4A55', fontSize: 11, textAlign: 'center', marginTop: 32, lineHeight: 18 },
});
