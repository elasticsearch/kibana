/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AttachmentPanel,
  DashboardAttachmentData,
  DashboardSection,
} from '@kbn/agent-builder-dashboards-common';
import { isSection } from '@kbn/agent-builder-dashboards-common';

type DashboardWidget = AttachmentPanel | DashboardSection;

export const indexPanelsById = (
  widgets: DashboardAttachmentData['panels']
): Map<string, AttachmentPanel> => {
  const index = new Map<string, AttachmentPanel>();
  for (const widget of widgets) {
    if (isSection(widget)) {
      for (const sectionPanel of widget.panels) {
        index.set(sectionPanel.id, sectionPanel);
      }
      continue;
    }

    index.set(widget.id, widget);
  }
  return index;
};

/**
 * Returns the lowest occupied y-position across top-level panels and section contents.
 */
export const getWidgetsBottomY = (widgets: DashboardWidget[]): number => {
  return widgets.reduce((maxY, widget) => {
    if (isSection(widget)) {
      const sectionBottom = widget.panels.reduce(
        (sectionMaxY, panel) => Math.max(sectionMaxY, widget.grid.y + panel.grid.y + panel.grid.h),
        widget.grid.y
      );
      return Math.max(maxY, sectionBottom);
    }

    return Math.max(maxY, widget.grid.y + widget.grid.h);
  }, 0);
};

export const findSectionIndex = (panels: DashboardWidget[], sectionId: string): number => {
  return panels.findIndex((widget) => isSection(widget) && widget.id === sectionId);
};

export const appendPanelsToDashboard = ({
  dashboardData,
  panelsToAdd,
  sectionId,
}: {
  dashboardData: DashboardAttachmentData;
  panelsToAdd: AttachmentPanel[];
  sectionId?: string;
}): DashboardAttachmentData => {
  if (panelsToAdd.length === 0) {
    return dashboardData;
  }

  if (!sectionId) {
    return {
      ...dashboardData,
      panels: [...dashboardData.panels, ...panelsToAdd],
    };
  }

  const sectionIndex = findSectionIndex(dashboardData.panels, sectionId);
  if (sectionIndex === -1) {
    throw new Error(`Section "${sectionId}" not found.`);
  }

  return {
    ...dashboardData,
    panels: dashboardData.panels.map((widget) => {
      if (!isSection(widget) || widget.id !== sectionId) {
        return widget;
      }

      return {
        ...widget,
        panels: [...widget.panels, ...panelsToAdd],
      };
    }),
  };
};

/**
 * Immutably updates a panel by id whether it lives at the top level or inside a section.
 * Returns the updated dashboard data together with a flag indicating whether a panel matched.
 */
export const updatePanelInDashboard = ({
  dashboardData,
  panelId,
  transformPanel,
}: {
  dashboardData: DashboardAttachmentData;
  panelId: string;
  transformPanel: (panel: AttachmentPanel) => AttachmentPanel;
}): { dashboardData: DashboardAttachmentData; updated: boolean } => {
  let updated = false;

  const panels = dashboardData.panels.map((widget) => {
    if (isSection(widget)) {
      let sectionUpdated = false;
      const nextSectionPanels = widget.panels.map((panel) => {
        if (panel.id !== panelId) {
          return panel;
        }

        updated = true;
        sectionUpdated = true;
        return transformPanel(panel);
      });

      return sectionUpdated ? { ...widget, panels: nextSectionPanels } : widget;
    }

    if (widget.id !== panelId) {
      return widget;
    }

    updated = true;
    return transformPanel(widget);
  });

  return {
    dashboardData: updated ? { ...dashboardData, panels } : dashboardData,
    updated,
  };
};

export const removePanelsFromDashboard = ({
  dashboardData,
  panelIdsToRemove,
}: {
  dashboardData: DashboardAttachmentData;
  panelIdsToRemove: string[];
}): {
  dashboardData: DashboardAttachmentData;
  removedPanels: AttachmentPanel[];
} => {
  const panelIdsToRemoveSet = new Set(panelIdsToRemove);
  const removedPanels: AttachmentPanel[] = [];
  const nextPanels: DashboardWidget[] = [];

  for (const widget of dashboardData.panels) {
    if (isSection(widget)) {
      const sectionPanelsToKeep: AttachmentPanel[] = [];
      for (const panel of widget.panels) {
        if (panelIdsToRemoveSet.has(panel.id)) {
          removedPanels.push(panel);
        } else {
          sectionPanelsToKeep.push(panel);
        }
      }
      nextPanels.push({ ...widget, panels: sectionPanelsToKeep });
      continue;
    }

    if (panelIdsToRemoveSet.has(widget.id)) {
      removedPanels.push(widget);
    } else {
      nextPanels.push(widget);
    }
  }

  return {
    dashboardData: {
      ...dashboardData,
      panels: nextPanels,
    },
    removedPanels,
  };
};
