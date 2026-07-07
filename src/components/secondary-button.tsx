import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

type SecondaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
};

export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  testID,
  style,
  fullWidth = false,
}: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        fullWidth ? styles.fullWidth : styles.inline,
        disabled && styles.disabled,
        style,
      ]}
      testID={testID}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: 'transparent',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    color: DesignTokens.color.brand.light,
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    fontSize: 14,
    lineHeight: 20,
  },
});
