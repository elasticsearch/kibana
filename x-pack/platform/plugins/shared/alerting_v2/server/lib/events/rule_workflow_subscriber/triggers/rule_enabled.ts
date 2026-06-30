/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ruleLifecycleEventSchema } from '../../../../../common/workflows/triggers';
import {
  RuleEnabledTriggerId,
  ruleEnabledTriggerCommonDefinition,
} from '../../../../../common/workflows/triggers';
import { RULE_ENABLED_EVENT_TYPE, type RuleEnabledEvent } from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';

export { RuleEnabledTriggerId } from '../../../../../common/workflows/triggers';

/**
 * Binding from the bus `rule.enabled` event to the `alerting.ruleEnabled`
 * workflow trigger. The publisher already shapes the payload, so the
 * subscriber forwards it unchanged.
 */
export const ruleEnabledTrigger: RuleWorkflowTriggerBinding<
  RuleEnabledEvent,
  typeof ruleLifecycleEventSchema
> = {
  eventType: RULE_ENABLED_EVENT_TYPE,
  triggerId: RuleEnabledTriggerId,
  definition: ruleEnabledTriggerCommonDefinition,
  toPayload: (event) => event.payload,
};
