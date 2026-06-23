/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { timeRangeSchema } from '@kbn/agent-builder-dashboards-common';
import { defineOperation } from './types';

export const setMetadataOperation = defineOperation({
  schema: z.object({
    operation: z.literal('set_metadata'),
    title: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Non-empty dashboard title. If the current title is empty, missing, or a placeholder, invent one from the dashboard's contents."
      ),
    description: z.string().optional(),
    time_range: timeRangeSchema
      .optional()
      .describe(
        'Set the dashboard time range. Convert natural language to Kibana date math or ISO 8601: "last 30 minutes" → { from: "now-30m", to: "now" }, "last 90 days" → { from: "now-90d", to: "now" }, "May 20–24" → { from: "2024-05-20T00:00:00.000Z", to: "2024-05-24T23:59:59.999Z", mode: "absolute" }.'
      ),
  }),
  handler: ({ dashboardData, operation, context }) => {
    if (
      operation.title === undefined &&
      operation.description === undefined &&
      operation.time_range === undefined
    ) {
      context.logger.debug('Skipping empty set_metadata operation');
      return dashboardData;
    }

    const metadataPatch = {
      ...(operation.title !== undefined ? { title: operation.title } : {}),
      ...(operation.description !== undefined ? { description: operation.description } : {}),
      ...(operation.time_range !== undefined ? { time_range: operation.time_range } : {}),
    };

    return {
      ...dashboardData,
      ...metadataPatch,
    };
  },
});
