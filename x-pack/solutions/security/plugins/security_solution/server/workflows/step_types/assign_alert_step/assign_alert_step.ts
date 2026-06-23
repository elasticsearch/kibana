/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import { DETECTION_ENGINE_ALERT_ASSIGNEES_URL } from '../../../../common/constants';
import { assignAlertStepCommonDefinition } from '../../../../common/workflows/step_types/assign_alert_step/assign_alert_step_common';

export const assignAlertStepDefinition = createServerStepDefinition({
  ...assignAlertStepCommonDefinition,
  handler: async (context) => {
    const {
      alert_ids: alertIds,
      assignees_to_add: add,
      assignees_to_remove: remove,
    } = context.input;

    const signalIds = Array.isArray(alertIds) ? alertIds : [alertIds];

    try {
      const { status: responseStatus, body } = await context.contextManager.callKibanaApi<{
        took?: number;
        errors?: boolean;
        items?: unknown[];
      }>({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_ASSIGNEES_URL,
        body: {
          ids: signalIds,
          assignees: {
            add,
            remove,
          },
        },
      });

      if (responseStatus >= 400) {
        throw new ExecutionError({
          type: 'ApiError',
          message: `Failed to assign alert: HTTP ${responseStatus}`,
          details: { body },
        });
      }

      return {
        output: {
          success: true,
          message: `Successfully updated assignees for ${signalIds.length} alert(s)`,
        },
      };
    } catch (error) {
      if (error instanceof ExecutionError) {
        throw error;
      }
      throw new ExecutionError({
        type: 'ApiError',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: { error },
      });
    }
  },
});
