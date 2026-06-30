/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleLifecycleEventSchema } from '../../../../../common/workflows/triggers';
import {
  RuleUpdatedTriggerId,
  ruleUpdatedTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import { RULE_UPDATED_EVENT_TYPE, type RuleUpdatedEvent } from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';

export { RuleUpdatedTriggerId } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `rule.updated` event to the `alerting.ruleUpdated`
 * workflow trigger. The publisher already shapes the payload, so the
 * subscriber forwards it unchanged.
 */
export const ruleUpdatedTrigger: RuleWorkflowTriggerBinding<
  RuleUpdatedEvent,
  typeof ruleLifecycleEventSchema
> = {
  eventType: RULE_UPDATED_EVENT_TYPE,
  triggerId: RuleUpdatedTriggerId,
  definition: ruleUpdatedTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
