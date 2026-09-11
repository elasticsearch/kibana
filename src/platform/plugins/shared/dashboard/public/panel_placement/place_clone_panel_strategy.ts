/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { PanelNotFoundError } from '@kbn/embeddable-plugin/public';
import { cloneDeep, forOwn } from 'lodash';

import type { GridData } from '@kbn/as-code-dashboard-schema';
import { DASHBOARD_GRID_COLUMN_COUNT } from '../../common/page_bundle_constants';
import type { PanelPlacementProps, PanelPlacementReturn } from './types';
import type { DashboardLayoutPanel } from '../dashboard_api/layout_manager';

interface IplacementDirection {
  grid: Omit<GridData, 'i'>;
  fits: boolean;
}

/**
 * Compare grid data by an ending y coordinate. Grid data with a smaller ending y coordinate
 * comes first.
 * @param a
 * @param b
 */
function comparePanels(a: GridData, b: GridData): number {
  if (a.y + a.h < b.y + b.h) {
    return -1;
  }
  if (a.y + a.h > b.y + b.h) {
    return 1;
  }
  // a.y === b.y
  if (a.x + a.w <= b.x + b.w) {
    return -1;
  }
  return 1;
}

export function placeClonePanel({
  currentLayout,
  newPanel,
  placeBesideId,
}: PanelPlacementProps & { placeBesideId: string }): PanelPlacementReturn {
  const panelToPlaceBeside = currentLayout.panels[placeBesideId];
  if (!panelToPlaceBeside) {
    throw new PanelNotFoundError();
  }
  const { w: width, h: height, sectionId: newPanelSectionId } = newPanel.grid;
  const beside = { ...panelToPlaceBeside.grid, panelId: placeBesideId };
  const otherPanelGridData: Array<GridData & { panelId: string }> = [];
  forOwn(currentLayout.panels, (panel: DashboardLayoutPanel, panelId: string) => {
    if (panel.grid.sectionId === newPanelSectionId) {
      // only check against panels that are in the same section as the cloned panel
      otherPanelGridData.push({ ...panel.grid, panelId });
    }
  });

  const possiblePlacementDirections: IplacementDirection[] = [
    { grid: { x: beside.x + beside.w, y: beside.y, w: width, h: height }, fits: true }, // right
    { grid: { x: 0, y: beside.y + beside.h, w: width, h: height }, fits: true }, // left side of next row
    { grid: { x: beside.x, y: beside.y + beside.h, w: width, h: height }, fits: true }, // bottom
  ];

  // first, we check if there is place around the current panel
  for (const direction of possiblePlacementDirections) {
    if (
      direction.grid.x >= 0 &&
      direction.grid.x + direction.grid.w <= DASHBOARD_GRID_COLUMN_COUNT &&
      direction.grid.y >= 0
    ) {
      const intersection = otherPanelGridData.some((currentPanelGrid: GridData) => {
        return (
          direction.grid.x + direction.grid.w > currentPanelGrid.x &&
          direction.grid.x < currentPanelGrid.x + currentPanelGrid.w &&
          direction.grid.y < currentPanelGrid.y + currentPanelGrid.h &&
          direction.grid.y + direction.grid.h > currentPanelGrid.y
        );
      });
      if (!intersection) {
        return {
          ...currentLayout,
          panels: {
            ...currentLayout.panels,
            [newPanel.uuid]: { type: newPanel.type, grid: { ...newPanel.grid, ...direction.grid } },
          },
        };
      }
    } else {
      direction.fits = false;
    }
  }
  // if we get here that means there is no blank space around the panel we are placing beside. This means it's time to mess up the dashboard's groove. Fun!
  /**
   * 1. sort the panels in the grid
   * 2. place the cloned panel to the bottom
   * 3. reposition the panels after the cloned panel in the grid
   */
  const otherPanels = { ...currentLayout.panels };
  const sortedGrid = otherPanelGridData.sort(comparePanels);

  let position = 0;
  for (position; position < sortedGrid.length; position++) {
    if (beside.panelId === sortedGrid[position].panelId) {
      break;
    }
  }
  const bottomPlacement = possiblePlacementDirections[2];
  // place to the bottom and move all other panels
  let originalPositionInTheGrid = sortedGrid[position + 1].panelId;
  const diff =
    bottomPlacement.grid.y + bottomPlacement.grid.h - otherPanels[originalPositionInTheGrid].grid.y;

  for (let j = position + 1; j < sortedGrid.length; j++) {
    originalPositionInTheGrid = sortedGrid[j].panelId;
    const { grid, ...movedPanel } = cloneDeep(otherPanels[originalPositionInTheGrid]);
    if (grid.sectionId === newPanelSectionId) {
      // only move panels in the cloned panel's section
      const newGridData = { ...grid, y: grid.y + diff };
      otherPanels[originalPositionInTheGrid] = { ...movedPanel, grid: newGridData };
    }
  }

  return {
    ...currentLayout,
    panels: {
      ...currentLayout.panels,
      [newPanel.uuid]: { type: newPanel.type, grid: bottomPlacement.grid },
    },
  };
}
