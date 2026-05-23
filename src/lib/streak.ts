export const STREAK_THRESHOLD = 3;

export function computeStreakLength(
  recipeIds: string[],
  index: number,
  localRight: ReadonlySet<string>,
  partnerRight: ReadonlySet<string>,
): number {
  let count = 0;

  for (let k = index - 1; k >= 0; k -= 1) {
    const recipeId = recipeIds[k];
    if (!recipeId || !localRight.has(recipeId) || !partnerRight.has(recipeId)) break;
    count += 1;
  }

  return count;
}

export function isStreakActive(
  recipeIds: string[],
  index: number,
  localRight: ReadonlySet<string>,
  partnerRight: ReadonlySet<string>,
): boolean {
  return computeStreakLength(recipeIds, index, localRight, partnerRight) >= STREAK_THRESHOLD;
}
