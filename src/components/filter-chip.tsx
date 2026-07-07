import { Pressable, StyleSheet, Text } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';

type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
};

export function FilterChip({ label, active, onPress, testID }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.active : styles.inactive]}
      testID={testID}
    >
      <Text style={[styles.label, active ? styles.activeLabel : styles.inactiveLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: DesignTokens.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  active: {
    backgroundColor: DesignTokens.color.accent,
    shadowColor: '#311E09',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 2,
  },
  inactive: {
    backgroundColor: DesignTokens.color.surface.light,
    borderWidth: 1,
    borderColor: DesignTokens.color.inkPlaceholder,
  },
  label: {
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    fontSize: 14,
  },
  activeLabel: {
    color: DesignTokens.color.onAccent,
  },
  inactiveLabel: {
    color: DesignTokens.color.inkBody.light,
  },
});
