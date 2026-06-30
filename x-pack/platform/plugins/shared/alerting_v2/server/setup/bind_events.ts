/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ContainerModuleLoadOptions } from 'inversify';
import { AsyncDomainEventBus } from '../lib/events/event_bus';
import { AlertingDomainEventBusToken } from '../lib/events/domain_events';
import { AlertActionEventPublisher } from '../lib/events/alert_action_event_publisher/alert_action_event_publisher';
import { AlertActionWorkflowSubscriber } from '../lib/events/alert_action_workflow_subscriber/alert_action_workflow_subscriber';
import { RuleEventPublisher } from '../lib/events/rule_event_publisher/rule_event_publisher';
import { RuleWorkflowSubscriber } from '../lib/events/rule_workflow_subscriber/rule_workflow_subscriber';

/**
 * DI bindings for the in-process event subsystem.
 *
 * Future subscribers (event log, telemetry, …) and additional publishers
 * (rule executor, dispatcher) should be registered here so the events
 * subsystem's wiring lives in a single place, parallel to its code in
 * `lib/events/`.
 *
 * Subscribers are wired as singletons but are NOT activated here —
 * `start()` is called from `bindOnStart` so subscriptions only attach
 * once the plugin has fully started. This avoids handlers running
 * against partially-initialised dependencies during the setup phase.
 */
export const bindEvents = ({ bind }: ContainerModuleLoadOptions) => {
  bind(AsyncDomainEventBus).toSelf().inSingletonScope();
  bind(AlertingDomainEventBusToken).toService(AsyncDomainEventBus);

  bind(AlertActionEventPublisher).toSelf().inSingletonScope();

  bind(AlertActionWorkflowSubscriber).toSelf().inSingletonScope();

  bind(RuleEventPublisher).toSelf().inSingletonScope();

  bind(RuleWorkflowSubscriber).toSelf().inSingletonScope();
};
