/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { removePanelsFromDashboard } from '../dashboard_state';
import { defineOperation } from './types';

export const removePanelsOperation = defineOperation({
  schema: z.object({
    operation: z.literal('remove_panels'),
    panelIds: z
      .array(z.string().max(256))
      .min(1)
      .describe('Panel ids to remove from the dashboard.'),
  }),
  handler: ({ dashboardData, operation, context }) => {
    const { dashboardData: dashboardWithoutPanels, removedPanels } = removePanelsFromDashboard({
      dashboardData,
      panelIdsToRemove: operation.panelIds,
    });

    if (removedPanels.length === 0) {
      return dashboardData;
    }

    context.logger.debug(`Removed ${removedPanels.length} panels from dashboard`);
    return dashboardWithoutPanels;
  },
});
