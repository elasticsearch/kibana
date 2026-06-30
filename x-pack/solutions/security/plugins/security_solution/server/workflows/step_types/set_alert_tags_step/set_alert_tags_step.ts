/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import { DETECTION_ENGINE_ALERT_TAGS_URL } from '../../../../common/constants';
import { setAlertTagsStepCommonDefinition } from '../../../../common/workflows/step_types/set_alert_tags_step/set_alert_tags_step_common';

export const setAlertTagsStepDefinition = createServerStepDefinition({
  ...setAlertTagsStepCommonDefinition,
  handler: async (context) => {
    // zod `.default([])` doesn't apply at runtime: the engine renders `context.input` from the
    // `with` block via `renderValueAccordingToContext` and never runs `inputSchema.parse()`. The
    // sibling `setAlertStatus` handler probes for `close_reason` via `in` for the same reason.
    const {
      alert_ids: alertIds,
      tags_to_add: tagsToAdd = [],
      tags_to_remove: tagsToRemove = [],
    } = context.input;
    const ids = Array.isArray(alertIds) ? alertIds : [alertIds];

    try {
      const { status: responseStatus, body } = await context.contextManager.callKibanaApi<{
        version?: string | number;
        updated?: number;
        failures?: unknown[];
      }>({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: {
          ids,
          tags: {
            tags_to_add: tagsToAdd,
            tags_to_remove: tagsToRemove,
          },
        },
      });

      if (responseStatus >= 400) {
        throw new ExecutionError({
          type: 'ApiError',
          message: `Failed to set alert tags: HTTP ${responseStatus}`,
          details: { body },
        });
      }

      const addedCount = tagsToAdd.length;
      const removedCount = tagsToRemove.length;
      const parts: string[] = [];
      if (addedCount > 0) parts.push(`added ${addedCount} tag(s)`);
      if (removedCount > 0) parts.push(`removed ${removedCount} tag(s)`);

      return {
        output: {
          success: true,
          message: `Successfully ${parts.join(' and ')} on ${ids.length} alert(s)`,
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
