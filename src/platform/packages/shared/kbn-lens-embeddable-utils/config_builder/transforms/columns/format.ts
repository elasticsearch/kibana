/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ValueFormatConfig } from '@kbn/lens-common';
import type { LensApiMetricOperation } from '../../schema/metric_ops';
import { durationInputUnitCompat, durationOutputUnitCompat } from './duration_units';

export function fromFormatAPIToLensState(
  format: LensApiMetricOperation['format']
): ValueFormatConfig | undefined {
  if (!format) {
    return;
  }
  if (format.type === 'number' || format.type === 'percent') {
    return {
      id: format.type,
      params: {
        decimals: format.decimals,
        ...(format.suffix ? { suffix: format.suffix } : {}),
        ...(format.compact != null ? { compact: format.compact } : {}),
      },
    };
  }
  if (format.type === 'bits' || format.type === 'bytes') {
    return {
      id: format.type,
      params: {
        decimals: format.decimals,
        ...(format.suffix ? { suffix: format.suffix } : {}),
      },
    };
  }
  if (format.type === 'duration') {
    return {
      id: format.type,
      params: {
        // doesn't matter, it's will be ignored but want to make TS happy
        decimals: 2,
        fromUnit: durationInputUnitCompat.toState(format.from),
        toUnit: durationOutputUnitCompat.toState(format.to),
        ...(format.suffix ? { suffix: format.suffix } : {}),
      },
    };
  }
  if (format.type === 'custom') {
    return {
      id: format.type,
      params: {
        // doesn't matter, it's will be ignored but want to make TS happy
        decimals: 2,
        pattern: format.pattern,
      },
    };
  }
}

export function fromFormatLensStateToAPI(
  format: ValueFormatConfig | undefined
): LensApiMetricOperation['format'] | undefined {
  if (!format) {
    return;
  }
  if (format.id === 'number' || format.id === 'percent') {
    return {
      type: format.id,
      ...(format.params?.decimals != null ? { decimals: format.params?.decimals } : {}),
      ...(format.params?.compact != null ? { compact: format.params?.compact } : {}),
      ...(format.params?.suffix ? { suffix: format.params.suffix } : {}),
    } as LensApiMetricOperation['format'];
  }
  if (format.id === 'bits' || format.id === 'bytes') {
    return {
      type: format.id,
      ...(format.params?.decimals != null ? { decimals: format.params?.decimals } : {}),
      ...(format.params?.suffix ? { suffix: format.params.suffix } : {}),
    } as LensApiMetricOperation['format'];
  }
  if (format.id === 'duration') {
    return {
      type: format.id,
      from: durationInputUnitCompat.toAPI(format.params?.fromUnit),
      to: durationOutputUnitCompat.toAPI(format.params?.toUnit),
      ...(format.params?.suffix ? { suffix: format.params.suffix } : {}),
    };
  }
  if (format.id === 'custom' && format.params?.pattern) {
    return {
      type: format.id,
      pattern: format.params?.pattern,
    };
  }
}
