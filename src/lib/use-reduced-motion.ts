// MATCH-UX §10 mandates a reduced-motion fallback: all spring/scale/flip
// sequences collapse to a 250ms crossfade. This hook reads the OS-level
// signal via React Native's AccessibilityInfo. A Settings-level
// "Animations" toggle (P6e) will compose with this — when implemented it
// can OR into this hook's return value.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => {
      setReduced(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
