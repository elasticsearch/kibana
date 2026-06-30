/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import { WorkflowServiceToken } from '../../services/workflow_service/tokens';
import type { WorkflowServiceContract } from '../../services/workflow_service/workflow_service';
import type { RuleEvent } from '../rule_event_publisher/events';
import {
  AlertingDomainEventBusToken,
  type AlertingDomainEvent,
  type AlertingPublisherContext,
} from '../domain_events';
import type { EventBus, Subscription } from '../event_bus';
import { RULE_WORKFLOW_TRIGGERS, type RuleWorkflowTriggerBinding } from './triggers';

/**
 * Singleton bus subscriber that routes rule-lifecycle domain events to the
 * workflows-extensions emit path via {@link WorkflowServiceContract}.
 */
@injectable()
export class RuleWorkflowSubscriber {
  #subscriptions: Subscription[] = [];

  constructor(
    @inject(AlertingDomainEventBusToken)
    private readonly bus: EventBus<AlertingDomainEvent, AlertingPublisherContext>,
    @inject(WorkflowServiceToken)
    private readonly workflows: WorkflowServiceContract,
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  public start(): void {
    if (this.#subscriptions.length > 0) {
      this.logger.debug({
        message: () =>
          '[RuleWorkflowSubscriber] start() called more than once. Ignoring. Subscriptions already active.',
      });

      return;
    }

    for (const trigger of RULE_WORKFLOW_TRIGGERS) {
      const subscription = this.bus.subscribe(trigger.eventType, (event, context) =>
        this.#dispatch(trigger, event as RuleEvent, context)
      );

      this.#subscriptions.push(subscription);
    }
  }

  public stop(): void {
    for (const subscription of this.#subscriptions) {
      subscription.unsubscribe();
    }

    this.#subscriptions = [];
  }

  async #dispatch(
    trigger: RuleWorkflowTriggerBinding,
    event: RuleEvent,
    context: AlertingPublisherContext
  ): Promise<void> {
    try {
      const payload = trigger.toPayload(event);
      await this.workflows.emitEvent(context.request, trigger.triggerId, payload);
    } catch (err) {
      this.logger.error({
        error: err,
        code: 'RULE_WORKFLOW_SUBSCRIBER_FAILURE',
        type: `RuleWorkflowSubscriber:${trigger.triggerId}`,
      });
    }
  }
}
