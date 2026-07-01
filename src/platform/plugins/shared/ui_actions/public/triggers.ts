/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import {
  ON_CLICK_VALUE,
  ON_CLICK_IMAGE,
  ON_CLICK_ROW,
  ON_SELECT_RANGE,
  ON_APPLY_FILTER,
  ON_OPEN_PANEL_MENU,
  ADD_PANEL_TRIGGER,
  ALERT_RULE_TRIGGER,
  VISUALIZE_FIELD_TRIGGER,
  VISUALIZE_GEO_FIELD_TRIGGER,
  CONTROL_HOVER_TRIGGER_ID,
  CONTROL_MENU_TRIGGER,
  EDIT_LOOKUP_INDEX_CONTENT_TRIGGER_ID,
  SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID,
  DISCOVER_CELL_ACTIONS_TRIGGER_ID,
  PANEL_BADGE_TRIGGER,
  PANEL_NOTIFICATION_TRIGGER,
  MULTI_VALUE_CLICK_TRIGGER,
  CELL_VALUE_TRIGGER,
  ESQL_CONTROL_TRIGGER,
  UPDATE_ESQL_QUERY_TRIGGER,
  UPDATE_FILTER_REFERENCES_TRIGGER,
  VISUALIZE_EDITOR_TRIGGER,
  AGG_BASED_VISUALIZATION_TRIGGER,
  DASHBOARD_VISUALIZATION_PANEL_TRIGGER,
  ADD_CANVAS_ELEMENT_TRIGGER,
  OPEN_FILE_UPLOAD_LITE_TRIGGER,
  CATEGORIZE_FIELD_TRIGGER,
  IN_APP_EMBEDDABLE_EDIT_TRIGGER,
  CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER,
  UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER,
  SWIM_LANE_SELECTION_TRIGGER,
  EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER,
  SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER,
  O11Y_APM_TRANSACTION_CONTEXT_MENU_TRIGGER,
  O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER,
  SECURITY_ESQL_IN_TIMELINE_HISTOGRAM_TRIGGER,
  SECURITY_CELL_ACTIONS_DEFAULT,
  SECURITY_CELL_ACTIONS_DETAILS_FLYOUT,
  SECURITY_CELL_ACTIONS_ALERTS_COUNT,
  SECURITY_CELL_ACTIONS_CASE_EVENTS,
  FEATURED_ADD_PANEL_TRIGGER,
} from '../common/trigger_ids';
import type { Trigger } from './types';

