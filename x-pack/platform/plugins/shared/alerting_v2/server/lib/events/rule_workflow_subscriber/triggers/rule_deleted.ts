/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleLifecycleEventSchema } from '../../../../../common/workflows/triggers';
import {
  RuleDeletedTriggerId,
  ruleDeletedTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import { RULE_DELETED_EVENT_TYPE, type RuleDeletedEvent } from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';

export { RuleDeletedTriggerId } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `rule.deleted` event to the `alerting.ruleDeleted`
 * workflow trigger. The publisher already shapes the payload, so the
 * subscriber forwards it unchanged.
 */
export const ruleDeletedTrigger: RuleWorkflowTriggerBinding<
  RuleDeletedEvent,
  typeof ruleLifecycleEventSchema
> = {
  eventType: RULE_DELETED_EVENT_TYPE,
  triggerId: RuleDeletedTriggerId,
  definition: ruleDeletedTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
