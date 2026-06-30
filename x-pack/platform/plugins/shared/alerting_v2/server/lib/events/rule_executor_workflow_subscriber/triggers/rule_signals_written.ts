/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleSignalsWrittenPayloadSchema } from '../../../../../common/workflows/triggers';
import {
  RULE_SIGNALS_WRITTEN_TRIGGER_ID,
  ruleSignalsWrittenTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import {
  RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE,
  type RuleExecutionSignalsWrittenEvent,
} from '../../rule_executor_event_publisher/events';
import type { RuleExecutorWorkflowTriggerBinding } from './types';

export { RULE_SIGNALS_WRITTEN_TRIGGER_ID } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `ruleExecution.signalsWritten` event to the
 * `alerting.ruleSignalsWritten` workflow trigger.
 */
export const ruleSignalsWrittenTrigger: RuleExecutorWorkflowTriggerBinding<
  RuleExecutionSignalsWrittenEvent,
  typeof ruleSignalsWrittenPayloadSchema
> = {
  eventType: RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE,
  triggerId: RULE_SIGNALS_WRITTEN_TRIGGER_ID,
  definition: ruleSignalsWrittenTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
