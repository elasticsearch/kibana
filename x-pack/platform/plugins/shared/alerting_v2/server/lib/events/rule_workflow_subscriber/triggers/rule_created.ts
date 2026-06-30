/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleLifecycleEventSchema } from '../../../../../common/workflows/triggers';
import {
  RuleCreatedTriggerId,
  ruleCreatedTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import { RULE_CREATED_EVENT_TYPE, type RuleCreatedEvent } from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';

export { RuleCreatedTriggerId } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `rule.created` event to the `alerting.ruleCreated`
 * workflow trigger. The publisher already shapes the payload, so the
 * subscriber forwards it unchanged.
 */
export const ruleCreatedTrigger: RuleWorkflowTriggerBinding<
  RuleCreatedEvent,
  typeof ruleLifecycleEventSchema
> = {
  eventType: RULE_CREATED_EVENT_TYPE,
  triggerId: RuleCreatedTriggerId,
  definition: ruleCreatedTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
