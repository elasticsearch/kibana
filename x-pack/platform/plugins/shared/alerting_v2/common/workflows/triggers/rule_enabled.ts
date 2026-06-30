/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { ruleLifecycleEventSchema } from './schemas';

export const RuleEnabledTriggerId = 'alerting.ruleEnabled' as const;

export const ruleEnabledTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleLifecycleEventSchema
> = {
  id: RuleEnabledTriggerId,
  eventSchema: ruleLifecycleEventSchema,
  title: i18n.translate('xpack.alertingV2.workflowTriggers.ruleEnabled.title', {
    defaultMessage: 'Alerting - Rule enabled',
  }),
  description: i18n.translate('xpack.alertingV2.workflowTriggers.ruleEnabled.description', {
    defaultMessage: 'Emitted when an alerting rule is enabled.',
  }),
  documentation: {
    details: i18n.translate('xpack.alertingV2.workflowTriggers.ruleEnabled.documentation.details', {
      defaultMessage: 'Emitted when a rule transitions to enabled.',
    }),
    examples: [
      i18n.translate('xpack.alertingV2.workflowTriggers.ruleEnabled.documentation.example', {
        defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
        values: { triggerId: RuleEnabledTriggerId },
      }),
    ],
  },
  snippets: { condition: 'event.rule.ruleId: "my-rule-id"' },
};
