/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';
import type { DownsampleStep } from '@kbn/streams-schema/src/models/ingest/lifecycle';
import { PHASE_ORDER, type IlmPhase } from '@kbn/data-lifecycle-phases';
import { buildLifecyclePhases } from './lifecycle_types';
import { formatBytes } from '../../helpers/format_bytes';
import { getIlmPhaseGrowValues, type GrowValue } from '../../../../../../util/ilm_policy_phases';

const ZERO_SIZE_BYTES = 0;
const ZERO_SIZE_LABEL = formatBytes(ZERO_SIZE_BYTES);

export type IlmPhasesMap = Record<string, { color: string; description?: string }>;

export const buildIlmPreviewPhases = ({
  policy,
  ilmPhases,
  stats,
}: {
  policy: SerializedPolicy;
  ilmPhases: IlmPhasesMap;
  stats?: { size?: string; sizeBytes?: number; totalDocs?: number };
}) => {
  const phases: Array<{
    name: IlmPhase;
    min_age?: string;
    actions?: Record<string, unknown>;
  }> = PHASE_ORDER.map((phaseName) => {
    const phase = policy.phases[phaseName];
    if (!phase) return null;
    return { name: phaseName, min_age: phase.min_age, actions: phase.actions };
  }).filter((p): p is NonNullable<typeof p> => Boolean(p));

  const nextMinAgeByPhase = phases.reduce<Record<string, string | undefined>>((acc, phase, i) => {
    acc[phase.name] = phases[i + 1]?.min_age;
    return acc;
  }, {});

  // Resolve the effective min_age per phase (hot defaults to 0d) so the preview
  // computes the same proportional widths as the applied lifecycle summary.
  const phasesWithResolvedMinAge = phases.map((phase) => ({
    name: phase.name,
    min_age: phase.name === 'hot' ? phase.min_age ?? '0d' : phase.min_age,
  }));
  const growValues = getIlmPhaseGrowValues(phasesWithResolvedMinAge);
  const growByPhase = phases.reduce<Record<string, GrowValue | false>>((acc, phase, i) => {
    acc[phase.name] = growValues[i];
    return acc;
  }, {});

  return phases.map((phase) => {
    const phaseName = phase.name;
    const hasReadOnlyAction = Boolean(phase.actions && 'readonly' in phase.actions);
    const searchableSnapshotRepo = (() => {
      if (!phase.actions) return undefined;
      const action = (phase.actions as Record<string, unknown>).searchable_snapshot;
      if (!action || typeof action !== 'object') return undefined;
      return (action as { snapshot_repository?: string }).snapshot_repository;
    })();

    const minAge =
      phaseName === 'hot'
        ? // ILM hot is effectively 0 when missing.
          phase.min_age ?? '0d'
        : phase.min_age;

    const downsample = (() => {
      if (!phase.actions) return undefined;
      const action = (phase.actions as Record<string, unknown>).downsample;
      if (!action || typeof action !== 'object') return undefined;
      const fixedInterval = (action as { fixed_interval?: unknown }).fixed_interval;
      if (typeof fixedInterval !== 'string' || !fixedInterval.trim()) return undefined;
      return {
        after: minAge ?? '0d',
        fixed_interval: fixedInterval,
      };
    })();

    return {
      color: ilmPhases[phaseName].color,
      name: phaseName,
      label: phaseName,
      grow: growByPhase[phaseName],
      isDelete: phaseName === 'delete',
      timelineValue: nextMinAgeByPhase[phaseName],
      description: ilmPhases[phaseName].description,
      min_age: minAge,
      isReadOnly: hasReadOnlyAction,
      searchableSnapshot: searchableSnapshotRepo,
      downsample,
      // Hot uses stream stats when available; other non-delete phases use 0.0 B
      size:
        phaseName === 'delete'
          ? undefined
          : phaseName === 'hot'
          ? stats?.size ?? ZERO_SIZE_LABEL
          : ZERO_SIZE_LABEL,
      sizeInBytes:
        phaseName === 'delete'
          ? undefined
          : phaseName === 'hot'
          ? stats?.sizeBytes ?? ZERO_SIZE_BYTES
          : ZERO_SIZE_BYTES,
      docsCount: phaseName === 'hot' ? stats?.totalDocs : undefined,
    };
  });
};

export const buildDlmPreviewModel = ({
  isServerless,
  hotColor,
  hotDescription,
  deletePhaseColor,
  deletePhaseDescription,
  stats,
  retentionPeriod,
  downsampleSteps,
  indexMode,
}: {
  isServerless: boolean;
  hotColor: string;
  hotDescription?: string;
  deletePhaseColor: string;
  deletePhaseDescription?: string;
  stats?: { size?: string; sizeBytes?: number; totalDocs?: number };
  retentionPeriod?: string;
  downsampleSteps: DownsampleStep[] | null;
  indexMode: 'standard' | 'time_series' | string;
}) => {
  const label = isServerless
    ? i18n.translate('xpack.streams.streamDetailLifecycle.successfulIngest', {
        defaultMessage: 'Successful ingest',
      })
    : i18n.translate('xpack.streams.streamDetailLifecycle.hot', { defaultMessage: 'Hot' });

  const phases = buildLifecyclePhases({
    label,
    color: hotColor,
    size: stats?.size,
    retentionPeriod,
    description: isServerless ? '' : hotDescription,
    sizeInBytes: stats?.sizeBytes,
    docsCount: stats?.totalDocs,
    deletePhaseDescription,
    deletePhaseColor,
  });

  return {
    phases,
    downsampleSteps,
    retentionPeriod: retentionPeriod ?? null,
    dataPhasesCount: phases.length,
    downsampleStepsCount: indexMode === 'time_series' ? downsampleSteps?.length ?? 0 : null,
  };
};
