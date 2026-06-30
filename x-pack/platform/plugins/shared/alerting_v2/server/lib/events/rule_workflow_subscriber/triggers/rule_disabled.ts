/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleLifecycleEventSchema } from '../../../../../common/workflows/triggers';
import {
  RuleDisabledTriggerId,
  ruleDisabledTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import {
  RULE_DISABLED_EVENT_TYPE,
  type RuleDisabledEvent,
} from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';

export { RuleDisabledTriggerId } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `rule.disabled` event to the `alerting.ruleDisabled`
 * workflow trigger. The publisher already shapes the payload, so the
 * subscriber forwards it unchanged.
 */
export const ruleDisabledTrigger: RuleWorkflowTriggerBinding<
  RuleDisabledEvent,
  typeof ruleLifecycleEventSchema
> = {
  eventType: RULE_DISABLED_EVENT_TYPE,
  triggerId: RuleDisabledTriggerId,
  definition: ruleDisabledTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
