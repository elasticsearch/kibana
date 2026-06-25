/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseQueryResult } from '@kbn/react-query';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { isRuleNotFoundError } from '../utils/is_rule_not_found_error';

export enum RuleStateStatus {
  idle = 'idle',
  loading = 'loading',
  not_found = 'not_found',
  error = 'error',
  loaded = 'loaded',
}

export interface IdleRuleState {
  status: RuleStateStatus.idle;
}
export interface LoadingRuleState {
  status: RuleStateStatus.loading;
  ruleId: string;
}
export interface NotFoundRuleState {
  status: RuleStateStatus.not_found;
  ruleId: string;
}
export interface ErrorRuleState {
  status: RuleStateStatus.error;
  ruleId: string;
  error: Error;
}
export interface LoadedRuleState {
  status: RuleStateStatus.loaded;
  ruleId: string;
  rule: RuleResponse;
}

export type RuleState =
  | IdleRuleState
  | LoadingRuleState
  | NotFoundRuleState
  | ErrorRuleState
  | LoadedRuleState;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Maps a react-query rule fetch result into a single discriminated union.
 */
export const toRuleState = (
  id: string | undefined,
  query: Pick<UseQueryResult<RuleResponse>, 'data' | 'isLoading' | 'isError' | 'error'>
): RuleState => {
  if (!id) {
    return { status: RuleStateStatus.idle };
  }

  if (query.isLoading) {
    return { status: RuleStateStatus.loading, ruleId: id };
  }

  if (query.isError) {
    if (isRuleNotFoundError(query.error)) {
      return { status: RuleStateStatus.not_found, ruleId: id };
    }

    return { status: RuleStateStatus.error, ruleId: id, error: toError(query.error) };
  }

  if (query.data) {
    return { status: RuleStateStatus.loaded, ruleId: id, rule: query.data };
  }

  return { status: RuleStateStatus.loading, ruleId: id };
};

export const getRuleIdFromRuleState = (state: RuleState): string | undefined =>
  'ruleId' in state ? state.ruleId : undefined;

export const isRuleLoaded = (state: RuleState): state is LoadedRuleState =>
  state.status === RuleStateStatus.loaded;

export const isRuleLoading = (state: RuleState): state is LoadingRuleState =>
  state.status === RuleStateStatus.loading;

export const isRuleNotFound = (state: RuleState): state is NotFoundRuleState =>
  state.status === RuleStateStatus.not_found;

export const isRuleError = (state: RuleState): state is ErrorRuleState =>
  state.status === RuleStateStatus.error;
