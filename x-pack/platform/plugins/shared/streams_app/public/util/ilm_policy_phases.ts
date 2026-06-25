/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IlmPolicyDeletePhase,
  IlmPolicyPhase,
  IlmPolicyPhases,
  PhaseName,
} from '@kbn/streams-schema';
import { PHASE_ORDER } from '@kbn/data-lifecycle-phases';
import { last } from 'lodash';

import { parseDurationInSeconds } from './parse_duration';

export function orderIlmPhases(phases: IlmPolicyPhases) {
  const isPhase = (
    phase?: IlmPolicyPhase | IlmPolicyDeletePhase
  ): phase is IlmPolicyPhase | IlmPolicyDeletePhase => Boolean(phase);
  return PHASE_ORDER.map((phaseName) => phases[phaseName]).filter(isPhase);
}

const GROW_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const DEFAULT_GROW: GrowValue = 2;
export type GrowValue = (typeof GROW_VALUES)[number];

function toGrowValue(value: number): GrowValue {
  const clamped = Math.min(10, Math.max(2, Math.round(value)));
  return GROW_VALUES[clamped - 2];
}

interface PhaseWithMinAge {
  name: PhaseName;
  min_age?: string;
}

export const getIlmPhaseGrowValues = <Phase extends PhaseWithMinAge>(
  orderedPhases: Phase[]
): Array<GrowValue | false> => {
  if (orderedPhases.length === 0) return [];

  const totalDuration = parseDurationInSeconds(last(orderedPhases)!.min_age);

  return orderedPhases.map((phase, index, phases) => {
    const nextPhase = phases[index + 1];
    if (!nextPhase) {
      return phase.name === 'delete' ? false : DEFAULT_GROW;
    }

    const phaseDuration =
      parseDurationInSeconds(nextPhase.min_age) - parseDurationInSeconds(phase.min_age);
    return totalDuration ? toGrowValue((phaseDuration / totalDuration) * 10) : DEFAULT_GROW;
  });
};

export const getILMRatios = (
  value:
    | {
        phases: IlmPolicyPhases;
      }
    | undefined
) => {
  if (!value) return undefined;

  const orderedPhases = orderIlmPhases(value.phases);

  if (orderedPhases.length === 0) return undefined;

  const growValues = getIlmPhaseGrowValues(orderedPhases);

  return orderedPhases.map((phase, index) => ({
    ...phase,
    grow: growValues[index],
  }));
};
