/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup } from '@kbn/core/public';
import type { UiActionsSetup } from '@kbn/ui-actions-plugin/public';
import {
  ADD_PANEL_TRIGGER,
  CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER,
  ON_OPEN_PANEL_MENU,
  EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER,
  SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER,
  SWIM_LANE_SELECTION_TRIGGER,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import { UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import type { MlPluginStart, MlStartDependencies } from '../plugin';
import { CONTROLLED_BY_SINGLE_METRIC_VIEWER_FILTER } from './constants';
/**
 * Register ML UI actions
 */
export function registerMlUiActions(
  uiActions: UiActionsSetup,
  core: CoreSetup<MlStartDependencies, MlPluginStart>
) {
  // Assign triggers
  uiActions.addTriggerActionAsync(ADD_PANEL_TRIGGER, 'create-single-metric-viewer', async () => {
    const { createAddSingleMetricViewerPanelAction } = await import('./async_module');
    return createAddSingleMetricViewerPanelAction(core.getStartServices);
  });
  uiActions.addTriggerActionAsync(ADD_PANEL_TRIGGER, 'create-anomaly-swimlane', async () => {
    const { createAddSwimlanePanelAction } = await import('./async_module');
    return createAddSwimlanePanelAction(core.getStartServices);
  });
  uiActions.addTriggerActionAsync(ADD_PANEL_TRIGGER, 'create-anomaly-charts', async () => {
    const { createAddAnomalyChartsPanelAction } = await import('./async_module');
    return createAddAnomalyChartsPanelAction(core.getStartServices);
  });

  uiActions.addTriggerActionAsync(ON_OPEN_PANEL_MENU, 'open-in-anomaly-explorer', async () => {
    const { createOpenInExplorerAction } = await import('./async_module');
    return createOpenInExplorerAction(core.getStartServices);
  });
  uiActions.addTriggerActionAsync(ON_OPEN_PANEL_MENU, 'open-in-single-metric-viewer', async () => {
    const { createOpenInSingleMetricViewerAction } = await import('./async_module');
    return createOpenInSingleMetricViewerAction(core.getStartServices);
  });

  uiActions.addTriggerActionAsync(
    SWIM_LANE_SELECTION_TRIGGER,
    'apply-to-current-view',
    async () => {
      const { createApplyInfluencerFiltersAction } = await import('./async_module');
      return createApplyInfluencerFiltersAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    SWIM_LANE_SELECTION_TRIGGER,
    'apply-time-range-selection',
    async () => {
      const { createApplyTimeRangeSelectionAction } = await import('./async_module');
      return createApplyTimeRangeSelectionAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    SWIM_LANE_SELECTION_TRIGGER,
    'open-in-anomaly-explorer',
    async () => {
      const { createOpenInExplorerAction } = await import('./async_module');
      return createOpenInExplorerAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    SWIM_LANE_SELECTION_TRIGGER,
    'open-in-single-metric-viewer',
    async () => {
      const { createOpenInSingleMetricViewerAction } = await import('./async_module');
      return createOpenInSingleMetricViewerAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    SWIM_LANE_SELECTION_TRIGGER,
    'clear-selection-action',
    async () => {
      const { createClearSelectionAction } = await import('./async_module');
      return createClearSelectionAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER,
    'apply-entity-field-filters',
    async () => {
      const { createApplyEntityFieldFiltersAction } = await import('./async_module');
      return createApplyEntityFieldFiltersAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER,
    'smv-apply-entity-field-filters',
    async () => {
      const { createApplyEntityFieldFiltersAction } = await import('./async_module');
      return createApplyEntityFieldFiltersAction(
        core.getStartServices,
        CONTROLLED_BY_SINGLE_METRIC_VIEWER_FILTER
      );
    }
  );
  uiActions.addTriggerActionAsync(ON_OPEN_PANEL_MENU, 'create-ml-ad-job-action', async () => {
    const { createVisToADJobAction } = await import('./async_module');
    return createVisToADJobAction(core.getStartServices);
  });
  uiActions.addTriggerActionAsync(
    CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER,
    'create-ml-categorization-ad-job-action',
    async () => {
      const { createCategorizationADJobAction } = await import('./async_module');
      return createCategorizationADJobAction(core.getStartServices);
    }
  );
  uiActions.addTriggerActionAsync(
    UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER,
    'update-ad-jobs-project-routing-action',
    async () => {
      const { updateADJobsProjectRouting } = await import('./async_module');
      return updateADJobsProjectRouting(core.getStartServices);
    }
  );
}
