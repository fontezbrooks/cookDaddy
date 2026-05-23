// MATCH-UX §10/§12 mandates a reduced-motion fallback: all spring/scale/flip
// sequences collapse to a 250ms crossfade. Two sources can request it:
//
//   1. OS-level — React Native's AccessibilityInfo.isReduceMotionEnabled.
//   2. App-level — Settings → Vibes → Animations OFF (P6e). §12 explicitly
//      says "Animations OFF cascades to reduce-motion behavior".
//
// Either source flips the hook's return value to true.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useSettingsStore } from '@/state/useSettingsStore';

export function useReducedMotion(): boolean {
  const [osReduced, setOsReduced] = useState(false);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setOsReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => {
      setOsReduced(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return osReduced || !animationsEnabled;
}
