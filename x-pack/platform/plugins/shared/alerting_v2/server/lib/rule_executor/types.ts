/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryPayload } from './get_query_payload';
import type { RuleResponse } from '../rules_client';
import type { AlertEvent } from '../../resources/datastreams/alert_events';
import type { ExecutionContext } from '../execution_context';

export interface RuleExecutorTaskParams {
  ruleId: string;
  spaceId: string;
}

export interface RuleExecutionInput {
  readonly ruleId: string;
  readonly spaceId: string;
  readonly scheduledAt: string;
  readonly executionContext: ExecutionContext;
}

export interface RulePipelineState {
  readonly input: RuleExecutionInput;
  readonly rule?: RuleResponse;
  readonly queryPayload?: QueryPayload;
  readonly esqlRowBatch?: ReadonlyArray<Record<string, unknown>>;
  readonly alertEventsBatch?: ReadonlyArray<AlertEvent>;
}

export type HaltReason = 'rule_deleted' | 'rule_disabled' | 'state_not_ready' | 'engine_disabled';

export type StepStreamResult =
  | { type: 'continue'; state: RulePipelineState }
  | { type: 'halt'; reason: HaltReason; state: RulePipelineState };

export type PipelineStateStream = AsyncIterableIterator<StepStreamResult>;

export interface RuleExecutionStep {
  readonly name: string;
  executeStream(input: PipelineStateStream): PipelineStateStream;
}
