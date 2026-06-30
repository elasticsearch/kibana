/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

export const ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID = 'entityStore.entityRiskScoreChanged' as const;

export const RISK_SCORE_CHANGED_WATCHED_FIELDS = ['entity.risk.calculated_score_norm'] as const;

export const entityRiskScoreChangedEventSchema = z.object({
  entityId: z.string().describe('The unique EUID of the entity whose risk score changed.'),
  entityType: z.string().describe('The type of entity (e.g. host, user, service, generic).'),
  score: z.number().describe('The normalized risk score after the update (0–100).'),
  previousScore: z
    .number()
    .nullable()
    .describe(
      'The normalized risk score before the update, or null when this is the first score assignment.'
    ),
  delta: z
    .number()
    .nullable()
    .describe(
      'The change in normalized risk score (positive for increase, negative for decrease). ' +
        'Null when the previous score is unavailable.'
    ),
  direction: z
    .enum(['increase', 'decrease'])
    .nullable()
    .describe(
      'Whether the risk score increased or decreased. ' +
        'Null when the previous score is unavailable.'
    ),
});

export type EntityRiskScoreChangedEvent = z.infer<typeof entityRiskScoreChangedEventSchema>;

export const entityRiskScoreChangedTriggerDefinition: CommonTriggerDefinition = {
  id: ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID,
  eventSchema: entityRiskScoreChangedEventSchema,
  title: i18n.translate('entityStore.workflow.triggers.entityRiskScoreChanged.title', {
    defaultMessage: 'Entity risk score changed',
  }),
  description: i18n.translate('entityStore.workflow.triggers.entityRiskScoreChanged.description', {
    defaultMessage:
      'Emitted when the normalized risk score for an entity in the V2 entity store is updated.',
  }),
  documentation: {
    details: i18n.translate(
      'entityStore.workflow.triggers.entityRiskScoreChanged.documentation.details',
      {
        defaultMessage:
          'Fires whenever `entity.risk.calculated_score_norm` is written for an entity via the Entity Store V2 API. ' +
          'Use `event.direction` and `event.delta` to filter by direction and magnitude of change, ' +
          'or `event.score` to react when the score crosses an absolute threshold. ',
      }
    ),
    examples: [
      i18n.translate(
        'entityStore.workflow.triggers.entityRiskScoreChanged.documentation.exampleIncrease',
        {
          defaultMessage: `## React when risk score increases by 25 or more (default)
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.direction: "increase" AND event.delta >= 25'
\`\`\``,
          values: { triggerId: ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID },
        }
      ),
      i18n.translate(
        'entityStore.workflow.triggers.entityRiskScoreChanged.documentation.exampleDecrease',
        {
          defaultMessage: `## React when risk score decreases
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.direction: "decrease"'
\`\`\``,
          values: { triggerId: ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID },
        }
      ),
      i18n.translate(
        'entityStore.workflow.triggers.entityRiskScoreChanged.documentation.exampleThreshold',
        {
          defaultMessage: `## React when risk score crosses a high-risk threshold
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.score >= 70'
\`\`\``,
          values: { triggerId: ENTITY_RISK_SCORE_CHANGED_TRIGGER_ID },
        }
      ),
    ],
  },
  snippets: {
    condition: 'event.direction: "increase" AND event.delta >= 25',
  },
};
