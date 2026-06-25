/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IlmPolicy,
  IlmPolicyDeletePhase,
  IlmPolicyHotPhase,
  IlmPolicyPhase,
  IlmPolicyPhases,
  PhaseName,
} from '@kbn/streams-schema';
import { PHASE_ORDER } from '@kbn/data-lifecycle-phases';

export interface DeleteContext {
  type: 'phase' | 'downsampleStep';
  name: string;
  stepNumber?: number;
  isManaged?: boolean;
}

type PhaseActions = Record<string, unknown>;
type PhaseWithActions<T> = T & { actions?: PhaseActions };
type NonDeletePhaseName = Exclude<PhaseName, 'delete'>;

export interface EsIlmPhase extends Record<string, unknown> {
  min_age?: string;
  actions?: PhaseActions;
}

export interface EsIlmPolicyPhases {
  hot?: EsIlmPhase;
  warm?: EsIlmPhase;
  cold?: EsIlmPhase;
  frozen?: EsIlmPhase;
  delete?: EsIlmPhase;
}

const nonDeletePhaseNames: readonly NonDeletePhaseName[] = ['hot', 'warm', 'cold', 'frozen'];
const standardNonDeletePhaseNames: readonly Exclude<NonDeletePhaseName, 'hot'>[] = [
  'warm',
  'cold',
  'frozen',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const isPhaseName = (value: string): value is PhaseName =>
  value === 'hot' ||
  value === 'warm' ||
  value === 'cold' ||
  value === 'frozen' ||
  value === 'delete';

const cloneActions = (phase: IlmPolicyPhase | IlmPolicyDeletePhase): PhaseActions => {
  if (!isRecord(phase)) {
    return {};
  }

  const actions = phase.actions;
  return isRecord(actions) ? { ...actions } : {};
};

const toEsNonDeletePhase = (
  phase: PhaseWithActions<IlmPolicyPhase> | PhaseWithActions<IlmPolicyHotPhase> | undefined,
  rollover?: IlmPolicyHotPhase['rollover']
): EsIlmPhase | undefined => {
  if (!phase) {
    return undefined;
  }

  const actions = cloneActions(phase);

  // Treat rollover as a "controlled" value: if it is present but empty after sanitization,
  // clear any existing rollover action instead of preserving stale state.
  if (rollover !== undefined) {
    const sanitizedRollover = isRecord(rollover) ? sanitizeRolloverAction(rollover) : {};
    if (Object.keys(sanitizedRollover).length > 0) {
      actions.rollover = sanitizedRollover;
    } else {
      delete actions.rollover;
    }
  }

  if (phase.readonly === true) {
    actions.readonly = {};
  }

  if (phase.downsample && isRecord(phase.downsample)) {
    const downsample = toDownsampleAction(phase.downsample);
    if (downsample) {
      actions.downsample = downsample;
    }
  }

  if (typeof phase.searchable_snapshot === 'string' && phase.searchable_snapshot) {
    actions.searchable_snapshot = {
      snapshot_repository: phase.searchable_snapshot,
    };
  }

  return {
    ...(phase.min_age ? { min_age: phase.min_age } : {}),
    actions,
  };
};

const toEsDeletePhase = (
  phase: PhaseWithActions<IlmPolicyDeletePhase> | undefined
): EsIlmPhase | undefined => {
  if (!phase) {
    return undefined;
  }

  const actions = cloneActions(phase);
  // ES ILM requires `actions` for all phases. For the delete phase, ensure we always
  // include a `delete` action (at minimum `{}`) when the phase is enabled.
  const currentDeleteAction = isRecord(actions.delete) ? actions.delete : {};
  const nextDeleteAction: Record<string, unknown> = { ...currentDeleteAction };
  if (typeof phase.delete_searchable_snapshot === 'boolean') {
    nextDeleteAction.delete_searchable_snapshot = phase.delete_searchable_snapshot;
  }
  actions.delete = nextDeleteAction;

  return {
    ...(phase.min_age ? { min_age: phase.min_age } : {}),
    actions,
  };
};

const toEsPolicyPhases = (phases: IlmPolicyPhases): EsIlmPolicyPhases => ({
  hot: toEsNonDeletePhase(phases.hot, phases.hot?.rollover),
  warm: toEsNonDeletePhase(phases.warm),
  cold: toEsNonDeletePhase(phases.cold),
  frozen: toEsNonDeletePhase(phases.frozen),
  delete: toEsDeletePhase(phases.delete),
});

const sanitizeRolloverAction = (rollover: IlmPolicyHotPhase['rollover']) => {
  return Object.fromEntries(Object.entries(rollover).filter(([, value]) => value != null));
};

const toDownsampleAction = (downsample: {
  fixed_interval?: unknown;
}): Record<string, unknown> | null => {
  const fixedInterval = downsample.fixed_interval;
  if (typeof fixedInterval !== 'string' || fixedInterval.trim() === '') {
    return null;
  }
  return { fixed_interval: fixedInterval };
};

export const getModifiedPhases = (policy: IlmPolicy, context: DeleteContext): EsIlmPolicyPhases => {
  const phases = toEsPolicyPhases(policy.phases);

  if (context.type === 'phase') {
    if (isPhaseName(context.name)) {
      delete phases[context.name];
    }
    return phases;
  }

  if (
    context.type === 'downsampleStep' &&
    Number.isInteger(context.stepNumber) &&
    (context.stepNumber ?? 0) > 0
  ) {
    let downsampleIndex = 0;

    for (const phaseName of nonDeletePhaseNames) {
      if (phaseName === 'hot') {
        const phase = phases.hot;
        if (!phase) {
          continue;
        }

        const actions = phase.actions ?? {};
        if (!Object.prototype.hasOwnProperty.call(actions, 'downsample')) {
          continue;
        }

        downsampleIndex += 1;
        if (downsampleIndex !== context.stepNumber) {
          continue;
        }

        const { downsample: _downsample, ...remainingActions } = actions;
        phases.hot = {
          ...phase,
          actions: remainingActions,
        };
        break;
      }

      const phase = phases[phaseName];
      if (!phase) {
        continue;
      }

      const actions = phase.actions ?? {};
      if (!Object.prototype.hasOwnProperty.call(actions, 'downsample')) {
        continue;
      }

      downsampleIndex += 1;
      if (downsampleIndex !== context.stepNumber) {
        continue;
      }

      const { downsample: _downsample, ...remainingActions } = actions;
      phases[phaseName] = {
        ...phase,
        actions: remainingActions,
      };
      break;
    }
  }

  return phases;
};

export const buildModifiedPhasesFromEdit = (
  policy: IlmPolicy,
  nextPhases: IlmPolicyPhases
): EsIlmPolicyPhases => {
  const modifiedPhases = toEsPolicyPhases(policy.phases);

  for (const phaseName of PHASE_ORDER) {
    if (policy.phases[phaseName] && !nextPhases[phaseName]) {
      delete modifiedPhases[phaseName];
    }
  }

  const buildNonDeleteActions = (
    nextPhase: IlmPolicyPhase,
    previousActions: PhaseActions,
    rollover?: IlmPolicyHotPhase['rollover']
  ): PhaseActions => {
    const actions = { ...previousActions };

    // Treat rollover as a "controlled" value: if it is present but empty after sanitization,
    // clear any existing rollover action instead of preserving stale state.
    if (rollover !== undefined) {
      const sanitizedRollover = isRecord(rollover) ? sanitizeRolloverAction(rollover) : {};
      if (Object.keys(sanitizedRollover).length > 0) {
        actions.rollover = sanitizedRollover;
      } else {
        delete actions.rollover;
      }
    }

    if (nextPhase.readonly === true) {
      actions.readonly = {};
    } else {
      delete actions.readonly;
    }

    if (nextPhase.downsample && isRecord(nextPhase.downsample)) {
      const downsample = toDownsampleAction(nextPhase.downsample);
      if (downsample) {
        actions.downsample = downsample;
      } else {
        delete actions.downsample;
      }
    } else {
      delete actions.downsample;
    }

    if (typeof nextPhase.searchable_snapshot === 'string' && nextPhase.searchable_snapshot) {
      actions.searchable_snapshot = {
        snapshot_repository: nextPhase.searchable_snapshot,
      };
    } else {
      delete actions.searchable_snapshot;
    }

    return actions;
  };

  const nextDeletePhase = nextPhases.delete;
  if (nextDeletePhase) {
    const actions = { ...(modifiedPhases.delete?.actions ?? {}) };
    // ES ILM requires `actions` for all phases; ensure `delete` action exists at minimum.
    if (!Object.prototype.hasOwnProperty.call(actions, 'delete') || !isRecord(actions.delete)) {
      actions.delete = {};
    }

    // Treat delete_searchable_snapshot as a "controlled" value: if it is explicitly present but
    // undefined (e.g. "default"), clear any existing value instead of preserving stale state.
    if (Object.prototype.hasOwnProperty.call(nextDeletePhase, 'delete_searchable_snapshot')) {
      if (typeof nextDeletePhase.delete_searchable_snapshot === 'boolean') {
        const existingDeleteAction = isRecord(actions.delete) ? actions.delete : {};
        actions.delete = {
          ...existingDeleteAction,
          delete_searchable_snapshot: nextDeletePhase.delete_searchable_snapshot,
        };
      } else {
        if (isRecord(actions.delete)) {
          const { delete_searchable_snapshot: _ignored, ...remainingDeleteAction } = actions.delete;
          // Preserve an empty delete action (`{}`) to satisfy ES ILM requirements.
          actions.delete = remainingDeleteAction;
        } else {
          actions.delete = {};
        }
      }
    }

    modifiedPhases.delete = {
      ...(nextDeletePhase.min_age ? { min_age: nextDeletePhase.min_age } : {}),
      actions,
    };
  }

  const nextHotPhase = nextPhases.hot;
  if (nextHotPhase) {
    const actions = buildNonDeleteActions(
      nextHotPhase,
      modifiedPhases.hot?.actions ?? {},
      nextHotPhase.rollover
    );

    modifiedPhases.hot = {
      ...(nextHotPhase.min_age ? { min_age: nextHotPhase.min_age } : {}),
      actions,
    };
  }

  for (const phaseName of standardNonDeletePhaseNames) {
    const nextPhase = nextPhases[phaseName];
    if (!nextPhase) {
      continue;
    }

    const actions = buildNonDeleteActions(nextPhase, modifiedPhases[phaseName]?.actions ?? {});
    modifiedPhases[phaseName] = {
      ...(nextPhase.min_age ? { min_age: nextPhase.min_age } : {}),
      actions,
    };
  }

  return modifiedPhases;
};
