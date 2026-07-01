/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import { DETECTION_ENGINE_ATTACKS_STATUS_URL } from '../../../../common/constants';
import { setAttackStatusStepCommonDefinition } from '../../../../common/workflows/step_types/set_attack_status_step/set_attack_status_step_common';

export const setAttackStatusStepDefinition = createServerStepDefinition({
  ...setAttackStatusStepCommonDefinition,
  handler: async (context) => {
    const { ids, status, update_related_alerts: updateRelatedAlerts } = context.input;
    const reason = 'reason' in context.input ? context.input.reason : undefined;

    const attackIds = Array.isArray(ids) ? ids : [ids];

    try {
      const { status: responseStatus, body } = await context.contextManager.callKibanaApi<
        Record<string, unknown>
      >({
        method: 'POST',
        path: DETECTION_ENGINE_ATTACKS_STATUS_URL,
        body: {
          ids: attackIds,
          status,
          update_related_alerts: updateRelatedAlerts,
          ...(reason ? { reason } : {}),
        },
      });

      if (responseStatus >= 400) {
        throw new ExecutionError({
          type: 'ApiError',
          message: `Failed to set attack status: HTTP ${responseStatus}`,
          details: { body },
        });
      }

      return {
        output: {
          success: true,
          message: `Successfully updated status to ${status} for ${attackIds.length} attack(s)`,
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
