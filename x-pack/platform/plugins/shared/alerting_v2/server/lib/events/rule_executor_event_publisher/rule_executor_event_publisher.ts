/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { inject, injectable } from 'inversify';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { buildRuleExecutionSnapshot } from '../../../../common/workflows/triggers';
import type { EventBus } from '../event_bus';
import {
  AlertingDomainEventBusToken,
  type AlertingDomainEvent,
  type AlertingPublisherContext,
} from '../domain_events';
import {
  RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE,
  type RuleExecutionSignalsWrittenEvent,
} from './events';

export interface EmitSignalsWrittenInput {
  readonly rule: RuleResponse;
  readonly spaceId: string;
  readonly scheduledAt: string;
  readonly signalEventCount: number;
}

/**
 * Public contract for the rule-executor event publisher.
 *
 * The rule executor pipeline calls {@link RuleExecutorEventPublisherContract.emitSignalsWritten}
 * after a completed execution when signal events were persisted.
 */
export interface RuleExecutorEventPublisherContract {
  emitSignalsWritten(request: KibanaRequest, input: EmitSignalsWrittenInput): void;
}

/**
 * Singleton publisher of rule-executor domain events onto the in-process
 * {@link EventBus}.
 */
@injectable()
export class RuleExecutorEventPublisher implements RuleExecutorEventPublisherContract {
  constructor(
    @inject(AlertingDomainEventBusToken)
    private readonly eventBus: EventBus<AlertingDomainEvent, AlertingPublisherContext>
  ) {}

  public emitSignalsWritten(request: KibanaRequest, input: EmitSignalsWrittenInput): void {
    if (input.signalEventCount < 1 || input.rule.kind !== 'signal') {
      return;
    }

    const event: RuleExecutionSignalsWrittenEvent = {
      type: RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE,
      payload: {
        occurredAt: new Date().toISOString(),
        signalEventCount: input.signalEventCount,
        rule: buildRuleExecutionSnapshot(input.rule, input.spaceId),
      },
    };

    this.eventBus.publish(event, { request });
  }
}
