/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import type { DashboardSection } from '@kbn/as-code-dashboard-schema';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { DashboardChildState, DashboardLayout } from './types';

export function serializeLayout(
  layout: DashboardLayout,
  childState: DashboardChildState
): Pick<DashboardState, 'panels' | 'pinned_panels'> {
  const sections: { [sectionId: string]: DashboardSection } = {};
  Object.entries(layout.sections).forEach(([sectionId, sectionState]) => {
    sections[sectionId] = { ...sectionState, id: sectionId, panels: [] };
  });

  const panels: DashboardState['panels'] = [];
  Object.entries(layout.panels).forEach(([panelId, { grid, type }]) => {
    const config = childState[panelId] ?? {};

    const { sectionId, ...restOfGridData } = grid; // drop section ID
    const panelState = {
      type,
      grid: restOfGridData,
      id: panelId,
      config,
    };

    if (sectionId) {
      sections[sectionId].panels.push(panelState);
    } else {
      panels.push(panelState);
    }
  });

  return {
    panels: [...panels, ...Object.values(sections)],
    pinned_panels: Object.entries(layout.pinnedPanels)
      .sort(([, { order: orderA }], [, { order: orderB }]) => orderA - orderB)
      .map(([id, panel]) => {
        return {
          id,
          ...omit(panel, 'order'),
          config: childState[id],
        } as Required<DashboardState>['pinned_panels'][number];
      }),
  };
}
