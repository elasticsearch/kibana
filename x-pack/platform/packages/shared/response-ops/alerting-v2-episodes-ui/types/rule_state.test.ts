/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import {
  getRuleIdFromRuleState,
  isRuleError,
  isRuleLoaded,
  isRuleLoading,
  RuleStateStatus,
  toRuleState,
} from './rule_state';

const mockRule = { id: 'r1', metadata: { name: 'Rule 1' } } as RuleResponse;

describe('toRuleState', () => {
  it('returns idle when id is undefined', () => {
    expect(
      toRuleState(undefined, { data: undefined, isLoading: false, isError: false, error: null })
    ).toEqual({
      status: RuleStateStatus.idle,
    });
  });

  it('returns loading while the query is loading', () => {
    expect(
      toRuleState('r1', { data: undefined, isLoading: true, isError: false, error: null })
    ).toEqual({ status: RuleStateStatus.loading, ruleId: 'r1' });
  });

  it('returns loaded when data is present', () => {
    expect(
      toRuleState('r1', { data: mockRule, isLoading: false, isError: false, error: null })
    ).toEqual({ status: RuleStateStatus.loaded, ruleId: 'r1', rule: mockRule });
  });

  it('returns not_found for a 404 RULE_NOT_FOUND error', () => {
    expect(
      toRuleState('missing', {
        data: undefined,
        isLoading: false,
        isError: true,
        error: {
          response: { status: 404 },
          body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
        },
      })
    ).toEqual({ status: RuleStateStatus.not_found, ruleId: 'missing' });
  });

  it('returns error for non-404 failures', () => {
    const error = new Error('Server error');
    const state = toRuleState('r1', {
      data: undefined,
      isLoading: false,
      isError: true,
      error,
    });

    expect(state).toEqual({ status: RuleStateStatus.error, ruleId: 'r1', error });
  });
});

describe('rule state guards', () => {
  it('isRuleLoaded is true only for loaded state', () => {
    expect(isRuleLoaded({ status: RuleStateStatus.loaded, ruleId: 'r1', rule: mockRule })).toBe(
      true
    );
    expect(isRuleLoaded({ status: RuleStateStatus.not_found, ruleId: 'r1' })).toBe(false);
  });

  it('isRuleLoading is true only for loading state', () => {
    expect(isRuleLoading({ status: RuleStateStatus.loading, ruleId: 'r1' })).toBe(true);
    expect(isRuleLoading({ status: RuleStateStatus.idle })).toBe(false);
  });

  it('isRuleError is true only for error state', () => {
    const error = new Error('boom');
    expect(isRuleError({ status: RuleStateStatus.error, ruleId: 'r1', error })).toBe(true);
    expect(isRuleError({ status: RuleStateStatus.not_found, ruleId: 'r1' })).toBe(false);
  });

  it('getRuleIdFromRuleState returns ruleId for non-idle states', () => {
    expect(getRuleIdFromRuleState({ status: RuleStateStatus.idle })).toBeUndefined();
    expect(getRuleIdFromRuleState({ status: RuleStateStatus.loading, ruleId: 'r1' })).toBe('r1');
    expect(getRuleIdFromRuleState({ status: RuleStateStatus.not_found, ruleId: 'r1' })).toBe('r1');
  });
});
