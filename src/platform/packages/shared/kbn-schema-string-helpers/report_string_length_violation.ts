/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metrics, ValueType } from '@opentelemetry/api';
import type { Histogram, MeterProvider } from '@opentelemetry/api';
import type { StringHelperName } from './limits';

const histograms = new WeakMap<MeterProvider, Histogram>();

const getHistogram = (): Histogram => {
  // Schema libraries can load before telemetry initializes the global provider.
  const provider = metrics.getMeterProvider();
  const existing = histograms.get(provider);
  if (existing) {
    return existing;
  }
  const histogram = provider
    .getMeter('kibana.schema')
    .createHistogram('kibana.schema.string_length_violation.length', {
      description:
        'Lengths of strings exceeding the configured maximum in reporting mode, in UTF-16 code units.',
      unit: '{code_unit}',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: [
          0, 16, 64, 256, 512, 1024, 2048, 4096, 8192, 10000, 16384, 32768, 65536, 100000, 131072,
          262144, 524288, 1048576,
        ],
      },
    });
  histograms.set(provider, histogram);
  return histogram;
};

/** Records overlong string lengths without including input contents or lengths in attributes. */
export const reportStringLengthViolation = ({
  helper,
  library,
  maxLength,
  length,
  label,
}: {
  helper: StringHelperName;
  library: 'config-schema' | 'zod';
  maxLength: number;
  length: number;
  label?: string;
}): void => {
  try {
    getHistogram().record(length, {
      'schema.helper': helper,
      'schema.library': library,
      'schema.max_length': maxLength,
      ...(label === undefined ? {} : { 'schema.label': label }),
    });
  } catch {
    // Reporting must never change whether request validation succeeds.
  }
};
