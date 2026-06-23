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
 * Step type ID for the poll-only job status demonstration step.
 */
export const PollOnlyJobStepTypeId = 'example.pollOnlyJobDemo';

export const InputSchema = z.object({
  /**
   * Identifier returned when the job was created (transform, snapshot, export API, etc.).
   */
  jobId: z.string().min(1),
  /**
   * How many poll wake-ups before the simulated upstream marks the job complete
   * (including the poll that returns `{ output }`).
   */
  simulatedStatusPolls: z.coerce.number().int().min(1).max(10).default(3),
});

export const OutputSchema = z.object({
  jobId: z.string(),
  status: z.enum(['completed']),
  resultUri: z.string(),
  completedAt: z.string(),
});

export type PollOnlyJobStepInputSchema = typeof InputSchema;
export type PollOnlyJobStepOutputSchema = typeof OutputSchema;

export const pollOnlyJobStepCommonDefinition: CommonStepDefinition<
  PollOnlyJobStepInputSchema,
  PollOnlyJobStepOutputSchema
> = {
  id: PollOnlyJobStepTypeId,
  category: StepCategory.Data,
  label: i18n.translate('workflowsExtensionsExample.pollOnlyJobStep.label', {
    defaultMessage: 'Wait for async job (poll-only demo)',
  }),
  description: i18n.translate('workflowsExtensionsExample.pollOnlyJobStep.description', {
    defaultMessage:
      'Polls an existing async job until it completes. Use when a prior step or trigger already returned a job id.',
  }),
  documentation: {
    details: i18n.translate('workflowsExtensionsExample.pollOnlyJobStep.documentation.details', {
      defaultMessage:
        'Demonstrates the **poll-only** pattern: no `start` — the job id is already in `input` (from a connector, trigger payload, or an earlier step). `poll` runs immediately and on `policy` until `{ output }`. In production, each poll would call something like `GET /_transform/{jobId}/_stats` or your vendor export status API. Contrast with `example.durablePollDemo`, which uses `start` + `poll` when this step must submit work itself. Authoring guide: `src/platform/plugins/shared/workflows_extensions/dev_docs/STEPS.md` — **Poll-only variant**.',
    }),
    examples: [
      `## Wait for transform started elsewhere
\`\`\`yaml
- name: wait_for_transform
  type: ${PollOnlyJobStepTypeId}
  with:
    jobId: "{{ steps.start_transform.output.taskId }}"
    simulatedStatusPolls: 4
\`\`\``,
      `## Poll a job id from the trigger payload
\`\`\`yaml
- name: wait_for_export
  type: ${PollOnlyJobStepTypeId}
  with:
    jobId: "{{ trigger.event.exportJobId }}"
    simulatedStatusPolls: 3
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
};
