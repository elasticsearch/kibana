/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStream, DataRetention } from '../types';

export const HOT_ONLY_INFINITE_DATA_RETENTION: DataRetention = {
  enabled: true,
  infiniteDataRetention: true,
};

export const resolveLogisticsLifecycle = (
  lifecycle: DataRetention | undefined,
  { isDataStreamTemplate }: { isDataStreamTemplate: boolean }
): DataRetention | undefined => {
  if (!isDataStreamTemplate) {
    return lifecycle;
  }

  if (lifecycle?.infiniteDataRetention) {
    return lifecycle;
  }

  if (lifecycle?.enabled && lifecycle.value !== undefined) {
    return lifecycle;
  }

  if (lifecycle?.frozen?.enabled) {
    return lifecycle;
  }

  return HOT_ONLY_INFINITE_DATA_RETENTION;
};

export const splitSizeAndUnits = (field: string): { size: string; unit: string } => {
  let size = '';
  let unit = '';

  const result = /(\d+)(\w+)/.exec(field);
  if (result) {
    size = result[1];
    unit = result[2];
  }

  return {
    size,
    unit,
  };
};

export const serializeAsESLifecycle = (lifecycle?: DataRetention): DataStream['lifecycle'] => {
  const frozenEnabled = Boolean(lifecycle?.frozen?.enabled);

  if (!lifecycle || (!lifecycle.enabled && !frozenEnabled)) {
    return undefined;
  }

  const { infiniteDataRetention, value, unit, frozen } = lifecycle;

  const frozenAfter =
    frozenEnabled && frozen?.value !== undefined && frozen?.unit !== undefined
      ? { frozen_after: `${frozen.value}${frozen.unit}` }
      : {};

  // No delete phase: either frozen-only (!lifecycle.enabled, guaranteed
  // by the early return above) or infinite retention. Omit `data_retention` and
  // keep only the optional frozen phase.
  if (!lifecycle.enabled || infiniteDataRetention) {
    return {
      enabled: true,
      ...frozenAfter,
    };
  }

  return {
    enabled: true,
    data_retention: `${value}${unit}`,
    ...frozenAfter,
  };
};

export const deserializeESLifecycle = (lifecycle?: DataStream['lifecycle']): DataRetention => {
  if (!lifecycle || !lifecycle?.enabled) {
    return { enabled: false };
  }

  const frozen =
    typeof lifecycle.frozen_after === 'string'
      ? (() => {
          const { size, unit } = splitSizeAndUnits(lifecycle.frozen_after);
          return { frozen: { enabled: true, value: Number(size), unit } };
        })()
      : {};

  if (typeof lifecycle.data_retention !== 'string') {
    return {
      enabled: true,
      infiniteDataRetention: true,
      ...frozen,
    };
  }

  const { size, unit } = splitSizeAndUnits(lifecycle.data_retention);

  return {
    enabled: true,
    value: Number(size),
    unit,
    ...frozen,
  };
};
