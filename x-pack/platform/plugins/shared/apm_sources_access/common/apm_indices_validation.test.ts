/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  APM_INDEX_PATTERN_MAX_LENGTH,
  validateApmIndexSetting,
  validateApmIndices,
} from './apm_indices_validation';

describe('validateApmIndexSetting', () => {
  it('returns a shared max-length error for overly long values', () => {
    expect(
      validateApmIndexSetting('transaction', 'a'.repeat(APM_INDEX_PATTERN_MAX_LENGTH + 1))
    ).toBe(`Must be ${APM_INDEX_PATTERN_MAX_LENGTH} characters or fewer`);
  });

  it('accepts empty and valid values', () => {
    expect(validateApmIndexSetting('transaction', '')).toBeUndefined();
    expect(validateApmIndexSetting('transaction', 'traces-apm*')).toBeUndefined();
  });
});

describe('validateApmIndices', () => {
  it('returns field-specific errors for invalid values', () => {
    expect(
      validateApmIndices({
        error: 'a'.repeat(APM_INDEX_PATTERN_MAX_LENGTH + 1),
        metric: 'metrics-apm*',
      })
    ).toEqual({
      error: `Must be ${APM_INDEX_PATTERN_MAX_LENGTH} characters or fewer`,
    });
  });
});
