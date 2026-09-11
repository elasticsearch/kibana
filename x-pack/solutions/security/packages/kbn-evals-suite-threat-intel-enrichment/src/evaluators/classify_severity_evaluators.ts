/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { ClassifySeverityExample, ClassifySeverityResponse, SeverityLevel } from '../types';

const SEVERITY_ORDER: SeverityLevel[] = ['low', 'medium', 'high', 'critical'];

const rank = (level: SeverityLevel | undefined): number =>
  level ? SEVERITY_ORDER.indexOf(level) : -1;

/**
 * CODE evaluator: exact severity-level match. Strict signal for calibration
 * drift on the ordinal ladder.
 */
export const createSeverityExactEvaluator = (): Evaluator<
  ClassifySeverityExample,
  ClassifySeverityResponse
> => ({
  name: 'SeverityExactMatch',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const match = output?.level != null && output.level === expected?.level;
    return { score: match ? 1 : 0, label: output?.level ?? 'missing' };
  },
});

/**
 * CODE evaluator: severity within one level of the label scores 1. Severity is
 * an inherently ordinal judgement, so a single-step miss (e.g. high vs
 * critical) is tolerated while a two-step miss (e.g. low vs high) is not.
 */
export const createSeverityAdjacentEvaluator = (): Evaluator<
  ClassifySeverityExample,
  ClassifySeverityResponse
> => ({
  name: 'SeverityWithinOneLevel',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const predicted = rank(output?.level);
    const golden = rank(expected?.level);
    if (predicted < 0 || golden < 0) {
      return { score: 0, label: 'missing' };
    }
    const distance = Math.abs(predicted - golden);
    return {
      score: distance <= 1 ? 1 : 0,
      label: `distance_${distance}`,
    };
  },
});
