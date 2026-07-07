import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MatchBadge } from '@/components/match-badge';
import { DesignTokens } from '@/constants/design-tokens';
import { Spacing } from '@/constants/theme';

type RecipeCardProps = {
  title: string;
  imageUrl?: string;
  timeLabel?: string;
  tag?: string;
  matchLabel?: string;
  favorite?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
  testID?: string;
  variant?: 'grid' | 'featured';
};

export function RecipeCard({
  title,
  imageUrl,
  timeLabel,
  tag,
  matchLabel,
  favorite = false,
  onPress,
  onToggleFavorite,
  testID,
  variant = 'grid',
}: RecipeCardProps) {
  const isFeatured = variant === 'featured';
  const imageHeight = isFeatured ? 192 : 128;
  const favoriteTestID = testID ? `${testID}-fav` : 'recipe-card-fav';

  const content = (
    <>
      <View style={[styles.imageFrame, { height: imageHeight }]}>
        {imageUrl ? (
          <Image contentFit="cover" source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={styles.placeholder} />
        )}
        {onToggleFavorite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: favorite }}
            onPress={onToggleFavorite}
            style={styles.favoriteButton}
            testID={favoriteTestID}
          >
            <MaterialCommunityIcons
              color={DesignTokens.color.accent}
              name={favorite ? 'heart' : 'heart-outline'}
              size={14}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.content, isFeatured && styles.featuredContent]}>
        {matchLabel ? (
          <MatchBadge label={matchLabel} testID={testID ? `${testID}-badge` : undefined} />
        ) : null}
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {timeLabel || tag ? (
          <View style={styles.metaRow}>
            {timeLabel ? (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  color={DesignTokens.color.inkBody.light}
                  name="clock-outline"
                  size={14}
                />
                <Text style={styles.metaText}>{timeLabel}</Text>
              </View>
            ) : null}
            {timeLabel && tag ? <Text style={styles.metaText}>·</Text> : null}
            {tag ? <Text style={styles.metaText}>{tag}</Text> : null}
          </View>
        ) : null}
      </View>
    </>
  );

  const cardStyle = [styles.card, isFeatured ? styles.featuredCard : styles.gridCard];

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={cardStyle} testID={testID}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: DesignTokens.color.surface.light,
    ...DesignTokens.elevation.card,
  },
  gridCard: {
    borderRadius: DesignTokens.radius.md,
  },
  featuredCard: {
    borderRadius: DesignTokens.radius.lg,
  },
  imageFrame: {
    position: 'relative',
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: DesignTokens.color.canvas.light,
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    padding: Spacing.one,
    borderRadius: DesignTokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  content: {
    gap: Spacing.one,
    padding: 12,
  },
  featuredContent: {
    padding: Spacing.three,
  },
  title: {
    color: DesignTokens.color.ink.light,
    fontFamily: DesignTokens.fontFamily.bodySemibold,
    fontSize: 16,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  metaText: {
    color: DesignTokens.color.inkBody.light,
    fontFamily: DesignTokens.fontFamily.body,
    fontSize: 14,
  },
});
