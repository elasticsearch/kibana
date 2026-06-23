/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { panelGridSchema } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import {
  appendPanelsToDashboard,
  removePanelsFromDashboard,
  updatePanelInDashboard,
} from '../dashboard_state';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from '../failure_types';
import { defineOperation } from './types';

export const updatePanelLayoutsOperation = defineOperation({
  schema: z.object({
    operation: z.literal('update_panel_layouts'),
    panels: z
      .array(
        z.object({
          panelId: z.string().max(256).describe('ID of the panel to update.'),
          grid: panelGridSchema
            .optional()
            .describe('New grid position/size. Omit to keep the current grid.'),
          sectionId: z
            .string()
            .max(256)
            .nullable()
            .optional()
            .describe(
              'Move panel to an existing section by its id. The section must already exist (use add_section first). null promotes to top level. Omit to keep the current location.'
            ),
        })
      )
      .min(1),
  }),
  handler: ({ dashboardData, operation, context }) => {
    let nextDashboardData = dashboardData;

    const recordMissingPanelFailure = (panelId: string) => {
      context.failures.push({
        type: DASHBOARD_OPERATION_FAILURE_TYPES.updatePanelLayouts,
        identifier: panelId,
        error: `Panel "${panelId}" not found.`,
      });
    };

    for (const { panelId, grid, sectionId } of operation.panels) {
      // sectionId omitted: do not move the panel
      if (sectionId === undefined) {
        const updateResult = updatePanelInDashboard({
          dashboardData: nextDashboardData,
          panelId,
          transformPanel: (panel) => ({
            ...panel,
            ...(grid ? { grid } : {}),
          }),
        });

        if (!updateResult.updated) {
          recordMissingPanelFailure(panelId);
          continue;
        }

        nextDashboardData = updateResult.dashboardData;
        continue;
      }

      // sectionId provided: move the panel to that section, or to the top level when null
      const removalResult = removePanelsFromDashboard({
        dashboardData: nextDashboardData,
        panelIdsToRemove: [panelId],
      });
      const { dashboardData: dashboardAfterRemoval, removedPanels } = removalResult;

      if (removedPanels.length === 0) {
        recordMissingPanelFailure(panelId);
        continue;
      }

      const [panelToMove] = removedPanels;
      nextDashboardData = appendPanelsToDashboard({
        dashboardData: dashboardAfterRemoval,
        panelsToAdd: [
          {
            ...panelToMove,
            ...(grid ? { grid } : {}),
          },
        ],
        // sectionId targets a section; null promotes the panel to the top level
        sectionId: sectionId ?? undefined,
      });
    }

    return nextDashboardData;
  },
});
