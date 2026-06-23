/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { getSeverityThresholdMax, resolveSeverityFormat } from './severity_threshold';

describe('getSeverityThresholdMax', () => {
  it('returns the upper bound for a ranged threshold', () => {
    expect(
      getSeverityThresholdMax({ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR })
    ).toBe(ML_ANOMALY_THRESHOLD.MAJOR);
  });

  it('returns undefined for the open-ended critical band', () => {
    expect(getSeverityThresholdMax({ min: ML_ANOMALY_THRESHOLD.CRITICAL })).toBeUndefined();
  });
});

describe('resolveSeverityFormat', () => {
  it('should return the input value when it is already in the new format (array)', () => {
    const newFormatValue: SeverityThreshold[] = [
      { min: 25, max: 50 },
      { min: 50, max: 75 },
    ];

    const result = resolveSeverityFormat(newFormatValue);

    expect(result).toBe(newFormatValue);
  });

  it('should convert a number (old format) to an array of thresholds (new format)', () => {
    const oldFormatValue = 25;

    const result = resolveSeverityFormat(oldFormatValue);

    expect(result).toEqual([
      { min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR },
      { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
      { min: ML_ANOMALY_THRESHOLD.CRITICAL },
    ]);
  });

  it('should include all thresholds when value is 0', () => {
    const oldFormatValue = 0;

    const result = resolveSeverityFormat(oldFormatValue);

    expect(result).toEqual([
      { min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING },
      { min: ML_ANOMALY_THRESHOLD.WARNING, max: ML_ANOMALY_THRESHOLD.MINOR },
      { min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR },
      { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
      { min: ML_ANOMALY_THRESHOLD.CRITICAL },
    ]);
  });

  it('should include only CRITICAL threshold when value is 75', () => {
    const oldFormatValue = 75;

    const result = resolveSeverityFormat(oldFormatValue);

    expect(result).toEqual([{ min: ML_ANOMALY_THRESHOLD.CRITICAL }]);
  });

  it('should include no thresholds when value is greater than CRITICAL', () => {
    const oldFormatValue = 100;

    const result = resolveSeverityFormat(oldFormatValue);

    expect(result).toEqual([]);
  });
});
