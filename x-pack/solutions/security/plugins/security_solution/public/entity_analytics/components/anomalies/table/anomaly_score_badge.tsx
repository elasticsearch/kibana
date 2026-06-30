/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiHealth, useEuiTheme } from '@elastic/eui';
import { ML_ANOMALY_THRESHOLD, getThemeResolvedSeverityColor } from '@kbn/ml-anomaly-utils';

/**
 * Map a raw anomaly score (0–100) to the ML severity bucket. Buckets mirror
 * the swim lane legend so the score dot and the swim lane cell share a color.
 */
const getSeverityThresholdForScore = (score: number): number => {
  if (score >= 75) return ML_ANOMALY_THRESHOLD.CRITICAL;
  if (score >= 50) return ML_ANOMALY_THRESHOLD.MAJOR;
  if (score >= 25) return ML_ANOMALY_THRESHOLD.MINOR;
  if (score >= 3) return ML_ANOMALY_THRESHOLD.WARNING;
  return ML_ANOMALY_THRESHOLD.LOW;
};

export const AnomalyScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  const { euiTheme } = useEuiTheme();
  const color = getThemeResolvedSeverityColor(getSeverityThresholdForScore(score), euiTheme);
  return (
    <EuiHealth color={color} textSize="xs">
      {Math.round(score)}
    </EuiHealth>
  );
};
