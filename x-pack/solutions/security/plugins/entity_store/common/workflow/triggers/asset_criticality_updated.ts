/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

export const ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID =
  'entityStore.entityAssetCriticalityUpdated' as const;

export const ASSET_CRITICALITY_UPDATED_WATCHED_FIELDS = ['asset.criticality'] as const;

export const entityAssetCriticalityUpdatedEventSchema = z.object({
  entityId: z.string().describe('The unique EUID of the entity whose asset criticality changed.'),
  entityType: z.string().describe('The type of entity (e.g. host, user, service, generic).'),
  criticalityLevel: z
    .string()
    .nullable()
    .describe(
      'The new asset criticality level (low_impact, medium_impact, high_impact, extreme_impact), or null when criticality is unassigned.'
    ),
});

export type EntityAssetCriticalityUpdatedEvent = z.infer<
  typeof entityAssetCriticalityUpdatedEventSchema
>;

export const entityAssetCriticalityUpdatedTriggerDefinition: CommonTriggerDefinition = {
  id: ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID,
  eventSchema: entityAssetCriticalityUpdatedEventSchema,
  title: i18n.translate('entityStore.workflow.triggers.entityAssetCriticalityUpdated.title', {
    defaultMessage: 'Entity asset criticality updated',
  }),
  description: i18n.translate(
    'entityStore.workflow.triggers.entityAssetCriticalityUpdated.description',
    {
      defaultMessage:
        'Emitted when an asset criticality level is assigned or removed for an entity in the V2 entity store.',
    }
  ),
  documentation: {
    details: i18n.translate(
      'entityStore.workflow.triggers.entityAssetCriticalityUpdated.documentation.details',
      {
        defaultMessage:
          "Fires whenever an entity's asset criticality is explicitly set or cleared via the Entity Store V2 API. " +
          'Use `event.entityType` to filter by entity type, `event.criticalityLevel` to match specific criticality levels, ' +
          'or `event.criticalityLevel: null` to detect when criticality is removed.',
      }
    ),
    examples: [
      i18n.translate(
        'entityStore.workflow.triggers.entityAssetCriticalityUpdated.documentation.exampleHighImpact',
        {
          defaultMessage: `## React when any entity is assigned high or extreme impact
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.criticalityLevel: "high_impact" OR event.criticalityLevel: "extreme_impact"'
\`\`\``,
          values: { triggerId: ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID },
        }
      ),
      i18n.translate(
        'entityStore.workflow.triggers.entityAssetCriticalityUpdated.documentation.exampleHost',
        {
          defaultMessage: `## React when a host entity criticality changes
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.entityType: "host"'
\`\`\``,
          values: { triggerId: ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID },
        }
      ),
      i18n.translate(
        'entityStore.workflow.triggers.entityAssetCriticalityUpdated.documentation.exampleUnassign',
        {
          defaultMessage: `## React when criticality is removed from an entity
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'NOT event.criticalityLevel: *'
\`\`\``,
          values: { triggerId: ENTITY_ASSET_CRITICALITY_UPDATED_TRIGGER_ID },
        }
      ),
    ],
  },
  snippets: {
    condition: 'event.criticalityLevel: "extreme_impact"',
  },
};
