/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  DashboardPanel,
  DashboardState,
  DashboardPinnedPanel,
} from '@kbn/as-code-dashboard-schema';
import { isDashboardSection } from '../../common';
import { embeddableService } from '../kibana_services';
import type { Warnings } from './types';

export function stripUnmappedKeys(dashboardState: Partial<DashboardState>) {
  const warnings: Warnings = [];
  const { pinned_panels, panels, ...rest } = dashboardState;

  function isMappedPanelType(panel: DashboardPanel | DashboardPinnedPanel) {
    const transforms = embeddableService?.getTransforms(panel.type);
    if (transforms?.throwOnUnmappedPanel) {
      try {
        transforms.throwOnUnmappedPanel(panel.config);
      } catch (e) {
        warnings.push({
          type: 'dropped_panel',
          message: e.message,
          panel_type: panel.type,
          panel_config: panel.config,
        });
        return false;
      }
    }

    const panelSchema = transforms?.schema;

    if (!panelSchema) {
      warnings.push({
        type: 'dropped_panel',
        message: `Panel schema not available for panel type: ${panel.type}. Panels without schemas are not supported by dashboard REST endpoints`,
        panel_type: panel.type,
        panel_config: panel.config,
      });
    }
    return Boolean(panelSchema);
  }

  const mappedPanels = (panels ?? [])
    .filter((panel) => isDashboardSection(panel) || isMappedPanelType(panel))
    .map((panel) => {
      if (!isDashboardSection(panel)) return panel;
      const { panels: sectionPanels, ...restOfSection } = panel;
      return {
        ...restOfSection,
        panels: sectionPanels.filter(isMappedPanelType),
      };
    });

  const mappedPinnedPanels = (pinned_panels ?? []).filter(isMappedPanelType);

  return {
    data: {
      ...rest,
      panels: mappedPanels,
      ...(pinned_panels && { pinned_panels: mappedPinnedPanels }),
    } as DashboardState,
    warnings,
  };
}
