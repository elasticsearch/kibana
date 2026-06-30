/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  RULE_CREATED_EVENT_TYPE,
  RULE_DELETED_EVENT_TYPE,
  RULE_DISABLED_EVENT_TYPE,
  RULE_ENABLED_EVENT_TYPE,
  RULE_UPDATED_EVENT_TYPE,
  type RuleEvent,
} from '../../rule_event_publisher/events';
import type { RuleWorkflowTriggerBinding } from './types';
import { ruleCreatedTrigger } from './rule_created';
import { ruleUpdatedTrigger } from './rule_updated';
import { ruleDeletedTrigger } from './rule_deleted';
import { ruleEnabledTrigger } from './rule_enabled';
import { ruleDisabledTrigger } from './rule_disabled';

const payload = { rule: { ruleId: 'rule-1', spaceId: 'default' } } as const;

interface Case {
  name: string;
  trigger: RuleWorkflowTriggerBinding;
  event: RuleEvent;
}

const cases: Case[] = [
  {
    name: 'ruleCreatedTrigger',
    trigger: ruleCreatedTrigger,
    event: { type: RULE_CREATED_EVENT_TYPE, payload },
  },
  {
    name: 'ruleUpdatedTrigger',
    trigger: ruleUpdatedTrigger,
    event: { type: RULE_UPDATED_EVENT_TYPE, payload },
  },
  {
    name: 'ruleDeletedTrigger',
    trigger: ruleDeletedTrigger,
    event: { type: RULE_DELETED_EVENT_TYPE, payload },
  },
  {
    name: 'ruleEnabledTrigger',
    trigger: ruleEnabledTrigger,
    event: { type: RULE_ENABLED_EVENT_TYPE, payload },
  },
  {
    name: 'ruleDisabledTrigger',
    trigger: ruleDisabledTrigger,
    event: { type: RULE_DISABLED_EVENT_TYPE, payload },
  },
];

describe('rule lifecycle workflow trigger bindings', () => {
  describe.each(cases)('$name', ({ trigger, event }) => {
    it('subscribes to its own event type and registers the matching trigger id (definition.id stays in sync)', () => {
      expect(trigger.eventType).toBe(event.type);
      expect(trigger.definition.id).toBe(trigger.triggerId);
    });

    it('forwards the publisher-shaped payload unchanged', () => {
      expect(trigger.toPayload(event)).toEqual(event.payload);
    });

    it('produces a payload that parses cleanly against the registered Zod schema', () => {
      const result = trigger.toPayload(event);
      expect(trigger.definition.eventSchema.parse(result)).toEqual(result);
    });

    it('rejects a payload missing the required `rule` field', () => {
      expect(() => trigger.definition.eventSchema.parse({})).toThrow();
    });
  });
});
