/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { ruleLifecycleEventSchema } from './schemas';

export const RuleUpdatedTriggerId = 'alerting.ruleUpdated' as const;

export const ruleUpdatedTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleLifecycleEventSchema
> = {
  id: RuleUpdatedTriggerId,
  eventSchema: ruleLifecycleEventSchema,
  title: i18n.translate('xpack.alertingV2.workflowTriggers.ruleUpdated.title', {
    defaultMessage: 'Alerting - Rule updated',
  }),
  description: i18n.translate('xpack.alertingV2.workflowTriggers.ruleUpdated.description', {
    defaultMessage: 'Emitted when an alerting rule is updated.',
  }),
  documentation: {
    details: i18n.translate('xpack.alertingV2.workflowTriggers.ruleUpdated.documentation.details', {
      defaultMessage:
        'Emitted after any rule update. When enabled state changes, ruleEnabled or ruleDisabled is also emitted. Subscribe to this trigger for all updates, or to the enable/disable triggers for state changes only.',
    }),
    examples: [
      i18n.translate('xpack.alertingV2.workflowTriggers.ruleUpdated.documentation.example', {
        defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
        values: { triggerId: RuleUpdatedTriggerId },
      }),
    ],
  },
  snippets: { condition: 'event.rule.ruleId: "my-rule-id"' },
};
