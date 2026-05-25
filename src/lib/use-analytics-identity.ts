// Analytics identity lifecycle per DESIGN §17.2.

import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { usePodStore } from '@/state/usePodStore';

import { useAnalytics } from './analytics';

type AnalyticsPlatform = 'ios' | 'android';

function analyticsPlatform(): AnalyticsPlatform {
  return Platform.OS as AnalyticsPlatform;
}

export function resolveLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}

export function useAnalyticsIdentity(): void {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const activePodId = usePodStore((s) => s.activePodId);
  const partnerId = usePodStore((s) => s.partnerId);
  const analytics = useAnalytics();
  const appOpenedRef = useRef(false);
  const prevSignedInRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (appOpenedRef.current) return;
    appOpenedRef.current = true;
    analytics.capture('app_opened', {
      platform: analyticsPlatform(),
      app_version: Constants.expoConfig?.version ?? 'unknown',
      cold_start: true,
      locale: resolveLocale(),
    });
  }, [analytics]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    analytics.identify(userId, {
      display_name: user?.fullName ?? user?.username ?? undefined,
      created_at: user?.createdAt ? new Date(user.createdAt).toISOString() : undefined,
      platform: analyticsPlatform(),
      pod_id: activePodId ?? null,
    });
  }, [activePodId, analytics, isLoaded, isSignedIn, user, userId]);

  useEffect(() => {
    if (!isSignedIn || !activePodId) return;
    analytics.group('pod', activePodId, { member_count: partnerId ? 2 : 1 });
  }, [activePodId, analytics, isSignedIn, partnerId]);

  useEffect(() => {
    if (isLoaded && prevSignedInRef.current === true && isSignedIn === false) {
      analytics.reset();
    }
    if (isLoaded) {
      prevSignedInRef.current = isSignedIn;
    }
  }, [analytics, isLoaded, isSignedIn]);
}
