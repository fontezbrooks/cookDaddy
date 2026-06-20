import { Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DesignTokens, resolveThemedColor } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

export interface AuthCodeStepProps {
  email: string;
  code: string;
  onChangeCode: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
  resendCooldown: number;
  pending: boolean;
}

export function AuthCodeStep({
  email,
  code,
  onChangeCode,
  onVerify,
  onResend,
  onChangeEmail,
  resendCooldown,
  pending,
}: AuthCodeStepProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const verifyDisabled = pending || code.length < 6;
  const resendDisabled = resendCooldown > 0 || pending;

  return (
    <View style={styles.container}>
      <ThemedText type="small" testID="auth-code-caption">
        Enter the 6-digit code we sent to {email}.
      </ThemedText>

      <TextInput
        testID="auth-code-input"
        value={code}
        onChangeText={onChangeCode}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        placeholder="123456"
        placeholderTextColor={resolveThemedColor(DesignTokens.color.inkMuted, scheme)}
        style={[
          styles.input,
          {
            backgroundColor: resolveThemedColor(DesignTokens.color.surface, scheme),
            borderColor: resolveThemedColor(DesignTokens.color.borderMuted, scheme),
            color: resolveThemedColor(DesignTokens.color.ink, scheme),
          },
        ]}
      />

      <Pressable
        testID="auth-code-verify"
        accessibilityRole="button"
        disabled={verifyDisabled}
        onPress={onVerify}
        style={[styles.verifyButton, verifyDisabled && styles.disabled]}
      >
        <ThemedText type="smallBold" style={styles.verifyText}>
          {pending ? 'Verifying…' : 'Verify'}
        </ThemedText>
      </Pressable>

      <Pressable
        testID="auth-code-resend"
        accessibilityRole="button"
        disabled={resendDisabled}
        onPress={onResend}
        style={[styles.textButton, resendDisabled && styles.disabled]}
      >
        <ThemedText type="smallBold" style={styles.secondaryText}>
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </ThemedText>
      </Pressable>

      <Pressable
        testID="auth-code-change-email"
        accessibilityRole="button"
        onPress={onChangeEmail}
        style={styles.textButton}
      >
        <ThemedText
          type="small"
          style={[
            styles.linkText,
            { color: resolveThemedColor(DesignTokens.color.inkMuted, scheme) },
          ]}
        >
          Use a different email
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: DesignTokens.radius.md,
    fontFamily: DesignTokens.fontFamily.mono,
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  verifyButton: {
    alignItems: 'center',
    backgroundColor: DesignTokens.color.persimmonDeep,
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  verifyText: {
    color: DesignTokens.color.textOnDark,
  },
  textButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  secondaryText: {
    color: DesignTokens.color.persimmonDeep,
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.6,
  },
});
