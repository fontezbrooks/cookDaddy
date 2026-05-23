// Sign-in screen per DESIGN §4 + WORKFLOW §7.
//
// Three sign-in routes: Apple OAuth, Google OAuth, Email (Clerk magic-code).
// OAuth flows complete inside Clerk's SDK — on `createdSessionId`, we
// activate the session and redirect to /home.

import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { startOAuthFlow: startApple } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: startGoogle } = useOAuth({ strategy: 'oauth_google' });
  // setActive on the email flow is used after the code-entry step (P5).
  const { signIn } = useSignIn();

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<'idle' | 'apple' | 'google' | 'email'>('idle');
  const [error, setError] = useState<string | null>(null);

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
          router.replace('/home');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      } finally {
        setPending('idle');
      }
    },
    [router],
  );

  const handleEmail = useCallback(async () => {
    if (!signIn) return;
    setError(null);
    setPending('email');
    try {
      await signIn.create({ identifier: email, strategy: 'email_code' });
      // The actual code-entry step lands in a follow-up screen; for P4
      // shell we surface "check your email" and leave the rest as P5 work.
      setError('Check your email for a sign-in code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email sign-in failed');
    } finally {
      setPending('idle');
    }
  }, [email, signIn]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" testID="sign-in-title">
          Welcome to cookDaddy
        </ThemedText>
        <ThemedText type="small">Sign in to start swiping with your partner.</ThemedText>

        <View style={styles.actions}>
          <Pressable
            testID="sign-in-apple"
            style={styles.oauthButton}
            disabled={pending !== 'idle'}
            onPress={() => handleOAuth('apple', startApple)}
          >
            <Text style={styles.oauthButtonText}>
              {pending === 'apple' ? 'Signing in…' : 'Continue with Apple'}
            </Text>
          </Pressable>

          <Pressable
            testID="sign-in-google"
            style={styles.oauthButton}
            disabled={pending !== 'idle'}
            onPress={() => handleOAuth('google', startGoogle)}
          >
            <Text style={styles.oauthButtonText}>
              {pending === 'google' ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </Pressable>

          <TextInput
            testID="sign-in-email-input"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.emailInput}
          />
          <Pressable
            testID="sign-in-email-submit"
            style={styles.oauthButton}
            disabled={pending !== 'idle' || email.length === 0}
            onPress={handleEmail}
          >
            <Text style={styles.oauthButtonText}>
              {pending === 'email' ? 'Sending…' : 'Email me a sign-in code'}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <Text testID="sign-in-error" style={styles.error}>
            {error}
          </Text>
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
  actions: { gap: Spacing.two, marginTop: Spacing.four },
  oauthButton: {
    backgroundColor: '#111',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  oauthButtonText: { color: '#fff', fontWeight: '600' },
  emailInput: {
    borderWidth: 1,
    borderColor: '#888',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    color: '#000',
    backgroundColor: '#fff',
  },
  error: { color: '#b00020', marginTop: Spacing.two },
});
