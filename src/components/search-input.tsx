import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

type SearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
};

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search our recipes...',
  testID,
}: SearchInputProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons color={DesignTokens.color.inkPlaceholder} name="magnify" size={18} />
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={DesignTokens.color.inkPlaceholder}
        style={styles.input}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: DesignTokens.color.accentBorderAlt,
    borderRadius: DesignTokens.radius.md,
    backgroundColor: DesignTokens.color.surface.light,
    ...DesignTokens.elevation.card,
  },
  input: {
    flex: 1,
    color: DesignTokens.color.ink.light,
    fontFamily: DesignTokens.fontFamily.body,
    fontSize: 16,
  },
});
