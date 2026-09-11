/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Determines if a point should be included based on its score and selected severity thresholds
 * @param score - The anomaly score
 * @param selectedSeverity - Array of selected severity thresholds
 * @returns True if the point should be included in the results
 */
export function shouldIncludePointByScore(
  score: number,
  selectedSeverity: Array<{ min: number; max?: number }>
): boolean {
  // Always include points with score 0, or if no severity thresholds are selected
  if (score === 0 || selectedSeverity.length === 0) {
    return true;
  }

  return selectedSeverity.some((threshold) => {
    if (threshold.max !== undefined) {
      return score >= threshold.min && score <= threshold.max;
    } else {
      return score >= threshold.min;
    }
  });
}
