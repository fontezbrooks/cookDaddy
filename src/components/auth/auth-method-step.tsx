import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

export type AuthMode = 'signin' | 'signup';

export interface AuthMethodStepProps {
  mode: AuthMode;
  onToggleMode: (mode: AuthMode) => void;
  email: string;
  onChangeEmail: (value: string) => void;
  onSubmitEmail: () => void;
  onOAuth: (provider: 'apple' | 'google') => void;
  pending: 'idle' | 'apple' | 'google' | 'email';
  disabled: boolean;
}

export function AuthMethodStep({
  mode,
  onToggleMode,
  email,
  onChangeEmail,
  onSubmitEmail,
  onOAuth,
  pending,
  disabled,
}: AuthMethodStepProps) {
  const emailDisabled = disabled || email.length === 0;

  return (
    <View style={styles.container}>
      <View testID="auth-mode-toggle" style={styles.modeToggle}>
        <Pressable
          testID="auth-mode-signin"
          accessibilityRole="button"
          disabled={disabled}
          style={[
            styles.modeSegment,
            mode === 'signin' ? styles.modeSegmentActive : styles.modeSegmentInactive,
            disabled && styles.disabled,
          ]}
          onPress={() => onToggleMode('signin')}
        >
          <ThemedText
            type="smallBold"
            style={mode === 'signin' ? styles.modeTextActive : styles.modeTextInactive}
          >
            Sign in
          </ThemedText>
        </Pressable>

        <Pressable
          testID="auth-mode-signup"
          accessibilityRole="button"
          disabled={disabled}
          style={[
            styles.modeSegment,
            mode === 'signup' ? styles.modeSegmentActive : styles.modeSegmentInactive,
            disabled && styles.disabled,
          ]}
          onPress={() => onToggleMode('signup')}
        >
          <ThemedText
            type="smallBold"
            style={mode === 'signup' ? styles.modeTextActive : styles.modeTextInactive}
          >
            Sign up
          </ThemedText>
        </Pressable>
      </View>

      <TextInput
        testID="sign-in-email-input"
        placeholder="you@example.com"
        placeholderTextColor={DesignTokens.color.inkPlaceholder}
        value={email}
        onChangeText={onChangeEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.emailInput}
      />

      <PrimaryButton
        testID="sign-in-email-submit"
        fullWidth
        disabled={emailDisabled}
        onPress={onSubmitEmail}
        title={pending === 'email' ? 'Sending…' : 'Email me a code'}
      />

      <Pressable
        testID="sign-in-apple"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => onOAuth('apple')}
        style={[styles.secondaryButton, disabled && styles.disabled]}
      >
        <Text style={styles.secondaryButtonText}>
          {pending === 'apple' ? 'Signing in…' : 'Continue with Apple'}
        </Text>
      </Pressable>

      <Pressable
        testID="sign-in-google"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => onOAuth('google')}
        style={[styles.secondaryButton, disabled && styles.disabled]}
      >
        <Text style={styles.secondaryButtonText}>
          {pending === 'google' ? 'Signing in…' : 'Continue with Google'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  modeToggle: { flexDirection: 'row', gap: Spacing.two },
  modeSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  modeSegmentActive: {
    borderColor: DesignTokens.color.accent,
    backgroundColor: DesignTokens.color.accent,
  },
  modeSegmentInactive: {
    borderColor: DesignTokens.color.inkPlaceholder,
    backgroundColor: DesignTokens.color.surface.light,
  },
  modeTextActive: { color: DesignTokens.color.onAccent },
  modeTextInactive: { color: DesignTokens.color.inkBody.light },
  emailInput: {
    borderWidth: 1,
    borderColor: DesignTokens.color.accentBorderAlt,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: DesignTokens.radius.md,
    color: DesignTokens.color.ink.light,
    backgroundColor: DesignTokens.color.surface.light,
  },
  secondaryButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DesignTokens.color.inkPlaceholder,
    borderRadius: DesignTokens.radius.pill,
    paddingVertical: 14,
    backgroundColor: DesignTokens.color.surface.light,
  },
  secondaryButtonText: {
    color: DesignTokens.color.ink.light,
    fontFamily: DesignTokens.fontFamily.bodySemibold,
  },
  disabled: { opacity: 0.6 },
});