export const triggers: { [key: string]: Trigger } = {
  [ON_CLICK_VALUE]: {
    id: ON_CLICK_VALUE,
    title: i18n.translate('uiActions.triggers.onClickValue.title', {
      defaultMessage: 'Single click',
    }),
    description: i18n.translate('uiActions.triggers.onClickValue.description', {
      defaultMessage: 'A data point click on the visualization',
    }),
  },
  [ON_CLICK_IMAGE]: {
    id: ON_CLICK_IMAGE,
    title: i18n.translate('uiActions.triggers.onClickImage.title', {
      defaultMessage: 'Image click',
    }),
    description: i18n.translate('uiActions.triggers.onClickImage.description', {
      defaultMessage: 'Clicking the image will trigger the action',
    }),
  },
  [ON_CLICK_ROW]: {
    id: ON_CLICK_ROW,
    title: i18n.translate('uiActions.triggers.onClickRow.title', {
      defaultMessage: 'Table row click',
    }),
    description: i18n.translate('uiActions.triggers.onClickRow.description', {
      defaultMessage: 'A click on a table row',
    }),
  },
  [ON_SELECT_RANGE]: {
    id: ON_SELECT_RANGE,
    title: i18n.translate('uiActions.triggers.onSelectRange.title', {
      defaultMessage: 'Range selection',
    }),
    description: i18n.translate('uiActions.triggers.onSelectRange.description', {
      defaultMessage: 'A range of values on the visualization',
    }),
  },
  [ON_APPLY_FILTER]: {
    id: ON_APPLY_FILTER,
    title: i18n.translate('uiActions.triggers.onApplyFilter.title', {
      defaultMessage: 'Apply filter',
    }),
    description: i18n.translate('uiActions.triggers.onApplyFilter.description', {
      defaultMessage: 'When kibana filter is applied. Could be a single value or a range filter.',
    }),
  },
  [ON_OPEN_PANEL_MENU]: {
    id: ON_OPEN_PANEL_MENU,
    title: i18n.translate('uiActions.triggers.onOpenPanelMenu.title', {
      defaultMessage: 'Context menu',
    }),
    description: i18n.translate('uiActions.triggers.onOpenPanelMenu.description', {
      defaultMessage: "A new option will be added to the panel's context menu",
    }),
  },
  // Legacy triggers below this line
  [ADD_PANEL_TRIGGER]: {
    id: ADD_PANEL_TRIGGER,
    title: i18n.translate('uiActions.triggers.dashboard.addPanelMenu.title', {
      defaultMessage: 'Add panel menu',
    }),
    description: i18n.translate('uiActions.triggers.dashboard.addPanelMenu.description', {
      defaultMessage: "A new action will appear to the dashboard's add panel menu",
    }),
  },
  [FEATURED_ADD_PANEL_TRIGGER]: {
    id: FEATURED_ADD_PANEL_TRIGGER,
  },
  [ALERT_RULE_TRIGGER]: {
    id: ALERT_RULE_TRIGGER,
    title: i18n.translate('uiActions.triggers.dashboard.alertRule.title', {
      defaultMessage: 'Create alert rule',
    }),
    description: i18n.translate('uiActions.triggers.dashboard.alertRule.description', {
      defaultMessage: 'Create an alert rule from this dashboard panel',
    }),
  },
  [VISUALIZE_FIELD_TRIGGER]: {
    id: VISUALIZE_FIELD_TRIGGER,
    title: 'Visualize field',
    description: 'Triggered when user wants to visualize a field.',
  },
  [VISUALIZE_GEO_FIELD_TRIGGER]: {
    id: VISUALIZE_GEO_FIELD_TRIGGER,
    title: 'Visualize Geo field',
    description: 'Triggered when user wants to visualize a geo field.',
  },
  [CONTROL_HOVER_TRIGGER_ID]: {
    id: CONTROL_HOVER_TRIGGER_ID,
    title: i18n.translate('uiActions.triggers.controls.hoverTrigger.title', {
      defaultMessage: 'Control hover',
    }),
    description: i18n.translate('uiActions.triggers.controls.hoverTrigger.description', {
      defaultMessage: "Add action to controls's hover menu",
    }),
  },
  [CONTROL_MENU_TRIGGER]: {
    id: CONTROL_MENU_TRIGGER,
    title: i18n.translate('uiActions.triggers.controls.typeMenu.title', {
      defaultMessage: 'Control type in control menu',
    }),
    description: i18n.translate('uiActions.triggers.controls.typeMenu.description', {
      defaultMessage: 'A new action will appear in the control type menu',
    }),
  },
  [EDIT_LOOKUP_INDEX_CONTENT_TRIGGER_ID]: {
    id: EDIT_LOOKUP_INDEX_CONTENT_TRIGGER_ID,
    title: 'Edit Lookup Index',
    description: 'This trigger is used to edit the lookup index content.',
  },
  [SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID]: {
    id: SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID,
    title: 'Discover session embeddable cell actions',
    description:
      'This trigger is used to replace the cell actions for Discover session embeddable grid.',
  },
  [PANEL_BADGE_TRIGGER]: {
    id: PANEL_BADGE_TRIGGER,
    title: i18n.translate('uiActions.triggers.panelBadgeTrigger.title', {
      defaultMessage: 'Panel badges',
    }),
    description: i18n.translate('uiActions.triggers.panelBadgeTrigger.description', {
      defaultMessage: 'Actions appear in title bar when an embeddable loads in a panel.',
    }),
  },
  [PANEL_NOTIFICATION_TRIGGER]: {
    id: PANEL_NOTIFICATION_TRIGGER,
    title: i18n.translate('uiActions.triggers.panelNotificationTrigger.title', {
      defaultMessage: 'Panel notifications',
    }),
    description: i18n.translate('uiActions.triggers.panelNotificationTrigger.description', {
      defaultMessage: 'Actions appear in top-right corner of a panel.',
    }),
  },
  [MULTI_VALUE_CLICK_TRIGGER]: {
    id: MULTI_VALUE_CLICK_TRIGGER,
    title: i18n.translate('uiActions.triggers.multiValueClickTrigger.title', {
      defaultMessage: 'Multi click',
    }),
    description: i18n.translate('uiActions.triggers.multiValueClickTrigger.description', {
      defaultMessage: 'Selecting multiple values of a single dimension on the visualization',
    }),
  },
  [CELL_VALUE_TRIGGER]: {
    id: CELL_VALUE_TRIGGER,
    title: i18n.translate('uiActions.triggers.cellValueTrigger.title', {
      defaultMessage: 'Cell value',
    }),
    description: i18n.translate('uiActions.triggers.cellValueTrigger.description', {
      defaultMessage: 'Actions appear in the cell value options on the visualization',
    }),
  },
  [ESQL_CONTROL_TRIGGER]: {
    id: ESQL_CONTROL_TRIGGER,
    title: i18n.translate('uiActions.triggers.esqlControlTigger', {
      defaultMessage: 'Create an ES|QL control',
    }),
    description: i18n.translate('uiActions.triggers.esqlControlTiggerDescription', {
      defaultMessage: 'Create an ES|QL control to interact with the charts',
    }),
  },
  [UPDATE_ESQL_QUERY_TRIGGER]: {
    id: UPDATE_ESQL_QUERY_TRIGGER,
    title: i18n.translate('uiActions.triggers.updateEsqlQueryTrigger', {
      defaultMessage: 'Update ES|QL query',
    }),
    description: i18n.translate('uiActions.triggers.updateEsqlQueryTriggerDescription', {
      defaultMessage: 'Update ES|QL query with a new one',
    }),
  },
  [UPDATE_FILTER_REFERENCES_TRIGGER]: {
    id: UPDATE_FILTER_REFERENCES_TRIGGER,
    title: i18n.translate('uiActions.triggers.updateFilterReferencesTrigger', {
      defaultMessage: 'Update filter references',
    }),
    description: i18n.translate('uiActions.triggers.updateFilterReferencesTriggerDescription', {
      defaultMessage: 'Update filter references',
    }),
  },
  [VISUALIZE_EDITOR_TRIGGER]: {
    id: VISUALIZE_EDITOR_TRIGGER,
    title: 'Convert TSVB to Lens',
    description: 'Triggered when user navigates from a TSVB to Lens.',
  },
  [AGG_BASED_VISUALIZATION_TRIGGER]: {
    id: AGG_BASED_VISUALIZATION_TRIGGER,
    title: 'Convert legacy agg based visualizations to Lens',
    description: 'Triggered when user navigates from a agg based visualization to Lens.',
  },
  [DASHBOARD_VISUALIZATION_PANEL_TRIGGER]: {
    id: DASHBOARD_VISUALIZATION_PANEL_TRIGGER,
    title: 'Convert legacy visualization panel on dashboard to Lens',
    description: 'Triggered when user use "Edit in Lens" action on dashboard panel',
  },
  [ADD_CANVAS_ELEMENT_TRIGGER]: {
    id: ADD_CANVAS_ELEMENT_TRIGGER,
    title: i18n.translate('uiActions.triggers.addCanvasElementTrigger.title', {
      defaultMessage: 'Add panel menu',
    }),
    description: i18n.translate('uiActions.triggers.addCanvasElementTrigger.description', {
      defaultMessage: 'A new action will appear in the Canvas add panel menu',
    }),
  },
  [OPEN_FILE_UPLOAD_LITE_TRIGGER]: {
    id: OPEN_FILE_UPLOAD_LITE_TRIGGER,
    title: i18n.translate('uiActions.triggers.fileUpload.lite.actions.triggerTitle', {
      defaultMessage: 'Open file upload UI',
    }),
    description: i18n.translate('uiActions.triggers.fileUpload.lite.actions.triggerDescription', {
      defaultMessage: 'Open file upload UI',
    }),
  },
  [CATEGORIZE_FIELD_TRIGGER]: {
    id: CATEGORIZE_FIELD_TRIGGER,
    title: i18n.translate('uiActions.triggers.ml.actions.runPatternAnalysis.title', {
      defaultMessage: 'Run pattern analysis',
    }),
    description: i18n.translate('uiActions.triggers.ml.actions.runPatternAnalysis.description', {
      defaultMessage: 'Triggered when user wants to run pattern analysis on a field.',
    }),
  },
  [IN_APP_EMBEDDABLE_EDIT_TRIGGER]: {
    id: IN_APP_EMBEDDABLE_EDIT_TRIGGER,
    title: i18n.translate('uiActions.triggers.lens.inAppEditTrigger.title', {
      defaultMessage: 'In-app embeddable edit',
    }),
    description: i18n.translate('uiActions.triggers.lens.inAppEditTrigger.description', {
      defaultMessage: 'Triggers an in app flyout on the current embeddable',
    }),
  },
  [CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER]: {
    id: CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER,
    title: i18n.translate('uiActions.triggers.ml.actions.createADJobFromPatternAnalysis', {
      defaultMessage: 'Create categorization anomaly detection job',
    }),
    description: i18n.translate('uiActions.triggers.ml.actions.createADJobFromPatternAnalysis', {
      defaultMessage: 'Create categorization anomaly detection job',
    }),
  },
  [UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER]: {
    id: UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER,
    title: i18n.translate('uiActions.triggers.ml.actions.updateADJobsProjectRouting.title', {
      defaultMessage: 'Update anomaly detection job project routing',
    }),
    description: i18n.translate(
      'uiActions.triggers.ml.actions.updateADJobsProjectRouting.description',
      {
        defaultMessage:
          'Update project routing for anomaly detection jobs to use cross-project search.',
      }
    ),
  },
  [SWIM_LANE_SELECTION_TRIGGER]: {
    id: SWIM_LANE_SELECTION_TRIGGER,
    // This is empty string to hide title of ui_actions context menu that appears
    // when this trigger is executed.
    title: '',
    description: i18n.translate('uiActions.triggers.ml.swimLaneSelection.description', {
      defaultMessage: 'Swim lane selection triggered',
    }),
  },
  [EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER]: {
    id: EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER,
    // This is empty string to hide title of ui_actions context menu that appears
    // when this trigger is executed.
    title: '',
    description: i18n.translate('uiActions.triggers.ml.explorerEntityFieldSelection.description', {
      defaultMessage: 'Entity field selection triggered',
    }),
  },
  [SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER]: {
    id: SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER,
    // This is empty string to hide title of ui_actions context menu that appears
    // when this trigger is executed.
    title: '',
    description: i18n.translate(
      'uiActions.triggers.ml.singleMetricViewerEntityFieldSelection.description',
      {
        defaultMessage: 'Single metric viewer entity field selection triggered',
      }
    ),
  },
  [DISCOVER_CELL_ACTIONS_TRIGGER_ID]: { id: DISCOVER_CELL_ACTIONS_TRIGGER_ID },
  [O11Y_APM_TRANSACTION_CONTEXT_MENU_TRIGGER]: { id: O11Y_APM_TRANSACTION_CONTEXT_MENU_TRIGGER },
  [O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER]: { id: O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER },
  [SECURITY_ESQL_IN_TIMELINE_HISTOGRAM_TRIGGER]: {
    id: SECURITY_ESQL_IN_TIMELINE_HISTOGRAM_TRIGGER,
  },
  [SECURITY_CELL_ACTIONS_DEFAULT]: { id: SECURITY_CELL_ACTIONS_DEFAULT },
  [SECURITY_CELL_ACTIONS_DETAILS_FLYOUT]: { id: SECURITY_CELL_ACTIONS_DETAILS_FLYOUT },
  [SECURITY_CELL_ACTIONS_ALERTS_COUNT]: { id: SECURITY_CELL_ACTIONS_ALERTS_COUNT },
  [SECURITY_CELL_ACTIONS_CASE_EVENTS]: { id: SECURITY_CELL_ACTIONS_CASE_EVENTS },
};
