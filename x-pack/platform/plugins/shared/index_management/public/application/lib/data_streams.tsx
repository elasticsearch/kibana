/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiIconTip } from '@elastic/eui';

import type { DataStream } from '../../../common';
import { splitSizeAndUnits } from '../../../common';
import { LOOKUP_INDEX_MODE } from '../../../common/constants';
import { timeUnits, extraTimeUnits } from '../constants/time_units';
import { getInfiniteRetentionLabel } from './infinite_retention_label';

export const HOT_ONLY_ES_LIFECYCLE: DataStream['lifecycle'] = { enabled: true };

type EsLifecycle = DataStream['lifecycle'];

const AVAILABLE_TIME_UNITS = [...timeUnits, ...extraTimeUnits];
const TIME_UNIT_TEXT_BY_VALUE = new Map<string, string>(
  AVAILABLE_TIME_UNITS.map((timeUnit) => [timeUnit.value, timeUnit.text])
);

const getTimeUnitText = (unit: string): string => TIME_UNIT_TEXT_BY_VALUE.get(unit) ?? unit;

const isFiniteRetentionValue = (retention: unknown): retention is string =>
  typeof retention === 'string' && retention.length > 0;

export const resolveLifecycleForSummary = (
  lifecycle?: EsLifecycle,
  { hasDataStream = false }: { hasDataStream?: boolean } = {}
): EsLifecycle | undefined => {
  if (lifecycle?.enabled) {
    return lifecycle;
  }

  // An explicitly disabled lifecycle must be surfaced as "Disabled" instead of falling back to
  // the implicit hot-only phase, which is only meant for streams/templates with no lifecycle set.
  if (lifecycle?.enabled === false) {
    return lifecycle;
  }

  return hasDataStream ? HOT_ONLY_ES_LIFECYCLE : lifecycle;
};

export const isManaged = (dataStream: DataStream): boolean => {
  return Boolean(dataStream._meta?.managed);
};

export const filterDataStreams = (
  dataStreams: DataStream[],
  visibleTypes: string[]
): DataStream[] => {
  return dataStreams.filter((dataStream: DataStream) => {
    if (!dataStream.hidden && !isManaged(dataStream)) {
      return true;
    }
    if (dataStream.hidden && visibleTypes.includes('hidden')) {
      return true;
    }
    return isManaged(dataStream) && visibleTypes.includes('managed');
  });
};

export const isSelectedDataStreamHidden = (
  dataStreams: DataStream[],
  selectedDataStreamName?: string
): boolean => {
  return (
    !!selectedDataStreamName &&
    !!dataStreams.find((dataStream: DataStream) => dataStream.name === selectedDataStreamName)
      ?.hidden
  );
};

const getActiveRetention = (lifecycle?: EsLifecycle): unknown =>
  lifecycle?.effective_retention ?? lifecycle?.data_retention;

export const getLifecycleValue = (lifecycle?: EsLifecycle, infiniteAsIcon?: boolean) => {
  if (!lifecycle?.enabled) {
    return i18n.translate('xpack.idxMgmt.dataStreamList.dataRetentionDisabled', {
      defaultMessage: 'Disabled',
    });
  }

  const activeRetention = getActiveRetention(lifecycle);
  if (!isFiniteRetentionValue(activeRetention)) {
    const infiniteDataRetention = i18n.translate(
      'xpack.idxMgmt.dataStreamList.dataRetentionInfinite',
      {
        defaultMessage: 'Keep data indefinitely',
      }
    );

    if (infiniteAsIcon) {
      return (
        <EuiIconTip
          data-test-subj="infiniteRetention"
          position="top"
          content={infiniteDataRetention}
          type="infinity"
        />
      );
    }

    return infiniteDataRetention;
  }

  return getRetentionPeriod(activeRetention);
};

export const isNextGenIlm = (dataStream?: DataStream | null): boolean => {
  return dataStream?.nextGenerationManagedBy?.toLowerCase() === 'index lifecycle management';
};

