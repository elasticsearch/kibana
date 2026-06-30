/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { ruleLifecycleEventSchema } from './schemas';

export const RuleCreatedTriggerId = 'alerting.ruleCreated' as const;

export const ruleCreatedTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleLifecycleEventSchema
> = {
  id: RuleCreatedTriggerId,
  eventSchema: ruleLifecycleEventSchema,
  title: i18n.translate('xpack.alertingV2.workflowTriggers.ruleCreated.title', {
    defaultMessage: 'Alerting - Rule created',
  }),
  description: i18n.translate('xpack.alertingV2.workflowTriggers.ruleCreated.description', {
    defaultMessage: 'Emitted when an alerting rule is created.',
  }),
  documentation: {
    details: i18n.translate('xpack.alertingV2.workflowTriggers.ruleCreated.documentation.details', {
      defaultMessage:
        'Emitted after rule creation. The payload includes event.rule with ruleId and spaceId. Use KQL on event.rule.* for trigger conditions.',
    }),
    examples: [
      i18n.translate('xpack.alertingV2.workflowTriggers.ruleCreated.documentation.example', {
        defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
        values: { triggerId: RuleCreatedTriggerId },
      }),
    ],
  },
  snippets: { condition: 'event.rule.ruleId: "my-rule-id"' },
};
