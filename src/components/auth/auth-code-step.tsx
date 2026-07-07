import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
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
        placeholderTextColor={DesignTokens.color.inkPlaceholder}
        style={styles.input}
      />

      <PrimaryButton
        testID="auth-code-verify"
        fullWidth
        disabled={verifyDisabled}
        onPress={onVerify}
        title={pending ? 'Verifying…' : 'Verify'}
      />

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
        <ThemedText type="small" style={[styles.linkText, styles.secondaryText]}>
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
    borderColor: DesignTokens.color.accentBorderAlt,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
    color: DesignTokens.color.ink.light,
    fontFamily: DesignTokens.fontFamily.mono,
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  textButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  secondaryText: {
    color: DesignTokens.color.brand.light,
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.6,
  },
});
