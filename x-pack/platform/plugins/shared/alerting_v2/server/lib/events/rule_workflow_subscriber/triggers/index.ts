/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ruleCreatedTrigger } from './rule_created';
import { ruleUpdatedTrigger } from './rule_updated';
import { ruleDeletedTrigger } from './rule_deleted';
import { ruleEnabledTrigger } from './rule_enabled';
import { ruleDisabledTrigger } from './rule_disabled';
import type { RuleWorkflowTriggerBinding } from './types';

export type { RuleWorkflowTriggerBinding } from './types';
export { RuleCreatedTriggerId, ruleCreatedTrigger } from './rule_created';
export { RuleUpdatedTriggerId, ruleUpdatedTrigger } from './rule_updated';
export { RuleDeletedTriggerId, ruleDeletedTrigger } from './rule_deleted';
export { RuleEnabledTriggerId, ruleEnabledTrigger } from './rule_enabled';
export { RuleDisabledTriggerId, ruleDisabledTrigger } from './rule_disabled';

/**
 * Catalog of every rule-lifecycle → workflow-trigger mapping owned by `alerting_v2`.
 *
 * Both the trigger-registration helper
 * (`server/lib/workflow_extensions/register_trigger_definitions.ts`) and the
 * `RuleWorkflowSubscriber` walk this single source so the registered
 * schema, the trigger id, and the runtime payload mapping cannot drift
 * across the codebase.
 *
 * To add a new rule lifecycle event → workflow trigger:
 *
 *  1. Add the event type + discriminator constant to
 *     `rule_event_publisher/events.ts` and extend the `RuleEvent` union there.
 *  2. Create a binding file in this folder (mirror `rule_created.ts`).
 *  3. Append the binding to {@link RULE_WORKFLOW_TRIGGERS}.
 */
export const RULE_WORKFLOW_TRIGGERS: ReadonlyArray<RuleWorkflowTriggerBinding> = [
  ruleCreatedTrigger,
  ruleUpdatedTrigger,
  ruleDeletedTrigger,
  ruleEnabledTrigger,
  ruleDisabledTrigger,
];
