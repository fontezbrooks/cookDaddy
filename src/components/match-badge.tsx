import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

type MatchBadgeProps = {
  label: string;
  testID?: string;
};

export function MatchBadge({ label, testID }: MatchBadgeProps) {
  return (
    <LinearGradient
      colors={[DesignTokens.color.badgeGradientStart, DesignTokens.color.badgeGradientEnd]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.badge}
      testID={testID}
    >
      <Text style={styles.label}>{label}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: Spacing.one,
    borderRadius: DesignTokens.radius.pill,
  },
  label: {
    color: '#FFFFFF',
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
  },
});
