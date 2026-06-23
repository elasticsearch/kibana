/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { sectionGridSchema } from '@kbn/agent-builder-dashboards-common';
import type { AttachmentPanel, DashboardSection } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import { createPanelInputMaterializer } from './panel_creation';
import { defineOperation } from './types';
import { addSectionPanelItemSchema } from './panels';

export const addSectionOperation = defineOperation({
  schema: z.object({
    operation: z.literal('add_section'),
    title: z.string().max(256).describe('Section title.'),
    grid: sectionGridSchema,
    panels: z
      .array(addSectionPanelItemSchema)
      .min(1)
      .optional()
      .describe(
        'Optional inline panels (source: "config" or source: "request") to create inside the new section. Panel grids are section-relative.'
      ),
  }),
  handler: ({ dashboardData, operation, operationIndex, context }) => {
    let nextSection: DashboardSection = {
      id: uuidv4(),
      title: operation.title,
      collapsed: false,
      grid: operation.grid,
      panels: [],
    };

    if (operation.panels) {
      const materializePanelInput = createPanelInputMaterializer({
        resolvedPanelCreationRequests: context.resolvedPanelCreationRequests,
        operationIndex,
        operationType: operation.operation,
        failures: context.failures,
      });

      const sectionPanels: AttachmentPanel[] = [];

      for (const [panelInputIndex, item] of operation.panels.entries()) {
        const panelContent = materializePanelInput(item, panelInputIndex);
        if (panelContent === undefined) {
          continue;
        }

        sectionPanels.push({ id: uuidv4(), ...panelContent, grid: item.grid });
      }

      nextSection = {
        ...nextSection,
        panels: sectionPanels,
      };
    }

    return {
      ...dashboardData,
      panels: [...dashboardData.panels, nextSection],
    };
  },
});
