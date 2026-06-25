/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isRuleNotFoundError } from './is_rule_not_found_error';

describe('isRuleNotFoundError', () => {
  it('returns true for a 404 with RULE_NOT_FOUND code', () => {
    expect(
      isRuleNotFoundError({
        response: { status: 404 },
        body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
      })
    ).toBe(true);
  });

  it('returns true for a 404 without an error code', () => {
    expect(
      isRuleNotFoundError({
        response: { status: 404 },
      })
    ).toBe(true);
  });

  it('returns false for non-404 errors', () => {
    expect(
      isRuleNotFoundError({
        response: { status: 500 },
        body: { code: 'INTERNAL_ERROR', error: 'Internal Server Error', message: 'Failed' },
      })
    ).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRuleNotFoundError(undefined)).toBe(false);
  });
});
