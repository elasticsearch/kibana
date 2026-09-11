/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 } from 'uuid';
import type { DashboardPanel } from '@kbn/as-code-dashboard-schema';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { isDashboardSection } from '../../../common';
import type { DashboardChildState, DashboardLayout } from './types';

export function deserializeLayout(
  panels: DashboardState['panels'],
  pinnedPanels: DashboardState['pinned_panels']
) {
  const childState: DashboardChildState = {};
  const layout: DashboardLayout = {
    panels: {},
    sections: {},
    pinnedPanels: (pinnedPanels ?? []).reduce((prev, panel, index) => {
      const panelId = panel.id ?? v4();
      const { width, grow, type, config } = panel;
      childState[panelId] = config; // push to child state
      return { ...prev, [panelId]: { type, width, grow, order: index } };
    }, {}),
  };

  function pushPanel(panel: DashboardPanel, sectionId?: string) {
    const panelId = panel.id ?? v4();
    layout.panels[panelId] = {
      type: panel.type,
      grid: {
        ...panel.grid,
        ...(sectionId && { sectionId }),
      },
    };
    childState[panelId] = {
      ...panel.config,
    };
  }

  panels?.forEach((widget) => {
    if (isDashboardSection(widget)) {
      const { panels: sectionPanels, id, ...restOfSection } = widget;
      const sectionId = id ?? v4();
      layout.sections[sectionId] = restOfSection;
      sectionPanels.forEach((panel) => {
        pushPanel(panel, sectionId);
      });
    } else {
      // if not a section, then this widget is a panel
      pushPanel(widget);
    }
  });
  return { layout, childState };
}
