/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleBuilderDefinition } from '@kbn/alerting-v2-rule-form';

const queue: RuleBuilderDefinition[] = [];

/**
 * Queues a builder UI contributed through the setup contract.
 *
 * Definitions are held here rather than handed to `@kbn/alerting-v2-rule-form` directly so that
 * plugin setup does not pull the rule form into the page-load bundle.
 */
export const queueRuleBuilderRegistration = <TState>(
  definition: RuleBuilderDefinition<TState>
): void => {
  queue.push(definition as RuleBuilderDefinition);
};

/**
 * Hands every queued builder to the rule form registry; call before rendering any rule UI.
 */
export const applyRuleBuilderRegistrations = async (): Promise<void> => {
  if (queue.length === 0) {
    return;
  }

  const { registerRuleBuilder } = await import('@kbn/alerting-v2-rule-form');
  for (const definition of queue.splice(0)) {
    registerRuleBuilder(definition);
  }
};
