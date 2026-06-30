/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleSignalsWrittenPayload } from '../../../../common/workflows/triggers';

/** Discriminator value for {@link RuleExecutionSignalsWrittenEvent}. */
export const RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE = 'ruleExecution.signalsWritten' as const;

/**
 * Domain event published when a signal rule finishes execution and persisted
 * one or more signal rule events.
 */
export interface RuleExecutionSignalsWrittenEvent {
  readonly type: typeof RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE;
  readonly payload: RuleSignalsWrittenPayload;
}

/**
 * Discriminated union of every rule-executor domain event.
 *
 * Extend this when a new rule-executor event type is added. Cross-domain
 * events (alert actions, rule lifecycle CRUD) live under their own unions
 * and are composed into `AlertingDomainEvent` in `lib/events/domain_events`.
 */
export type RuleExecutorEvent = RuleExecutionSignalsWrittenEvent;
