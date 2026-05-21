/**
 * Dynamic Ranking Engine for InkArena
 * Maps career totalScore to balanced rank tiers.
 */

const TIERS = [
  { name: 'Rank I (Novice)', min: 0, max: 499 },
  { name: 'Rank II (Bronze)', min: 500, max: 1499 },
  { name: 'Rank III (Silver)', min: 1500, max: 4999 },
  { name: 'Rank IV (Gold)', min: 5000, max: 9999 },
  { name: 'Rank V (Platinum)', min: 10000, max: 24999 },
  { name: 'Rank VI (Diamond)', min: 25000, max: Infinity }
];

/**
 * Calculates rank information based on career totalScore.
 * @param {number} totalScore 
 * @returns {Object} rankInfo
 */
export function getRankInfo(totalScore) {
  const score = Math.max(0, totalScore || 0);
  const currentTierIndex = TIERS.findIndex(t => score >= t.min && score <= t.max);
  const currentTier = TIERS[currentTierIndex === -1 ? 0 : currentTierIndex];
  
  if (currentTierIndex === TIERS.length - 1 || currentTier.max === Infinity) {
    return {
      currentRank: currentTier.name,
      nextRank: 'Max Rank Reached',
      progress: 100,
      pointsToNext: 0,
      description: 'You have reached the ultimate rank!'
    };
  }

  const nextTier = TIERS[currentTierIndex + 1];
  const tierRange = currentTier.max - currentTier.min + 1;
  const tierProgress = score - currentTier.min;
  const progressPercent = Math.min(100, Math.max(0, Math.round((tierProgress / tierRange) * 100)));
  const pointsToNext = nextTier.min - score;

  return {
    currentRank: currentTier.name,
    nextRank: nextTier.name,
    progress: progressPercent,
    pointsToNext,
    description: `Approx. ${pointsToNext.toLocaleString()} points to ${nextTier.name}`
  };
}
