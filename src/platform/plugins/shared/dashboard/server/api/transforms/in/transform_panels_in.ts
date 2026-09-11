/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';

import { z } from '@kbn/zod';
import type { SavedObjectReference } from '@kbn/core/server';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type {
  DashboardState,
  DashboardPanel,
  DashboardSection,
} from '@kbn/as-code-dashboard-schema';
import { isDashboardSection, prefixReferencesFromPanel } from '../../../../common';
import type {
  DashboardSavedObjectAttributes,
  SavedDashboardPanel,
  SavedDashboardSection,
} from '../../../dashboard_saved_object';
import { embeddableService } from '../../../kibana_services';
import { TransformPanelsInError, TransformPanelInError } from './transform_panels_in_error';

export function transformPanelsIn(
  widgets: Required<DashboardState>['panels'],
  isDashboardAppRequest: boolean = false
): {
  panelsJSON: DashboardSavedObjectAttributes['panelsJSON'];
  sections: DashboardSavedObjectAttributes['sections'];
  references: SavedObjectReference[];
} {
  const panelErrors: TransformPanelInError[] = [];
  const panels: SavedDashboardPanel[] = [];
  const sections: SavedDashboardSection[] = [];
  const panelReferences: SavedObjectReference[] = [];

  widgets.forEach((widget) => {
    if (isDashboardSection(widget)) {
      const { panels: sectionPanels, grid, id, ...restOfSection } = widget as DashboardSection;
      const idx = id ?? uuidv4();
      sections.push({ ...restOfSection, gridData: { ...grid, i: idx } });
      sectionPanels.forEach((panel) => {
        try {
          const { storedPanel, references } = transformPanelIn(panel, isDashboardAppRequest);
          panels.push({
            ...storedPanel,
            gridData: { ...storedPanel.gridData, sectionId: idx },
          });
          panelReferences.push(...references);
        } catch (e) {
          panelErrors.push(new TransformPanelInError(e.message, panel.type, panel.config));
        }
      });
    } else {
      // widget is a panel
      try {
        const { storedPanel, references } = transformPanelIn(widget, isDashboardAppRequest);
        panels.push(storedPanel);
        panelReferences.push(...references);
      } catch (e) {
        panelErrors.push(new TransformPanelInError(e.message, widget.type, widget.config));
      }
    }
  });

  if (panelErrors.length) {
    throw new TransformPanelsInError(
      `Unable to transform ${panelErrors.length} panels`,
      panelErrors
    );
  }
  return { panelsJSON: JSON.stringify(panels), sections, references: panelReferences };
}

function transformPanelIn(
  panel: DashboardPanel,
  isDashboardAppRequest: boolean
): {
  storedPanel: SavedDashboardPanel;
  references: SavedObjectReference[];
} {
  const { id, grid, config, ...restPanel } = panel;
  const idx = id ?? uuidv4();

  // Temporary escape hatch for lens as code
  // TODO remove when lens as code transforms are ready for production
  const transformType =
    panel.type === LENS_EMBEDDABLE_TYPE && isDashboardAppRequest
      ? 'lens-dashboard-app'
      : panel.type;
  const transforms = embeddableService?.getTransforms(transformType);

  // Dashboard application routes do not validate panel.config at route level
  // Instead, panel.config must be validated in the handler
  const panelSchema = transforms?.schema;
  if (isDashboardAppRequest && panelSchema) {
    const result = panelSchema.safeParse(config);
    if (!result.success) {
      const message = z.prettifyError(result.error);
      throw new Error(`Validation error: ${message}`);
    }
  }

  let transformedPanelConfig = config;
  let references: undefined | SavedObjectReference[];
  try {
    if (transforms?.transformIn) {
      const transformed = transforms.transformIn(config);
      transformedPanelConfig = transformed.state as Record<string, unknown>;
      references = transformed.references;
    }
  } catch (transformInError) {
    throw new Error(`Transform error: ${transformInError.message}`);
  }

  return {
    storedPanel: {
      ...restPanel,
      embeddableConfig: transformedPanelConfig as SavedDashboardPanel['embeddableConfig'],
      panelIndex: idx,
      gridData: {
        ...grid,
        i: idx,
      },
    },
    references: prefixReferencesFromPanel(idx, references ?? []),
  };
}
