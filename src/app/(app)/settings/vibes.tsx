// Vibes settings (P6e, MATCH-UX §12). Three toggle rows bound to
// useSettingsStore. Defaults per spec:
//   • Haptics — ON
//   • Sound effects — OFF (opt-in, MATCH-UX §6)
//   • Animations — ON (toggling OFF cascades to reduce-motion via
//     useReducedMotion, MATCH-UX §10).

import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSettingsStore } from '@/state/useSettingsStore';

type Row = {
  testID: string;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
};

export default function VibesScreen() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const soundsEnabled = useSettingsStore((s) => s.soundsEnabled);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const setSoundsEnabled = useSettingsStore((s) => s.setSoundsEnabled);
  const setAnimationsEnabled = useSettingsStore((s) => s.setAnimationsEnabled);

  const rows: Row[] = [
    {
      testID: 'vibes-haptics',
      label: 'Haptics',
      description: 'Vibration on swipes and matches.',
      value: hapticsEnabled,
      onChange: setHapticsEnabled,
    },
    {
      testID: 'vibes-sounds',
      label: 'Sound effects',
      description: 'Match chimes. Respects system silent mode.',
      value: soundsEnabled,
      onChange: setSoundsEnabled,
    },
    {
      testID: 'vibes-animations',
      label: 'Animations',
      description: 'Turning off uses simple crossfades for the match overlay.',
      value: animationsEnabled,
      onChange: setAnimationsEnabled,
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title">Vibes</ThemedText>
        <ThemedText type="small">Tune how the app feels.</ThemedText>

        <View style={styles.rows}>
          {rows.map((row) => (
            <Pressable
              key={row.testID}
              testID={row.testID}
              accessibilityRole="switch"
              accessibilityState={{ checked: row.value }}
              accessibilityLabel={row.label}
              onPress={() => row.onChange(!row.value)}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <ThemedText type="default">{row.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.description}
                </ThemedText>
              </View>
              <Switch
                value={row.value}
                onValueChange={row.onChange}
                accessibilityLabel={`${row.label} toggle`}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  rows: { marginTop: Spacing.three, gap: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
