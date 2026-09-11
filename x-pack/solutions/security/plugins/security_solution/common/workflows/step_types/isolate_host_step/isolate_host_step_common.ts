/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';
import { MAX_WORKFLOW_MESSAGE_LENGTH } from '../common/constants';

export const IsolateHostStepId = 'security.endpointIsolateHost' as const;

/** Max chars for an Elastic Defend agent.id (UUID, ~36 chars; 256 is safe). */
const MAX_ENDPOINT_ID_LENGTH = 256;
/** Match the endpoint API: up to 250 endpoints per call. */
const MAX_ENDPOINT_IDS = 250;
/** Match BaseActionRequestSchema.comment maxLength. */
const MAX_COMMENT_LENGTH = 30000;

export const isolateHostInputSchema = z.object({
  endpoint_ids: z
    .array(z.string().min(1).max(MAX_ENDPOINT_ID_LENGTH))
    .min(1)
    .max(MAX_ENDPOINT_IDS)
    .describe('Elastic Defend agent IDs (agent.id) of the endpoints to isolate.'),
  comment: z
    .string()
    .max(MAX_COMMENT_LENGTH)
    .optional()
    .describe('Optional comment explaining why these hosts are being isolated.'),
});

export const isolateHostOutputSchema = z.object({
  action_id: z.string().describe('The ID of the dispatched isolation action.'),
  status: z
    .enum(['failed', 'pending', 'successful', 'canceled'])
    .describe('Final status of the response action after polling for completion.'),
  was_successful: z.boolean().describe('Whether the response action completed successfully.'),
  message: z.string().max(MAX_WORKFLOW_MESSAGE_LENGTH).optional(),
});

export const isolateHostStepCommonDefinition: BaseStepDefinition<
  typeof isolateHostInputSchema,
  typeof isolateHostOutputSchema
> = {
  id: IsolateHostStepId,
  label: i18n.translate('xpack.securitySolution.workflows.steps.endpointIsolateHost.label', {
    defaultMessage: 'Isolate Host',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.endpointIsolateHost.description',
    {
      defaultMessage:
        'Disconnects one or more endpoints from the network via the Elastic Defend response action. Only Elastic Defend retains connectivity.',
    }
  ),
  category: StepCategory.KibanaSecurity,
  inputSchema: isolateHostInputSchema,
  outputSchema: isolateHostOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.endpointIsolateHost.documentation.details',
      {
        defaultMessage:
          'Dispatches an Elastic Defend isolate response action for the specified endpoints, then polls every 10 seconds until the action completes or times out (up to 10 minutes / 60 attempts). The returned status and was_successful fields reflect the final outcome. Requires the `canIsolateHost` endpoint privilege.',
      }
    ),
    examples: [
      `## Isolate a single endpoint
\`\`\`yaml
- name: isolate_host
  type: security.endpointIsolateHost
  with:
    endpoint_ids:
      - "{{ steps.resolve_agent.output.agent_id }}"
    comment: "Isolated by automated workflow after forensic analysis."
\`\`\``,
    ],
  },
};
