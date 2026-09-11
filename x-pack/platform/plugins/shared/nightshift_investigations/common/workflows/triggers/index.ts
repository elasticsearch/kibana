/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

/**
 * `manual` is the subject for an investigation that is not about a stored entity: the caller's
 * question is the whole subject, so there is no significant event or alert to bind the run to.
 */
export const INVESTIGATION_SUBJECT_TYPES = ['significant_event', 'alert', 'manual'] as const;
export type InvestigationSubjectType = (typeof INVESTIGATION_SUBJECT_TYPES)[number];

export const INVESTIGATION_TRIGGER_TYPES = ['automatic', 'manual'] as const;
export type InvestigationTriggerType = (typeof INVESTIGATION_TRIGGER_TYPES)[number];
export const DEFAULT_INVESTIGATION_TRIGGER_TYPE: InvestigationTriggerType = 'manual';

export const INVESTIGATION_STARTED_TRIGGER_ID = 'nightshift-investigations.started' as const;
export const INVESTIGATION_COMPLETED_TRIGGER_ID = 'nightshift-investigations.completed' as const;
export const INVESTIGATION_FAILED_TRIGGER_ID = 'nightshift-investigations.failed' as const;

export const EMITTED_INVESTIGATION_STATUSES = ['running', 'completed', 'failed'] as const;

const subjectSchema = z.object({
  type: z.enum(INVESTIGATION_SUBJECT_TYPES).describe('Kind of entity being investigated.'),
  id: z.string().describe('Identifier of the investigated entity.'),
});

const baseInvestigationSchema = z.object({
  investigation_id: z.string().describe('ID of the investigation (the workflow execution ID).'),
  status: z
    .enum(EMITTED_INVESTIGATION_STATUSES)
    .describe('Lifecycle status of the investigation at emit time.'),
  subject: subjectSchema.describe('The entity this investigation is about.'),
  trigger_type: z
    .enum(INVESTIGATION_TRIGGER_TYPES)
    .describe('What initiated the investigation: automatic or manual.'),
  started_at: z.string().describe('When the investigation started (ISO 8601 timestamp).'),
});

export type InvestigationsTriggerBasePayload = z.infer<typeof baseInvestigationSchema>;

const startedSchema = baseInvestigationSchema.extend({
  status: z.literal('running').describe('Always "running" for this trigger.'),
});

const completedSchema = baseInvestigationSchema.extend({
  status: z.literal('completed').describe('Always "completed" for this trigger.'),
  completed_at: z.string().describe('When the investigation finished (ISO 8601 timestamp).'),
});

const failedSchema = baseInvestigationSchema.extend({
  status: z.literal('failed').describe('Always "failed" for this trigger.'),
  completed_at: z.string().describe('When the investigation finished (ISO 8601 timestamp).'),
});

export type InvestigationStartedTriggerPayload = z.infer<typeof startedSchema>;
export type InvestigationCompletedTriggerPayload = z.infer<typeof completedSchema>;
export type InvestigationFailedTriggerPayload = z.infer<typeof failedSchema>;

export interface InvestigationsTriggerPayloadMap {
  [INVESTIGATION_STARTED_TRIGGER_ID]: InvestigationStartedTriggerPayload;
  [INVESTIGATION_COMPLETED_TRIGGER_ID]: InvestigationCompletedTriggerPayload;
  [INVESTIGATION_FAILED_TRIGGER_ID]: InvestigationFailedTriggerPayload;
}

export type InvestigationsTriggerId = keyof InvestigationsTriggerPayloadMap;

const notifyExample = (
  triggerId: string,
  messageLine: string
): string => `## Notify on a lifecycle change
\`\`\`yaml
triggers:
  - type: ${triggerId}
steps:
  - name: notify
    type: action.slack
    with:
      message: "${messageLine}"
\`\`\``;

export const investigationStartedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: INVESTIGATION_STARTED_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: startedSchema,
  title: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationStarted.title',
    {
      defaultMessage: 'Nightshift investigations - Investigation started',
    }
  ),
  description: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationStarted.description',
    { defaultMessage: 'Emitted when an investigation starts.' }
  ),
  documentation: {
    details: i18n.translate(
      'xpack.nightshiftInvestigations.workflowTriggers.investigationStarted.documentation.details',
      {
        defaultMessage:
          'Emitted when an investigation begins for any subject (significant event, alert or manual). Filter with KQL on event.* (e.g. event.subject.type).',
      }
    ),
    examples: [
      notifyExample(
        INVESTIGATION_STARTED_TRIGGER_ID,
        'Investigation started for {{event.subject.type}} {{event.subject.id}}'
      ),
    ],
  },
  snippets: { condition: 'event.subject.type: "significant_event"' },
};

export const investigationCompletedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: INVESTIGATION_COMPLETED_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: completedSchema,
  title: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationCompleted.title',
    {
      defaultMessage: 'Nightshift investigations - Investigation completed',
    }
  ),
  description: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationCompleted.description',
    { defaultMessage: 'Emitted when an investigation finishes successfully.' }
  ),
  documentation: {
    details: i18n.translate(
      'xpack.nightshiftInvestigations.workflowTriggers.investigationCompleted.documentation.details',
      {
        defaultMessage:
          'Emitted when an investigation finishes with status completed. Use event.investigation_id to fetch the full investigation result.',
      }
    ),
    examples: [
      notifyExample(
        INVESTIGATION_COMPLETED_TRIGGER_ID,
        'Investigation {{event.investigation_id}} completed'
      ),
    ],
  },
  snippets: { condition: 'event.status: "completed"' },
};

export const investigationFailedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: INVESTIGATION_FAILED_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: failedSchema,
  title: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationFailed.title',
    {
      defaultMessage: 'Nightshift investigations - Investigation failed',
    }
  ),
  description: i18n.translate(
    'xpack.nightshiftInvestigations.workflowTriggers.investigationFailed.description',
    {
      defaultMessage: 'Emitted when an investigation fails.',
    }
  ),
  documentation: {
    details: i18n.translate(
      'xpack.nightshiftInvestigations.workflowTriggers.investigationFailed.documentation.details',
      {
        defaultMessage:
          'Emitted when an investigation finishes with status failed. Use event.investigation_id to fetch error details.',
      }
    ),
    examples: [
      notifyExample(
        INVESTIGATION_FAILED_TRIGGER_ID,
        'Investigation {{event.investigation_id}} failed'
      ),
    ],
  },
  snippets: { condition: 'event.status: "failed"' },
};

export const investigationsTriggerCommonDefinitions: CommonTriggerDefinition[] = [
  investigationStartedTriggerCommonDefinition,
  investigationCompletedTriggerCommonDefinition,
  investigationFailedTriggerCommonDefinition,
];
