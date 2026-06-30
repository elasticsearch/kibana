/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { inject, injectable } from 'inversify';
import type { RuleLifecycleEvent } from '../../../../common/workflows/triggers';
import {
  AlertingDomainEventBusToken,
  type AlertingDomainEvent,
  type AlertingPublisherContext,
} from '../domain_events';
import type { EventBus } from '../event_bus';
import {
  RULE_CREATED_EVENT_TYPE,
  RULE_DELETED_EVENT_TYPE,
  RULE_DISABLED_EVENT_TYPE,
  RULE_ENABLED_EVENT_TYPE,
  RULE_UPDATED_EVENT_TYPE,
  type RuleEvent,
} from './events';

/**
 * Minimal rule reference carried in a rule-lifecycle event. Kept intentionally
 * small (a workflow step fetches any further rule data itself); modelled as an
 * object so fields like `version` can be added later without changing the
 * publisher signatures.
 */
export interface EventRule {
  id: string;
  spaceId: string;
}

/**
 * Public contract for the rule-lifecycle event publisher.
 *
 * Persistence callers ({@link RulesClient}) use these methods after successful
 * CRUD. The publisher dispatches domain events onto the in-process bus;
 * {@link RuleWorkflowSubscriber} maps them to workflow triggers.
 */
export interface RuleEventPublisherContract {
  emitRuleCreated(request: KibanaRequest, rules: EventRule[]): void;
  emitRuleUpdated(request: KibanaRequest, rules: EventRule[]): void;
  emitRuleDeleted(request: KibanaRequest, rules: EventRule[]): void;
  emitRuleEnabled(request: KibanaRequest, rules: EventRule[]): void;
  emitRuleDisabled(request: KibanaRequest, rules: EventRule[]): void;
}

/**
 * Singleton publisher of rule-lifecycle domain events onto the in-process
 * {@link EventBus}.
 *
 * Publishing is fire-and-forget — `publish` returns synchronously and
 * subscriber work runs on the next event-loop iteration.
 */
@injectable()
export class RuleEventPublisher implements RuleEventPublisherContract {
  constructor(
    @inject(AlertingDomainEventBusToken)
    private readonly eventBus: EventBus<AlertingDomainEvent, AlertingPublisherContext>
  ) {}

  public emitRuleCreated(request: KibanaRequest, rules: EventRule[]): void {
    this.publishForRules(request, RULE_CREATED_EVENT_TYPE, rules);
  }

  public emitRuleUpdated(request: KibanaRequest, rules: EventRule[]): void {
    this.publishForRules(request, RULE_UPDATED_EVENT_TYPE, rules);
  }

  public emitRuleDeleted(request: KibanaRequest, rules: EventRule[]): void {
    this.publishForRules(request, RULE_DELETED_EVENT_TYPE, rules);
  }

  public emitRuleEnabled(request: KibanaRequest, rules: EventRule[]): void {
    this.publishForRules(request, RULE_ENABLED_EVENT_TYPE, rules);
  }

  public emitRuleDisabled(request: KibanaRequest, rules: EventRule[]): void {
    this.publishForRules(request, RULE_DISABLED_EVENT_TYPE, rules);
  }

  private publishForRules(
    request: KibanaRequest,
    eventType: RuleEvent['type'],
    rules: EventRule[]
  ): void {
    for (const rule of rules) {
      this.publish(request, {
        type: eventType,
        payload: this.toLifecyclePayload(rule),
      });
    }
  }

  private toLifecyclePayload(rule: EventRule): RuleLifecycleEvent {
    return {
      rule: {
        ruleId: rule.id,
        spaceId: rule.spaceId,
      },
    };
  }

  private publish(request: KibanaRequest, event: RuleEvent): void {
    this.eventBus.publish(event, { request });
  }
}
