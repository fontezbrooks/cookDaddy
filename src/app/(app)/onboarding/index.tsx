import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DietaryChips } from '@/components/dietary-chips';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { useCreatePodInvite } from '@/lib/use-create-pod-invite';
import { useOnboardingStore } from '@/state/useOnboardingStore';

export default function OnboardingScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const progress = useOnboardingStore((s) => (userId ? s.completedByUser[userId] : undefined));
  const setStep = useOnboardingStore((s) => s.setStep);
  const complete = useOnboardingStore((s) => s.complete);
  const { capture } = useAnalytics();
  const [step, setLocalStep] = useState(progress?.step ?? 0);
  const [skippedSteps, setSkippedSteps] = useState(0);

  useEffect(() => {
    capture('onboarding_started', {});
  }, [capture]);

  const advance = (skipped: boolean) => {
    if (!userId) return;
    const next = Math.min(step + 1, 2);
    capture('onboarding_step_completed', { step, skipped });
    setStep(userId, next);
    setLocalStep(next);
    if (skipped) setSkippedSteps((count) => count + 1);
  };

  const finish = (skipped: boolean) => {
    if (!userId) return;
    const finalSkippedSteps = skipped ? skippedSteps + 1 : skippedSteps;
    capture('onboarding_step_completed', { step, skipped });
    complete(userId);
    capture('onboarding_completed', { skipped_steps: finalSkippedSteps });
    router.replace('/home');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {step === 0 ? <IntroStep onNext={() => advance(false)} /> : null}
        {step === 1 ? <PodStep onNext={() => advance(false)} onSkip={() => advance(true)} /> : null}
        {step === 2 ? (
          <DietaryStep onDone={() => finish(false)} onSkip={() => finish(true)} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function IntroStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.step} testID="onboarding-intro">
      <ThemedText type="title">Cook together without the dinner debate</ThemedText>
      <View style={styles.cardRow}>
        <ValueCard title="Swipe" copy="Browse dinner ideas in a shared session." />
        <ValueCard title="Match" copy="See the recipes you both want." />
        <ValueCard title="Cook" copy="Turn matches into meals and shopping lists." />
      </View>
      <Pressable testID="onboarding-next" style={styles.cta} onPress={onNext}>
        <ThemedText type="small" style={styles.ctaText}>
          Get started
        </ThemedText>
      </Pressable>
    </View>
  );
}

function PodStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { createInvite, hint, isPending } = useCreatePodInvite();

  return (
    <View style={styles.step} testID="onboarding-pod">
      <ThemedText type="title">Invite your cooking partner</ThemedText>
      <ThemedText type="small">
        Create an invite link and share it. Your partner joins your pod when they open the link.
      </ThemedText>
      <Pressable
        testID="onboarding-create-invite"
        style={[styles.cta, isPending && styles.ctaDisabled]}
        disabled={isPending}
        onPress={() => createInvite()}
      >
        <ThemedText type="small" style={styles.ctaText}>
          {isPending ? 'Creating link…' : 'Create invite link'}
        </ThemedText>
      </Pressable>
      {hint ? (
        <ThemedText type="small" testID="onboarding-invite-hint">
          {hint}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Pressable testID="onboarding-skip" style={styles.secondaryCta} onPress={onSkip}>
          <ThemedText type="small">Skip for now</ThemedText>
        </Pressable>
        <Pressable testID="onboarding-next" style={styles.cta} onPress={onNext}>
          <ThemedText type="small" style={styles.ctaText}>
            Next
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function DietaryStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  return (
    <View style={styles.step} testID="onboarding-dietary">
      <ThemedText type="title">Set dietary preferences</ThemedText>
      <ThemedText type="small">
        Recipes that conflict with these will be filtered out of your decks.
      </ThemedText>
      <DietaryChips />
      <View style={styles.actions}>
        <Pressable testID="onboarding-skip" style={styles.secondaryCta} onPress={onSkip}>
          <ThemedText type="small">Skip</ThemedText>
        </Pressable>
        <Pressable testID="onboarding-finish" style={styles.cta} onPress={onDone}>
          <ThemedText type="small" style={styles.ctaText}>
            Done
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function ValueCard({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={styles.valueCard}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {copy}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.four },
  step: { flex: 1, justifyContent: 'center', gap: Spacing.three },
  cardRow: { gap: Spacing.two },
  valueCard: {
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontWeight: '600' },
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
