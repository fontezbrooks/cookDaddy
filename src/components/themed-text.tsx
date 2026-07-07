import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: DesignTokens.fontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontFamily: DesignTokens.fontFamily.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontFamily: DesignTokens.fontFamily.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  display: {
    fontFamily: DesignTokens.fontFamily.display,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.96,
    fontWeight: 800,
  },
  title: {
    fontFamily: DesignTokens.fontFamily.displaySemibold,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 700,
  },
  subtitle: {
    fontFamily: DesignTokens.fontFamily.displaySemibold,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  link: {
    fontFamily: DesignTokens.fontFamily.bodyMedium,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    lineHeight: 30,
    fontSize: 14,
    color: DesignTokens.color.brand.light,
  },
  code: {
    fontFamily: DesignTokens.fontFamily.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 15,
  },
});
