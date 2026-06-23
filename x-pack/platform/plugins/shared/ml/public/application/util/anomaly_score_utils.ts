/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { getSeverityThresholdMax } from '../../../common/util/severity_threshold';

/**
 * Determines if a point should be included based on its score and selected severity thresholds
 * @param score - The anomaly score
 * @param selectedSeverity - Array of selected severity thresholds
 * @returns True if the point should be included in the results
 */
export function shouldIncludePointByScore(
  score: number,
  selectedSeverity: SeverityThreshold[]
): boolean {
  // Always include points with score 0, or if no severity thresholds are selected
  if (score === 0 || selectedSeverity.length === 0) {
    return true;
  }

  // Filter based on selected severity thresholds
  // This handles non-contiguous ranges like [0-3, 75+] where API filtering by min
  // would return all scores, but we only want specific ranges
  return selectedSeverity.some((threshold) => {
    const minScore = threshold.min;
    const maxScore = getSeverityThresholdMax(threshold);

    if (maxScore !== undefined) {
      return score >= minScore && score <= maxScore;
    } else {
      return score >= minScore;
    }
  });
}
