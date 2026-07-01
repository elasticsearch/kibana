/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

export const CUSTOM_TRIGGER_ID = 'example.customTrigger' as const;

/** Example categories for conditional subscription (workflows can filter with event.category). */
export const CUSTOM_TRIGGER_CATEGORIES = ['alerts', 'notifications', 'audit', 'demo'] as const;
export type CustomTriggerCategory = (typeof CUSTOM_TRIGGER_CATEGORIES)[number];

export const customTriggerEventSchema = z.object({
  message: z.string().describe('The message text for the event.'),
  source: z.string().optional().describe('The source that emitted the event.'),
  category: z.string().optional().describe('Category of the event.'),
  labels: z.array(z.string()).optional().describe('Optional labels for multi-value filtering.'),
  foo: z
    .object({
      bar: z.object({
        baz: z.string(),
      }),
    })
    .optional()
    .describe('Example nested property (foo.bar.baz).'),
  another: z.string().optional().describe('Another string property.'),
});

export type CustomTriggerEvent = z.infer<typeof customTriggerEventSchema>;

/** Shared trigger definition for use by public and server. */
export const commonCustomTriggerDefinition: CommonTriggerDefinition = {
  id: CUSTOM_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: customTriggerEventSchema,
  title: i18n.translate('workflowsExtensionsExample.customTrigger.title', {
    defaultMessage: 'Custom trigger',
  }),
  description: i18n.translate('workflowsExtensionsExample.customTrigger.description', {
    defaultMessage:
      'Emitted when a custom event occurs. Used by the workflows extensions example plugin.',
  }),
  documentation: {
    details: i18n.translate('workflowsExtensionsExample.customTrigger.documentation.details', {
      defaultMessage:
        'Emitted when a custom event occurs. Events can include an optional category (e.g. alerts, notifications, audit, demo). In the `on` block, add a condition (KQL) to filter when this workflow runs using event properties: `event.category`, `event.message`, `event.source`.',
    }),
    examples: [
      i18n.translate(
        'workflowsExtensionsExample.customTrigger.documentation.exampleMatchCategory',
        {
          defaultMessage: `## Match by category (conditional subscription)
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.category: "alerts"'
\`\`\``,
          values: { triggerId: CUSTOM_TRIGGER_ID },
        }
      ),
      i18n.translate('workflowsExtensionsExample.customTrigger.documentation.exampleMatchMessage', {
        defaultMessage: `## Match any message
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.message: *'
\`\`\``,
        values: { triggerId: CUSTOM_TRIGGER_ID },
      }),
      i18n.translate('workflowsExtensionsExample.customTrigger.documentation.exampleMatchSource', {
        defaultMessage: `## Match events from a specific source
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.source: "api"'
\`\`\``,
        values: { triggerId: CUSTOM_TRIGGER_ID },
      }),
      i18n.translate('workflowsExtensionsExample.customTrigger.documentation.exampleMatchError', {
        defaultMessage: `## Match message containing "error"
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.message: *error*'
\`\`\``,
        values: { triggerId: CUSTOM_TRIGGER_ID },
      }),
    ],
  },
  snippets: {
    condition: 'event.category: "alerts"',
  },
};
