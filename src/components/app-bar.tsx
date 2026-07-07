import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

type AppBarProps = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  testID?: string;
};

export function AppBar({ title, onBack, right, testID }: AppBarProps) {
  const backTestID = testID ? `${testID}-back` : 'app-bar-back';

  return (
    <View style={styles.container} testID={testID}>
      <BlurView intensity={24} tint="light" style={styles.backdrop} />
      <View pointerEvents="none" style={styles.overlay} />
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.iconButton}
            testID={backTestID}
          >
            <MaterialCommunityIcons
              color={DesignTokens.color.brandDeep.light}
              name="chevron-left"
              size={24}
            />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      <View style={styles.titleSlot}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.side}>{right ?? <View style={styles.spacer} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    overflow: 'hidden',
    ...DesignTokens.elevation.appBar,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,248,249,0.8)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  side: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  title: {
    color: DesignTokens.color.brandDeep.light,
    fontFamily: DesignTokens.fontFamily.displaySemibold,
    fontSize: 24,
    lineHeight: 32,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 40,
    height: 40,
  },
});
