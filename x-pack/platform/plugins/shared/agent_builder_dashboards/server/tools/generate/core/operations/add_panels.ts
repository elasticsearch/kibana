/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from '@kbn/zod/v4';
import { appendPanelsToDashboard } from '../dashboard_state';
import { defineOperation } from './types';
import { addPanelsItemSchema } from './panels';
import { createPanelInputMaterializer } from './panel_creation';

export const addPanelsOperation = defineOperation({
  schema: z.object({
    operation: z.literal('add_panels'),
    panels: z.array(addPanelsItemSchema).min(1),
  }),
  handler: ({ dashboardData, operation, operationIndex, context }) => {
    const materializePanelInput = createPanelInputMaterializer({
      resolvedPanelCreationRequests: context.resolvedPanelCreationRequests,
      operationIndex,
      operationType: operation.operation,
      failures: context.failures,
    });

    let nextDashboardData = dashboardData;

    for (const [panelInputIndex, item] of operation.panels.entries()) {
      const panelContent = materializePanelInput(item, panelInputIndex);
      if (panelContent === undefined) {
        continue;
      }

      nextDashboardData = appendPanelsToDashboard({
        dashboardData: nextDashboardData,
        panelsToAdd: [{ id: uuidv4(), ...panelContent, grid: item.grid }],
        sectionId: item.sectionId,
      });
    }

    return nextDashboardData;
  },
});
