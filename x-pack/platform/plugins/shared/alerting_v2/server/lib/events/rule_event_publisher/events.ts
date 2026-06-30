/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleLifecycleEvent } from '../../../../common/workflows/triggers';

/**
 * Structure of every rule-lifecycle domain event.
 *
 * Concrete events specialise `TType` — the string-literal discriminator
 * (e.g. `'rule.created'`). Per-event data lives under `payload`, which
 * matches the workflow trigger schema shape.
 */
export interface BaseRuleEvent<TType extends string> {
  readonly type: TType;
  readonly payload: RuleLifecycleEvent;
}

/** Discriminator value for {@link RuleCreatedEvent}. */
export const RULE_CREATED_EVENT_TYPE = 'rule.created' as const;

/** Domain event published when a single alerting rule is created. */
export type RuleCreatedEvent = BaseRuleEvent<typeof RULE_CREATED_EVENT_TYPE>;

/** Discriminator value for {@link RuleUpdatedEvent}. */
export const RULE_UPDATED_EVENT_TYPE = 'rule.updated' as const;

/** Domain event published when a single alerting rule is updated. */
export type RuleUpdatedEvent = BaseRuleEvent<typeof RULE_UPDATED_EVENT_TYPE>;

/** Discriminator value for {@link RuleDeletedEvent}. */
export const RULE_DELETED_EVENT_TYPE = 'rule.deleted' as const;

/** Domain event published when a single alerting rule is deleted. */
export type RuleDeletedEvent = BaseRuleEvent<typeof RULE_DELETED_EVENT_TYPE>;

/** Discriminator value for {@link RuleEnabledEvent}. */
export const RULE_ENABLED_EVENT_TYPE = 'rule.enabled' as const;

/** Domain event published when a single alerting rule is enabled. */
export type RuleEnabledEvent = BaseRuleEvent<typeof RULE_ENABLED_EVENT_TYPE>;

/** Discriminator value for {@link RuleDisabledEvent}. */
export const RULE_DISABLED_EVENT_TYPE = 'rule.disabled' as const;

/** Domain event published when a single alerting rule is disabled. */
export type RuleDisabledEvent = BaseRuleEvent<typeof RULE_DISABLED_EVENT_TYPE>;

/**
 * Discriminated union of every rule-lifecycle domain event.
 *
 * Extend this when a new rule lifecycle event type is added. Cross-domain
 * events (alert actions, rule executor, dispatcher) live under their own
 * unions and are composed into `AlertingDomainEvent` in `lib/events/domain_events`.
 */
export type RuleEvent =
  | RuleCreatedEvent
  | RuleUpdatedEvent
  | RuleDeletedEvent
  | RuleEnabledEvent
  | RuleDisabledEvent;
