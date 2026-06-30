/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ruleKindSchema, tagsSchema } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

export const RULE_SIGNALS_WRITTEN_TRIGGER_ID = 'alerting.ruleSignalsWritten' as const;

export const ruleExecutionSnapshotSchema = z
  .object({
    ruleId: z.string().describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.ruleId', {
        defaultMessage: 'Identifier of the alerting rule that produced signal events.',
      })
    ),
    spaceId: z.string().describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.spaceId', {
        defaultMessage: 'Kibana space the rule lives in.',
      })
    ),
    name: z.string().describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.name', {
        defaultMessage: 'Rule display name.',
      })
    ),
    kind: ruleKindSchema.describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.kind', {
        defaultMessage: 'Rule kind: alert or signal.',
      })
    ),
    query: z.string().describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.query', {
        defaultMessage: 'ES|QL detection query (evaluation.query.base).',
      })
    ),
    tags: tagsSchema.describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.tags', {
        defaultMessage: 'Rule tags for categorization and workflow trigger filtering.',
      })
    ),
  })
  .strict();

export type RuleExecutionSnapshot = z.infer<typeof ruleExecutionSnapshotSchema>;

export const ruleSignalsWrittenPayloadSchema = z
  .object({
    occurredAt: z.iso.datetime().describe(
      i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.occurredAt', {
        defaultMessage: 'ISO timestamp of when the rule execution completed.',
      })
    ),
    signalEventCount: z
      .number()
      .int()
      .min(1)
      .describe(
        i18n.translate('xpack.alertingVTwo.triggers.ruleSignalsWritten.schema.signalEventCount', {
          defaultMessage: 'Number of signal rule events written during this execution.',
        })
      ),
    rule: ruleExecutionSnapshotSchema,
  })
  .strict();

export type RuleSignalsWrittenPayload = z.infer<typeof ruleSignalsWrittenPayloadSchema>;

export const ruleSignalsWrittenTriggerCommonDefinition: CommonTriggerDefinition<
  typeof ruleSignalsWrittenPayloadSchema
> = {
  id: RULE_SIGNALS_WRITTEN_TRIGGER_ID,
  eventSchema: ruleSignalsWrittenPayloadSchema,
  title: i18n.translate('xpack.alertingVTwo.workflowTriggers.ruleSignalsWritten.title', {
    defaultMessage: 'Alerting - Rule signals written',
  }),
  description: i18n.translate(
    'xpack.alertingVTwo.workflowTriggers.ruleSignalsWritten.description',
    {
      defaultMessage:
        'Emitted when a signal rule finishes execution and writes one or more signal events.',
    }
  ),
  documentation: {
    details: i18n.translate(
      'xpack.alertingVTwo.workflowTriggers.ruleSignalsWritten.documentation.details',
      {
        defaultMessage:
          'Emitted once per completed rule execution when signal events were persisted. The payload includes event.rule (ruleId, spaceId, name, kind, query, tags), event.scheduledAt, and event.signalEventCount for trigger conditions.',
      }
    ),
    examples: [
      i18n.translate(
        'xpack.alertingVTwo.workflowTriggers.ruleSignalsWritten.documentation.example',
        {
          defaultMessage: `## Run for a specific rule
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.rule.ruleId: "my-rule-id"'
\`\`\``,
          values: {
            triggerId: RULE_SIGNALS_WRITTEN_TRIGGER_ID,
          },
        }
      ),
    ],
  },
  snippets: {
    condition: 'event.rule.kind: "signal"',
  },
};
