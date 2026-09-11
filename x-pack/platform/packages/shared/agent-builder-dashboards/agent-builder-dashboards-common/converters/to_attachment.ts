/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DashboardPanel,
  DashboardSection,
  DashboardState,
} from '@kbn/as-code-dashboard-schema';
import { LensConfigBuilder, type LensAttributes } from '@kbn/lens-embeddable-utils';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import {
  extractVegaSpecFromSavedVis,
  VEGA_VIS_TYPE,
} from '@kbn/agent-builder-visualizations-common';
import type { AttachmentPanel, DashboardSection as DashboardAttachmentSection } from '../types';
import type { DashboardAttachmentData } from '../types';

/**
 * Type guard to check if attributes are in LensAttributes format (internal).
 * LensAttributes have a `visualizationType` property, while LensApiSchemaType does not.
 */
export const isLensAttributesPanel = (
  panel: DashboardPanel
): panel is DashboardPanel & { config: { attributes: LensAttributes } } => {
  const attributes =
    panel.config && typeof panel.config === 'object' && 'attributes' in panel.config
      ? panel.config.attributes
      : undefined;

  return (
    panel.type === LENS_EMBEDDABLE_TYPE &&
    typeof attributes === 'object' &&
    attributes !== null &&
    'visualizationType' in attributes
  );
};

/**
 * Converts a DashboardPanel to an AttachmentPanel.
 * For Lens panels with internal attributes format, converts to API format.
 */
export const toAttachmentPanel = (panel: DashboardPanel): AttachmentPanel | undefined => {
  // Normalize a by-value legacy-vis (`visualization`) Vega panel to the future
  // native `vega` API shape (`config.spec`). Temporary bridge that pairs with the
  // expansion in `from_attachment`; remove once the native vega API ships.
  // Panel-level settings (title, description, hide_*, drilldowns, …) live beside
  // `savedVis` and must be preserved — same pattern as Lens below.
  if (panel.type === VISUALIZE_EMBEDDABLE_TYPE) {
    const vega = extractVegaSpecFromSavedVis(panel.config);
    if (vega) {
      const { savedVis: _savedVis, ...restConfig } = (panel.config ?? {}) as {
        savedVis?: unknown;
      } & Record<string, unknown>;
      return {
        type: VEGA_VIS_TYPE,
        id: panel.id ?? '',
        config: {
          ...restConfig,
          spec: vega.spec,
          // Prefer panel-level title/description (manual edits); fall back to savedVis.
          title: typeof restConfig.title === 'string' ? restConfig.title : vega.title,
          description:
            typeof restConfig.description === 'string' ? restConfig.description : vega.description,
        },
        grid: panel.grid,
      };
    }
  }

  if (isLensAttributesPanel(panel)) {
    const { attributes, ...restConfig } = panel.config;
    try {
      // Match Lens `transform_out`: panel-level title/description take precedence;
      // attributes title/description are only a legacy fallback when the panel has none.
      // Spreading `toAPIFormat` after `restConfig` would overwrite manual panel edits.
      const {
        title: attributesTitle,
        description: attributesDescription,
        ...apiConfig
      } = new LensConfigBuilder().toAPIFormat(attributes);

      const titleFallback =
        !('title' in restConfig) && attributesTitle ? { title: attributesTitle } : {};
      const descriptionFallback =
        !('description' in restConfig) && attributesDescription
          ? { description: attributesDescription }
          : {};

      return {
        type: LENS_EMBEDDABLE_TYPE,
        id: panel.id ?? '',
        config: {
          ...titleFallback,
          ...descriptionFallback,
          ...restConfig,
          ...apiConfig,
        },
        grid: panel.grid,
      };
    } catch {
      // fall through to generic storage when the Lens attributes cannot be converted to API format
    }
  }

  return {
    type: panel.type,
    id: panel.id ?? '',
    config: panel.config,
    grid: panel.grid,
  };
};

/**
 * Converts a DashboardSection to a DashboardAttachmentSection.
 */
export const toAttachmentSection = (section: DashboardSection): DashboardAttachmentSection => ({
  id: section.id ?? '',
  title: section.title,
  collapsed: section.collapsed ?? false,
  grid: { y: section.grid.y },
  panels: section.panels
    .map(toAttachmentPanel)
    .filter((panel): panel is AttachmentPanel => panel !== undefined),
});

/**
 * Converts a DashboardPanel or DashboardSection to the corresponding attachment type.
 */
export const toAttachmentWidget = (
  widget: DashboardPanel | DashboardSection
): DashboardAttachmentData['panels'][number] | undefined => {
  if ('panels' in widget) {
    return toAttachmentSection(widget);
  }

  return toAttachmentPanel(widget);
};

/**
 * Converts a DashboardState to DashboardAttachmentData.
 * Preserves all dashboard state fields for full round-trip support.
 */
export const dashboardStateToAttachmentData = (state: DashboardState): DashboardAttachmentData => {
  return {
    ...state,
    panels: state.panels
      .map(toAttachmentWidget)
      .filter(
        (widget): widget is DashboardAttachmentData['panels'][number] => widget !== undefined
      ),

    filters: state.filters as DashboardAttachmentData['filters'],
    pinned_panels: state.pinned_panels as DashboardAttachmentData['pinned_panels'],
    access_control: state.access_control as DashboardAttachmentData['access_control'],
  };
};
