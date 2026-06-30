/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { ruleLifecycleEventSchema } from './schemas';

export const RuleDisabledTriggerId = 'alerting.ruleDisabled' as const;

export const ruleDisabledTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleLifecycleEventSchema
> = {
  id: RuleDisabledTriggerId,
  eventSchema: ruleLifecycleEventSchema,
  title: i18n.translate('xpack.alertingV2.workflowTriggers.ruleDisabled.title', {
    defaultMessage: 'Alerting - Rule disabled',
  }),
  description: i18n.translate('xpack.alertingV2.workflowTriggers.ruleDisabled.description', {
    defaultMessage: 'Emitted when an alerting rule is disabled.',
  }),
  documentation: {
    details: i18n.translate(
      'xpack.alertingV2.workflowTriggers.ruleDisabled.documentation.details',
      {
        defaultMessage: 'Emitted when a rule transitions to disabled.',
      }
    ),
    examples: [
      i18n.translate('xpack.alertingV2.workflowTriggers.ruleDisabled.documentation.example', {
        defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
        values: { triggerId: RuleDisabledTriggerId },
      }),
    ],
  },
  snippets: { condition: 'event.rule.ruleId: "my-rule-id"' },
};