// Since ES 9.6 both ILM and data stream lifecycle skip `index.mode: lookup` indices.
export const isLookupIndexMode = (dataStream?: DataStream | null): boolean => {
  return dataStream?.indexMode === LOOKUP_INDEX_MODE;
};

export const hasIlmManagedBackingIndex = (dataStream?: DataStream | null): boolean => {
  return Boolean(
    dataStream?.indices.some(
      ({ managedBy }) => managedBy?.toLowerCase() === 'index lifecycle management'
    )
  );
};

export const hasDslManagedBackingIndex = (dataStream?: DataStream | null): boolean => {
  return Boolean(
    dataStream?.indices.some(
      ({ managedBy }) => managedBy?.toLowerCase() === 'data stream lifecycle'
    )
  );
};

export const isIlmLifecyclePreferred = (dataStream?: DataStream | null): boolean => {
  if (!isLookupIndexMode(dataStream)) {
    return isNextGenIlm(dataStream);
  }

  return hasIlmManagedBackingIndex(dataStream) && !hasDslManagedBackingIndex(dataStream);
};

export const getIlmPolicyNameForSummary = (dataStream?: DataStream | null): string | undefined => {
  if (!isLookupIndexMode(dataStream)) {
    return dataStream?.ilmPolicyName;
  }

  const policyNames = [
    ...new Set(
      dataStream?.indices
        .filter(({ managedBy }) => managedBy?.toLowerCase() === 'index lifecycle management')
        .map(({ ilmPolicyName }) => ilmPolicyName)
        .filter((policyName): policyName is string => Boolean(policyName))
    ),
  ];

  return policyNames.length === 1 ? policyNames[0] : undefined;
};

// A lookup-mode stream can still contain older lifecycle-managed backing indices with another mode.
// The failure store lifecycle also remains applicable because failure indices do not inherit lookup mode.
export const isLookupLifecycleNotApplicable = (dataStream?: DataStream | null): boolean => {
  return (
    isLookupIndexMode(dataStream) &&
    !hasIlmManagedBackingIndex(dataStream) &&
    !hasDslManagedBackingIndex(dataStream)
  );
};

const hasDslEligibleUnmanagedBackingIndex = (dataStream?: DataStream | null): boolean => {
  return Boolean(
    dataStream?.indices.some(
      ({ indexMode, managedBy, ilmPolicyName, preferILM }) =>
        indexMode !== undefined &&
        indexMode !== LOOKUP_INDEX_MODE &&
        managedBy?.toLowerCase() === 'unmanaged' &&
        (ilmPolicyName === undefined || !preferILM)
    )
  );
};

export const isLookupLifecycleEditingNotApplicable = (dataStream?: DataStream | null): boolean => {
  return (
    isLookupIndexMode(dataStream) &&
    !hasIlmManagedBackingIndex(dataStream) &&
    !hasDslManagedBackingIndex(dataStream) &&
    !hasDslEligibleUnmanagedBackingIndex(dataStream)
  );
};

export const isLookupDslNotApplicable = (dataStream?: DataStream | null): boolean => {
  return (
    isLookupIndexMode(dataStream) &&
    !hasDslManagedBackingIndex(dataStream) &&
    !hasDslEligibleUnmanagedBackingIndex(dataStream)
  );
};

export const isNextGenDsl = (dataStream?: DataStream | null): boolean => {
  return dataStream?.nextGenerationManagedBy?.toLowerCase() === 'data stream lifecycle';
};

export const isDSLWithILMIndices = (dataStream?: DataStream | null) => {
  if (dataStream?.nextGenerationManagedBy?.toLowerCase() === 'data stream lifecycle') {
    const ilmIndices: Array<(typeof dataStream.indices)[number]> = [];
    const dslIndices: Array<(typeof dataStream.indices)[number]> = [];

    for (const index of dataStream.indices ?? []) {
      const managedBy = index.managedBy?.toLowerCase();
      if (managedBy === 'index lifecycle management') {
        ilmIndices.push(index);
      } else if (managedBy === 'data stream lifecycle') {
        dslIndices.push(index);
      }
    }

    // When there aren't any ILM indices, there's no need to show anything.
    if (!ilmIndices?.length) {
      return;
    }

    return {
      ilmIndices,
      dslIndices,
    };
  }

  return;
};

