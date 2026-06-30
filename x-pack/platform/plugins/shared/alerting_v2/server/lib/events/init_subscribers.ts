/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Container } from 'inversify';
import { AlertActionWorkflowSubscriber } from './alert_action_workflow_subscriber/alert_action_workflow_subscriber';
import { RuleExecutorWorkflowSubscriber } from './rule_executor_workflow_subscriber/rule_executor_workflow_subscriber';

/**
 * Activates every event-bus subscriber. Intended to be invoked from the
 * plugin's `OnStart` callback once every start-time dependency
 * (`workflowsExtensions`, core http, etc.) is available, so handlers
 * never run against partially-initialised collaborators.
 *
 */
export function initSubscribers(container: Container): void {
  container.get(AlertActionWorkflowSubscriber).start();
  container.get(RuleExecutorWorkflowSubscriber).start();
}
