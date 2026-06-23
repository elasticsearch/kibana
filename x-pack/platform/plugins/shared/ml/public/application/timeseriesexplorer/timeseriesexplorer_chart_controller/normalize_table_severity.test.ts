/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { normalizeSeverityThresholdForApi } from './normalize_table_severity';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';

describe('normalizeSeverityThresholdForApi', () => {
  it('passes through arrays (embeddable / wrapper)', () => {
    const arr = [{ min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL }];
    expect(normalizeSeverityThresholdForApi(arr)).toBe(arr);
  });

  it('reads .val from SMV page shape', () => {
    expect(
      normalizeSeverityThresholdForApi({
        val: [{ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR }],
      })
    ).toEqual([{ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR }]);
  });

  it('wraps numeric legacy severity', () => {
    expect(normalizeSeverityThresholdForApi(25)).toEqual([
      { min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR },
      { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
      { min: ML_ANOMALY_THRESHOLD.CRITICAL },
    ]);
  });

  it('defaults to all canonical severity ranges', () => {
    const allSeverityRanges = [
      { min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING },
      { min: ML_ANOMALY_THRESHOLD.WARNING, max: ML_ANOMALY_THRESHOLD.MINOR },
      { min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR },
      { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
      { min: ML_ANOMALY_THRESHOLD.CRITICAL },
    ];

    expect(normalizeSeverityThresholdForApi(undefined)).toEqual(allSeverityRanges);
    expect(normalizeSeverityThresholdForApi({})).toEqual(allSeverityRanges);
  });
});