export const deserializeGlobalMaxRetention = (globalMaxRetention?: string) => {
  if (!globalMaxRetention) {
    return {};
  }

  const { size, unit } = splitSizeAndUnits(globalMaxRetention);

  return {
    size,
    unit,
    unitText: getTimeUnitText(unit),
  };
};

export const getRetentionPeriod = (retention: string) => {
  const { size, unit } = splitSizeAndUnits(retention);

  return `${size} ${getTimeUnitText(unit)}`;
};

export const getFrozenAfterValue = (lifecycle?: EsLifecycle): string | undefined => {
  if (!lifecycle?.enabled || !isFiniteRetentionValue(lifecycle.frozen_after)) {
    return undefined;
  }

  return getRetentionPeriod(lifecycle.frozen_after);
};

export const countDlmDataPhases = (lifecycle?: EsLifecycle): number => {
  if (!lifecycle?.enabled) {
    return 0;
  }

  let count = 1;

  if (isFiniteRetentionValue(lifecycle.frozen_after)) {
    count += 1;
  }

  const activeRetention = getActiveRetention(lifecycle);
  if (isFiniteRetentionValue(activeRetention)) {
    count += 1;
  }

  return count;
};

export const getDownsamplingCount = (lifecycle?: EsLifecycle): number => {
  const downsampling: unknown = lifecycle?.downsampling;
  return Array.isArray(downsampling) ? downsampling.length : 0;
};

export const getDlmDataPhasesLabel = (count: number): string =>
  i18n.translate('xpack.idxMgmt.dataStreamList.dlmDataPhasesCount', {
    defaultMessage: '{count, plural, one {# data phase} other {# data phases}}',
    values: { count },
  });

export const getDlmDownsamplingStepsLabel = (count: number): string | undefined =>
  count > 0
    ? i18n.translate('xpack.idxMgmt.dataStreamList.dlmDownsamplingStepsCount', {
        defaultMessage: '{count, plural, one {# downsample step} other {# downsample steps}}',
        values: { count },
      })
    : undefined;

const getDlmLifecycleRetentionLabel = (lifecycle?: EsLifecycle): string => {
  if (!lifecycle?.enabled) {
    return i18n.translate('xpack.idxMgmt.dataStreamList.dataRetentionDisabled', {
      defaultMessage: 'Disabled',
    });
  }

  const activeRetention = getActiveRetention(lifecycle);

  if (!isFiniteRetentionValue(activeRetention)) {
    return getInfiniteRetentionLabel();
  }

  return getRetentionPeriod(activeRetention);
};

export const getDlmLifecycleDurationLabel = (
  lifecycle?: EsLifecycle,
  { infiniteAsIcon = false }: { infiniteAsIcon?: boolean } = {}
) => getLifecycleValue(lifecycle, infiniteAsIcon);

export interface FormatDlmLifecycleSummaryOptions {
  includePhaseCount?: boolean;
  includeDownsampling?: boolean;
}

export const formatDlmLifecycleSummary = (
  lifecycle?: EsLifecycle,
  { includePhaseCount = false, includeDownsampling = false }: FormatDlmLifecycleSummaryOptions = {}
): string | React.ReactElement => {
  if (!includePhaseCount) {
    return getDlmLifecycleDurationLabel(lifecycle, { infiniteAsIcon: true });
  }

  const retentionLabel = getDlmLifecycleRetentionLabel(lifecycle);
  const phaseCount = countDlmDataPhases(lifecycle);

  if (!lifecycle?.enabled || phaseCount === 0) {
    return retentionLabel;
  }

  const phasesLabel = getDlmDataPhasesLabel(phaseCount);
  const downsamplingLabel = includeDownsampling
    ? getDlmDownsamplingStepsLabel(getDownsamplingCount(lifecycle))
    : undefined;

  return [retentionLabel, phasesLabel, downsamplingLabel].filter(Boolean).join(' · ');
};
