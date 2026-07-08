import { StyleSheet, View } from 'react-native';

import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';
import { formatInviteCode, inviteLinkFor } from '@/lib/invite-code';

import { PrimaryButton } from './primary-button';
import { QrCode } from './qr-code';
import { ThemedText } from './themed-text';

type Props = {
  code: string;
  onShare: () => void;
  testID?: string;
};

export function InviteShareCard({ code, onShare, testID }: Props) {
  return (
    <View testID={testID} style={styles.card}>
      <ThemedText type="smallBold">Your pod code</ThemedText>
      <ThemedText type="title" selectable testID="invite-share-code" style={styles.code}>
        {formatInviteCode(code)}
      </ThemedText>
      <QrCode value={inviteLinkFor(code)} testID="invite-share-qr" />
      <ThemedText type="small">Have your partner scan this or type the code to pair.</ThemedText>
      <PrimaryButton testID="invite-share-button" title="Share invite" onPress={onShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: DesignTokens.color.surface.light,
    borderRadius: DesignTokens.radius.md,
    padding: Spacing.three,
    gap: Spacing.two,
    ...DesignTokens.elevation.card,
  },
  code: {
    fontFamily: DesignTokens.fontFamily.mono,
    letterSpacing: 1.2,
  },
});
