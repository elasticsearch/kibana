/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { ruleLifecycleEventSchema } from './schemas';

export const RuleDeletedTriggerId = 'alerting.ruleDeleted' as const;

export const ruleDeletedTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleLifecycleEventSchema
> = {
  id: RuleDeletedTriggerId,
  eventSchema: ruleLifecycleEventSchema,
  title: i18n.translate('xpack.alertingV2.workflowTriggers.ruleDeleted.title', {
    defaultMessage: 'Alerting - Rule deleted',
  }),
  description: i18n.translate('xpack.alertingV2.workflowTriggers.ruleDeleted.description', {
    defaultMessage: 'Emitted when an alerting rule is deleted.',
  }),
  documentation: {
    details: i18n.translate('xpack.alertingV2.workflowTriggers.ruleDeleted.documentation.details', {
      defaultMessage:
        'Emitted after rule deletion. The payload includes event.rule with ruleId and spaceId. Bulk deletes emit one event per successfully deleted rule.',
    }),
    examples: [
      i18n.translate('xpack.alertingV2.workflowTriggers.ruleDeleted.documentation.example', {
        defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
        values: { triggerId: RuleDeletedTriggerId },
      }),
    ],
  },
  snippets: { condition: 'event.rule.ruleId: "my-rule-id"' },
};
