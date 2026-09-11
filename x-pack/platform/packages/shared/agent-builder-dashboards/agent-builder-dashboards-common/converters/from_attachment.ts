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
import { isLensAPIFormat, LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import { buildVegaSavedVis, VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import type {
  AttachmentPanel,
  DashboardSection as AgentDashboardSection,
  DashboardAttachmentData,
} from '../types';
import { isSection } from '../types';
import { EMPTY_DASHBOARD_STATE } from '../dashboard_state_helpers';

/**
 * Converts an AttachmentPanel to a DashboardPanel.
 * - Lens panels with API-format attributes are converted to internal format.
 * - `vega` panels (the future native API shape, `config.spec`) are expanded to a
 *   by-value legacy-vis (`visualization`) embeddable for rendering. This is a
 *   temporary bridge: once the native `vega` embeddable API ships, the panel can
 *   be passed through unchanged and this branch removed.
 */
const buildPanelFromConfig = ({ config, type, id, grid }: AttachmentPanel): DashboardPanel => {
  if (type === VEGA_VIS_TYPE) {
    const { spec, title, description, ...restConfig } = config as {
      spec?: unknown;
      title?: unknown;
      description?: unknown;
    } & Record<string, unknown>;
    const panelTitle = typeof title === 'string' ? title : '';
    const panelDescription = typeof description === 'string' ? description : '';
    return {
      type: VISUALIZE_EMBEDDABLE_TYPE,
      id,
      grid,
      config: {
        // Preserve panel-level settings (hide_title, hide_border, drilldowns, …).
        ...restConfig,
        ...(typeof title === 'string' ? { title: panelTitle } : {}),
        ...(typeof description === 'string' ? { description: panelDescription } : {}),
        savedVis: buildVegaSavedVis({
          spec: typeof spec === 'string' ? spec : '',
          title: panelTitle,
          description: panelDescription,
        }),
      },
    };
  }

  let configObject = config;
  if (type === LENS_EMBEDDABLE_TYPE && isLensAPIFormat(config)) {
    const lensAttributes = new LensConfigBuilder().fromAPIFormat(config);
    configObject = {
      ...config,
      attributes: lensAttributes,
    };
  }
  return {
    type,
    id,
    grid,
    config: configObject,
  };
};

type AgentWidget = AttachmentPanel | AgentDashboardSection;
type DashboardWidget = DashboardPanel | DashboardSection;

/**
 * Converts an AgentDashboardSection to a DashboardSection.
 */
const normalizeSection = (section: AgentDashboardSection): DashboardSection => ({
  id: section.id,
  title: section.title,
  collapsed: section.collapsed,
  grid: { y: section.grid.y },
  panels: section.panels.map(buildPanelFromConfig),
});

/**
 * Converts an array of attachment widgets to dashboard widgets.
 */
const normalizeWidgets = (widgets: AgentWidget[]): DashboardWidget[] =>
  (widgets ?? []).map((widget) =>
    isSection(widget) ? normalizeSection(widget) : buildPanelFromConfig(widget)
  );

/**
 * Converts a DashboardAttachment to a DashboardState.
 * Uses provided values from the attachment, falling back to defaults for missing fields.
 */
export const attachmentDataToDashboardState = ({
  panels = [],
  filters,
  query,
  pinned_panels,
  access_control,
  options,
  ...rest
}: DashboardAttachmentData): DashboardState => ({
  ...EMPTY_DASHBOARD_STATE,
  ...rest,
  options: {
    ...EMPTY_DASHBOARD_STATE.options,
    ...options,
  },
  panels: normalizeWidgets(panels),
  ...(filters && { filters: filters as DashboardState['filters'] }),
  ...(query && { query: query as DashboardState['query'] }),
  ...(pinned_panels && { pinned_panels: pinned_panels as DashboardState['pinned_panels'] }),
  ...(access_control && { access_control: access_control as DashboardState['access_control'] }),
});
