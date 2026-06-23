/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import { StepCategory } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

/**
 * Step type ID for the durable run+poll demonstration step.
 */
export const DurablePollStepTypeId = 'example.durablePollDemo';

export const InputSchema = z.object({
  /**
   * Index pattern the “report” targets (mirrors a real saved search / data view).
   */
  indexPattern: z.string().min(1).default('logs-*'),
  /**
   * How many poll wake-ups are needed before the simulated backend marks the export ready
   * (including the poll that returns `{ output }`). Kept small so demos finish quickly.
   */
  simulatedRenderPolls: z.coerce.number().int().min(1).max(10).default(3),
});

export const OutputSchema = z.object({
  requestId: z.string(),
  documentDownloadPath: z.string(),
  totalHits: z.number().int(),
  generatedAt: z.string(),
});

export type DurablePollStepInputSchema = typeof InputSchema;
export type DurablePollStepOutputSchema = typeof OutputSchema;

export const durablePollStepCommonDefinition: CommonStepDefinition<
  DurablePollStepInputSchema,
  DurablePollStepOutputSchema
> = {
  id: DurablePollStepTypeId,
  category: StepCategory.Data,
  label: i18n.translate('workflowsExtensionsExample.durablePollStep.label', {
    defaultMessage: 'Async report (run + poll demo)',
  }),
  description: i18n.translate('workflowsExtensionsExample.durablePollStep.description', {
    defaultMessage:
      'Starts an async export in run(), then polls until a simulated backend finishes rendering the report.',
  }),
  documentation: {
    details: i18n.translate('workflowsExtensionsExample.durablePollStep.documentation.details', {
      defaultMessage:
        'Demonstrates the durable **start + poll** pattern: `start` submits work and returns `{ state }`; `poll` wakes on `policy` until `{ output }`. In production, `start` would call an HTTP API or task queue and `poll` would read job status from Elasticsearch or an upstream service. Authoring guide: `src/platform/plugins/shared/workflows_extensions/dev_docs/STEPS.md` — **Durable start/poll custom steps** (`createPollServerStepDefinition`).',
    }),
    examples: [
      `## Async export (demo)
\`\`\`yaml
- name: export_slow_errors
  type: ${DurablePollStepTypeId}
  with:
    indexPattern: "logs-*"
    simulatedRenderPolls: 4
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
};
