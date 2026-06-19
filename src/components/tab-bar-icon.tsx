import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { DesignTokens } from '@/constants/design-tokens';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const ACTIVE_SCALE = 1.12;

type TabBarIconProps = {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  focused: boolean;
  color: ColorValue;
  size: number;
};

export function TabBarIcon({ name, focused, color, size }: TabBarIconProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(focused && !reduced ? ACTIVE_SCALE : 1);

  useEffect(() => {
    const target = focused ? ACTIVE_SCALE : 1;
    scale.value = reduced ? 1 : withSpring(target, DesignTokens.motion.springs.avatar);
  }, [focused, reduced, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </Animated.View>
  );
}
