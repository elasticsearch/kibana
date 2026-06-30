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
import { MAX_ALERT_ID_LENGTH, MAX_WORKFLOW_MESSAGE_LENGTH } from '../common/constants';

export const SetAlertStatusStepId = 'security.setAlertStatus' as const;

const alertIdsBase = z.object({
  alert_ids: z
    .union([
      z.string().min(1).max(MAX_ALERT_ID_LENGTH),
      z.array(z.string().min(1).max(MAX_ALERT_ID_LENGTH)).min(1),
    ])
    .describe('A single alert ID or a list of IDs to support bulk updates'),
});

export const setAlertStatusInputSchema = z.discriminatedUnion('status', [
  alertIdsBase.extend({
    status: z.literal('closed').describe('The new status for the alerts'),
    close_reason: Reason.optional().describe(
      'Optional reason when closing the alert (e.g. duplicate, false_positive)'
    ),
  }),
  alertIdsBase.extend({
    status: z.enum(['open', 'acknowledged']).describe('The new status for the alerts'),
  }),
]);

export const setAlertStatusOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().max(MAX_WORKFLOW_MESSAGE_LENGTH).optional(),
});

export const setAlertStatusStepCommonDefinition: BaseStepDefinition<
  typeof setAlertStatusInputSchema,
  typeof setAlertStatusOutputSchema
> = {
  id: SetAlertStatusStepId,
  label: i18n.translate('xpack.securitySolution.workflows.steps.setAlertStatus.label', {
    defaultMessage: 'Set Alert Status',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.setAlertStatus.description', {
    defaultMessage: 'Change the status of one or multiple alerts to open, acknowledged, or closed.',
  }),
  category: StepCategory.KibanaSecurity,
  inputSchema: setAlertStatusInputSchema,
  outputSchema: setAlertStatusOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.setAlertStatus.documentation.details',
      {
        defaultMessage:
          'Updates the status of specified alerts. When setting the status to closed, an optional close reason can be provided.',
      }
    ),
    examples: [
      `## Set alert status to acknowledged
\`\`\`yaml
- name: set_alert_status
  type: security.setAlertStatus
  with:
    alert_ids: "{{ variables.alert_id }}"
    status: "acknowledged"
\`\`\``,
      `## Close multiple alerts with a reason
\`\`\`yaml
- name: close_alerts
  type: security.setAlertStatus
  with:
    alert_ids:
      - "alert-1"
      - "alert-2"
    status: "closed"
    close_reason: "false_positive"
\`\`\``,
    ],
  },
};
