import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DietaryChips } from '@/components/dietary-chips';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DesignTokens } from '@/constants/design-tokens';
import { Colors, Spacing } from '@/constants/theme';
import { useAnalytics } from '@/lib/analytics';
import { useCreatePodInvite } from '@/lib/use-create-pod-invite';
import { useOnboardingStore } from '@/state/useOnboardingStore';

export default function OnboardingScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const progress = useOnboardingStore((s) => (userId ? s.completedByUser[userId] : undefined));
  const recordSkip = useOnboardingStore((s) => s.recordSkip);
  const setStep = useOnboardingStore((s) => s.setStep);
  const complete = useOnboardingStore((s) => s.complete);
  const { capture } = useAnalytics();
  const initialStepRef = useRef(progress?.step ?? 0);
  const [step, setLocalStep] = useState(initialStepRef.current);

  useEffect(() => {
    if (initialStepRef.current === 0) {
      capture('onboarding_started', {});
    }
  }, [capture]);

  const advance = (skipped: boolean) => {
    if (!userId) return;
    const next = Math.min(step + 1, 2);
    capture('onboarding_step_completed', { step, skipped });
    if (skipped) recordSkip(userId);
    setStep(userId, next);
    setLocalStep(next);
  };

  const finish = (skipped: boolean) => {
    if (!userId) return;
    const finalSkippedSteps = skipped ? recordSkip(userId) : (progress?.skipped ?? 0);
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
      <PrimaryButton testID="onboarding-next" onPress={onNext} title="Get started" />
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
      <PrimaryButton
        testID="onboarding-create-invite"
        disabled={isPending}
        onPress={() => createInvite()}
        title={isPending ? 'Creating link…' : 'Create invite link'}
      />
      {hint ? (
        <ThemedText type="small" testID="onboarding-invite-hint">
          {hint}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Pressable testID="onboarding-skip" style={styles.secondaryCta} onPress={onSkip}>
          <ThemedText type="small">Skip for now</ThemedText>
        </Pressable>
        <PrimaryButton testID="onboarding-next" onPress={onNext} title="Next" />
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
        <PrimaryButton testID="onboarding-finish" onPress={onDone} title="Done" />
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
  safe: { flex: 1, backgroundColor: DesignTokens.color.canvas.light },
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
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
