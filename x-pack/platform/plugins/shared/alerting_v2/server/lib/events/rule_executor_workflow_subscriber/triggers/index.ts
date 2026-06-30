/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ruleSignalsWrittenTrigger } from './rule_signals_written';
import type { RuleExecutorWorkflowTriggerBinding } from './types';

export type { RuleExecutorWorkflowTriggerBinding } from './types';
export { RULE_SIGNALS_WRITTEN_TRIGGER_ID, ruleSignalsWrittenTrigger } from './rule_signals_written';

/**
 * Catalog of every rule-executor → workflow-trigger mapping owned by `alerting_v2`.
 *
 * Both the trigger-registration helper
 * (`server/lib/workflow_extensions/register_trigger_definitions.ts`) and the
 * `RuleExecutorWorkflowSubscriber` walk this single source so the registered
 * schema, the trigger id, and the runtime payload mapping cannot drift
 * across the codebase.
 */
export const RULE_EXECUTOR_WORKFLOW_TRIGGERS: ReadonlyArray<RuleExecutorWorkflowTriggerBinding> = [
  ruleSignalsWrittenTrigger,
];
