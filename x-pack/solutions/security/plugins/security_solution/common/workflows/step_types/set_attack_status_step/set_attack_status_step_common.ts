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
import { Reason } from '../../../api/model/alert.gen';
import { MAX_ATTACK_ID_LENGTH, MAX_WORKFLOW_MESSAGE_LENGTH } from '../common/constants';

export const SetAttackStatusStepId = 'security.setAttackStatus' as const;

const idsBase = z.object({
  ids: z
    .union([
      z.string().min(1).max(MAX_ATTACK_ID_LENGTH),
      z.array(z.string().min(1).max(MAX_ATTACK_ID_LENGTH)).min(1),
    ])
    .describe('A single attack ID or a list of IDs to support bulk updates'),
  update_related_alerts: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to apply the status to any related alerts of the attack.'),
});

export const setAttackStatusInputSchema = z.discriminatedUnion('status', [
  idsBase.extend({
    status: z.literal('closed').describe('The new status for the attacks'),
    reason: Reason.optional().describe(
      'Optional reason when closing the attack (e.g. duplicate, false_positive)'
    ),
  }),
  idsBase.extend({
    status: z.enum(['open', 'acknowledged']).describe('The new status for the attacks'),
  }),
]);

export const setAttackStatusOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().max(MAX_WORKFLOW_MESSAGE_LENGTH).optional(),
});

export const setAttackStatusStepCommonDefinition: BaseStepDefinition<
  typeof setAttackStatusInputSchema,
  typeof setAttackStatusOutputSchema
> = {
  id: SetAttackStatusStepId,
  label: i18n.translate('xpack.securitySolution.workflows.steps.setAttackStatus.label', {
    defaultMessage: 'Set Attack Status',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.setAttackStatus.description',
    {
      defaultMessage:
        'Change the status of one or multiple attacks to open, acknowledged, or closed.',
    }
  ),
  category: StepCategory.KibanaSecurity,
  inputSchema: setAttackStatusInputSchema,
  outputSchema: setAttackStatusOutputSchema,
  stability: 'tech_preview',
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.setAttackStatus.documentation.details',
      {
        defaultMessage:
          'Updates the status of specified attacks. When setting the status to closed, an optional close reason can be provided.',
      }
    ),
    examples: [
      `## Set attack status to acknowledged
\`\`\`yaml
- name: set_attack_status
  type: security.setAttackStatus
  with:
    ids: "{{ variables.attack_id }}"
    status: "acknowledged"
\`\`\``,
      `## Close multiple attacks with a reason
\`\`\`yaml
- name: close_attacks
  type: security.setAttackStatus
  with:
    ids:
      - "attack-1"
      - "attack-2"
    status: "closed"
    reason: "false_positive"
    update_related_alerts: true
\`\`\``,
    ],
  },
};
