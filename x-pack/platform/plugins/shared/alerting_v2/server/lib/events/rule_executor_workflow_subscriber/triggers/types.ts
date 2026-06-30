/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import type { ServerTriggerDefinition } from '@kbn/workflows-extensions/server';
import type { RuleExecutorEvent } from '../../rule_executor_event_publisher/events';

/**
 * Self-contained binding for one rule-executor → workflow-trigger mapping.
 */
export interface RuleExecutorWorkflowTriggerBinding<
  TEvent extends RuleExecutorEvent = RuleExecutorEvent,
  TSchema extends z.ZodObject = z.ZodObject
> {
  readonly eventType: TEvent['type'];
  readonly triggerId: string;
  readonly definition: ServerTriggerDefinition<TSchema>;
  toPayload(event: TEvent): z.infer<TSchema>;
}
