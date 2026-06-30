/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import type { ServerTriggerDefinition } from '@kbn/workflows-extensions/server';
import type { RuleLifecycleEvent } from '../../../../../common/workflows/triggers';
import type { RuleEvent } from '../../rule_event_publisher/events';

/**
 * Self-contained binding for one rule-lifecycle → workflow-trigger mapping.
 */
export interface RuleWorkflowTriggerBinding<
  TEvent extends RuleEvent = RuleEvent,
  TSchema extends z.ZodType = z.ZodType
> {
  readonly eventType: TEvent['type'];
  readonly triggerId: string;
  readonly definition: ServerTriggerDefinition<TSchema>;
  toPayload(event: TEvent): RuleLifecycleEvent;
}
