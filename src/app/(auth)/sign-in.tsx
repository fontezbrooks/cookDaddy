import { useOAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthMethodStep, type AuthMode } from '@/components/auth/auth-method-step';
import { AuthCodeStep } from '@/components/auth/auth-code-step';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DesignTokens } from '@/constants/design-tokens';
import { useAnalytics } from '@/lib/analytics';
import { mapClerkError } from '@/lib/auth/clerk-errors';

export default function SignInScreen() {
  const router = useRouter();
  const analytics = useAnalytics();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { startOAuthFlow: startApple } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: startGoogle } = useOAuth({ strategy: 'oauth_google' });
  const { signIn, setActive: setActiveSignIn } = useSignIn();
  const { signUp, setActive: setActiveSignUp } = useSignUp();

  // Only honor in-app paths ("/invite/foo"). Reject empty, schemeful, and
  // protocol-relative ("//foo") values so a malicious link can't bounce the
  // user to an external surface dressed up as our app.
  const postSignInTarget = useMemo<string>(() => {
    if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect;
    }
    return '/home';
  }, [redirect]);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [step, setStep] = useState<'method' | 'code'>('method');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<
    'idle' | 'apple' | 'google' | 'email' | 'verify' | 'resend'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<'signin' | 'signup' | undefined>(undefined);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    if (resendCooldown <= 0) return undefined;

    cooldownIntervalRef.current = setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [resendCooldown]);

  const handleOAuth = useCallback(
    async (
      provider: 'apple' | 'google',
      start: () => Promise<{
        createdSessionId?: string | null;
        setActive?: (opts: { session: string }) => Promise<unknown>;
      }>,
    ) => {
      setError(null);
      setPending(provider);
      try {
        const { createdSessionId, setActive } = await start();
        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          analytics.capture('signed_in', { provider });
          router.replace(postSignInTarget as never);
        }
      } catch (err) {
        setError(mapClerkError(err).message);
      } finally {
        setPending('idle');
      }
    },
    [analytics, router, postSignInTarget],
  );

  const startEmail = useCallback(async () => {
    setError(null);
    setSwitchTo(undefined);
    setPending('email');
    if (mode === 'signup' ? !signUp : !signIn) {
      setPending('idle');
      return;
    }
    try {
      if (mode === 'signup') {
        await signUp!.create({ emailAddress: email });
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else {
        await signIn!.create({ identifier: email, strategy: 'email_code' });
      }
      setStep('code');
      setResendCooldown(30);
    } catch (err) {
      const mapped = mapClerkError(err);
      setError(mapped.message);
      setSwitchTo(mapped.switchTo);
    } finally {
      setPending('idle');
    }
  }, [email, mode, signIn, signUp]);

  const verify = useCallback(async () => {
    setError(null);
    setPending('verify');
    if (mode === 'signup' ? !signUp || !setActiveSignUp : !signIn || !setActiveSignIn) {
      setPending('idle');
      return;
    }
    try {
      let completed = false;
      if (mode === 'signup') {
        const res = await signUp!.attemptEmailAddressVerification({ code });
        if (res.status === 'complete' && res.createdSessionId) {
          await setActiveSignUp!({ session: res.createdSessionId });
          completed = true;
        }
      } else {
        const res = await signIn!.attemptFirstFactor({ strategy: 'email_code', code });
        if (res.status === 'complete' && res.createdSessionId) {
          await setActiveSignIn!({ session: res.createdSessionId });
          completed = true;
        }
      }
      if (completed) {
        analytics.capture('signed_in', { provider: 'email' });
        router.replace(postSignInTarget as never);
      } else {
        setError('Could not complete sign-in. Please request a new code and try again.');
      }
    } catch (err) {
      setError(mapClerkError(err).message);
    } finally {
      setPending('idle');
    }
  }, [
    analytics,
    code,
    mode,
    postSignInTarget,
    router,
    setActiveSignIn,
    setActiveSignUp,
    signIn,
    signUp,
  ]);

  const resend = useCallback(async () => {
    setPending('resend');
    if (mode === 'signup' ? !signUp : !signIn) {
      setPending('idle');
      return;
    }
    try {
      if (mode === 'signup') {
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else {
        await signIn!.create({ identifier: email, strategy: 'email_code' });
      }
      setResendCooldown(30);
      setError(null);
    } catch (err) {
      setError(mapClerkError(err).message);
    } finally {
      setPending('idle');
    }
  }, [email, mode, signIn, signUp]);

  const changeEmail = useCallback(() => {
    setStep('method');
    setCode('');
    setError(null);
  }, []);

  const toggleMode = useCallback((next: AuthMode) => {
    setMode(next);
    setError(null);
    setSwitchTo(undefined);
  }, []);

  const applySwitch = useCallback(() => {
    if (switchTo) {
      setMode(switchTo);
      setError(null);
      setSwitchTo(undefined);
      setStep('method');
    }
  }, [switchTo]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" testID="sign-in-title">
          Welcome to cookDaddy
        </ThemedText>
        <ThemedText type="small">Sign in to start swiping with your partner.</ThemedText>

        {step === 'method' ? (
          <AuthMethodStep
            mode={mode}
            onToggleMode={toggleMode}
            email={email}
            onChangeEmail={setEmail}
            onSubmitEmail={startEmail}
            onOAuth={(provider) =>
              handleOAuth(provider, provider === 'apple' ? startApple : startGoogle)
            }
            pending={
              pending === 'apple' || pending === 'google' || pending === 'email' ? pending : 'idle'
            }
            disabled={pending !== 'idle'}
          />
        ) : (
          <AuthCodeStep
            email={email}
            code={code}
            onChangeCode={setCode}
            onVerify={verify}
            onResend={resend}
            onChangeEmail={changeEmail}
            resendCooldown={resendCooldown}
            pending={pending === 'verify' || pending === 'resend'}
          />
        )}

        {error ? (
          <Text testID="sign-in-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {switchTo ? (
          <Pressable testID="auth-switch-mode" accessibilityRole="button" onPress={applySwitch}>
            <ThemedText type="smallBold" style={styles.switchLink}>
              {switchTo === 'signin' ? 'Switch to Sign in' : 'Switch to Sign up'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  error: { color: DesignTokens.color.dangerDeep, marginTop: Spacing.two },
  switchLink: { color: DesignTokens.color.persimmonDeep, marginTop: Spacing.one },
});
