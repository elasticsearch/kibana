/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IlmPolicyForFlyout } from './types';
import { PHASE_ORDER } from '../phases';

type PhasesForStats = IlmPolicyForFlyout['phases'];

export interface IlmPolicySummaryStats {
  deleteAfter: string | null;
  phaseCount: number;
  downsampleStepCount: number;
}

export const getIlmPolicySummaryStats = (phases: PhasesForStats): IlmPolicySummaryStats => {
  const phaseCount = PHASE_ORDER.filter((phaseName) => Boolean(phases[phaseName])).length;

  const deleteAfter =
    phases.delete?.actions?.delete !== undefined && phases.delete?.min_age
      ? phases.delete.min_age
      : null;

  // Downsampling is only supported in the hot/warm/cold phases (not frozen).
  const downsampleStepCount = (['hot', 'warm', 'cold'] as const).reduce((count, phase) => {
    const fixedInterval = phases[phase]?.actions?.downsample?.fixed_interval;
    return fixedInterval?.trim() ? count + 1 : count;
  }, 0);

  return { deleteAfter, phaseCount, downsampleStepCount };
};
