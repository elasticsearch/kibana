/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { flow } from 'lodash';

import type { SavedObjectReference } from '@kbn/core/server';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import { ZodError } from '@kbn/zod';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import type {
  DashboardPanel,
  DashboardSection,
  DashboardState,
} from '@kbn/as-code-dashboard-schema';
import type { SavedDashboardPanel, SavedDashboardSection } from '../../../dashboard_saved_object';
import { embeddableService, logger } from '../../../kibana_services';
import type { Warnings } from '../../types';
import { getPanelReferences } from './get_panel_references';
import { panelBwc } from './panel_bwc';

export function transformPanelsOut(
  panelsJSON: string = '[]',
  sections: SavedDashboardSection[] = [],
  containerReferences: SavedObjectReference[] = [],
  isDashboardAppRequest: boolean = false
): { panels: DashboardState['panels']; warnings: Warnings } {
  const topLevelPanels: DashboardPanel[] = [];
  const warnings: Warnings = [];
  const sectionsMap: { [uuid: string]: DashboardSection } = {};
  sections.forEach((section) => {
    const { gridData: grid, ...restOfSection } = section;
    const { i: sectionId, ...restOfGrid } = grid;
    sectionsMap[sectionId] = {
      ...restOfSection,
      collapsed: restOfSection.collapsed ?? false,
      grid: restOfGrid,
      panels: [],
      id: sectionId,
    };
  });

  let parsedPanels;
  try {
    parsedPanels = JSON.parse(panelsJSON);
  } catch (parseError) {
    logger.warn(`Unable to parse panelsJSON. Error: ${parseError.message}`);
    return { panels: [], warnings };
  }

  parsedPanels.forEach((storedPanel: SavedDashboardPanel) => {
    const storedPanelReferences = getPanelReferences(containerReferences ?? [], storedPanel);
    const { sectionId } = storedPanel.gridData;
    const { panel, panelReferences } = panelBwc(storedPanel, storedPanelReferences ?? []);
    let panelProperties: DashboardPanel;
    try {
      panelProperties = transformPanel(
        panel,
        panelReferences,
        containerReferences,
        isDashboardAppRequest
      );
    } catch (err) {
      let message = err.message;
      if (err instanceof ZodError) {
        message = stringifyZodError(err);
      }
      warnings.push({
        type: 'dropped_panel',
        panel_type: panel.type,
        panel_config: panel.embeddableConfig,
        panel_references: panelReferences,
        message: `Unable to transform panel config. Error: ${message}`,
      });
      return;
    }

    if (sectionId) {
      if (!sectionsMap[sectionId]) {
        warnings.push({
          type: 'dropped_panel',
          panel_type: panelProperties.type,
          panel_config: panelProperties.config,
          message: `Panel references non-existent section '${sectionId}'`,
        });
        return;
      }
      sectionsMap[sectionId].panels.push(panelProperties);
    } else {
      topLevelPanels.push(panelProperties);
    }
  });

  return {
    panels: [...topLevelPanels, ...Object.values(sectionsMap)],
    warnings,
  };
}

const defaultTransform = (
  config: SavedDashboardPanel['embeddableConfig']
): SavedDashboardPanel['embeddableConfig'] => {
  const transformsFlow = flow(transformTitlesOut, transformTimeRangeOut);
  return transformsFlow(config);
};

function transformPanel(
  panel: SavedDashboardPanel,
  panelReferences: SavedObjectReference[],
  containerReferences: SavedObjectReference[] = [],
  isDashboardAppRequest: boolean = false
) {
  const { embeddableConfig, gridData, panelIndex, type } = panel;

  const { sectionId, i, ...restOfGrid } = gridData;

  // Temporary escape hatch for lens as code
  // TODO remove when lens as code transforms are ready for production
  const transformType =
    type === LENS_EMBEDDABLE_TYPE && isDashboardAppRequest ? 'lens-dashboard-app' : type;

  const transforms = embeddableService?.getTransforms(transformType);
  let transformedPanelConfig =
    transforms?.transformOut?.(embeddableConfig, panelReferences, containerReferences, undefined) ??
    defaultTransform(embeddableConfig);

  if (transforms?.schema) {
    transformedPanelConfig = transforms.schema.parse(transformedPanelConfig);
  }

  return {
    grid: restOfGrid,
    config: transformedPanelConfig,
    id: panelIndex,
    type,
  };
}
