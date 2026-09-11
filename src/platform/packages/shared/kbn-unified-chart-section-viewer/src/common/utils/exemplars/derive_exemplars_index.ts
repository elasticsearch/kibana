/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EXEMPLARS_INDEX_PREFIX,
  EXEMPLARS_OTEL_DATASET_MARKER,
  METRICS_INDEX_PREFIX,
} from '../../constants';

/**
 * Wildcards, comma lists, cross-cluster prefixes (`remote:index`) and source
 * selectors (`index::failures`) all name a scope that cannot be mapped onto
 * a single exemplars data stream.
 */
function includesNonConcreteChars(metricsIndex: string) {
  return (
    metricsIndex.includes('*') ||
    metricsIndex.includes(',') ||
    metricsIndex.includes(':') ||
    metricsIndex.includes(' ') ||
    metricsIndex.includes('\t') ||
    metricsIndex.includes('\n') ||
    metricsIndex.includes('\r')
  );
}

/**
 * Maps an OTel metrics data stream onto its parallel exemplars data stream, or returns
 * `undefined` when no such stream can exist. Callers treat `undefined` as "do not fetch".
 */
export const deriveExemplarsIndex = (metricsIndex: string): string | undefined => {
  if (!metricsIndex.startsWith(METRICS_INDEX_PREFIX)) {
    return undefined;
  }

  if (includesNonConcreteChars(metricsIndex)) {
    return undefined;
  }

  const suffix = metricsIndex.slice(METRICS_INDEX_PREFIX.length);
  const namespaceSeparatorIndex = suffix.indexOf('-');

  // Require the full `metrics-<dataset>-<namespace>` shape: without a namespace the
  // derived name cannot match the `exemplars-*.otel-*` template pattern.
  if (namespaceSeparatorIndex <= 0 || namespaceSeparatorIndex === suffix.length - 1) {
    return undefined;
  }

  const dataset = suffix.slice(0, namespaceSeparatorIndex);
  if (!dataset.includes(EXEMPLARS_OTEL_DATASET_MARKER)) {
    return undefined;
  }

  return `${EXEMPLARS_INDEX_PREFIX}${suffix}`;
};
