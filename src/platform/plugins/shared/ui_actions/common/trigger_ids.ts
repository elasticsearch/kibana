/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * These triggers have been updated to use a more consistent naming schema that works with REST APIs.
 * They are generic events which can apply to many interactions in Kibana. Try to use these first when
 * building a new UI action.
 */
export const ON_CLICK_VALUE = 'on_click_value';
export const ON_CLICK_IMAGE = 'on_click_image';
export const ON_CLICK_ROW = 'on_click_row';
export const ON_SELECT_RANGE = 'on_select_range';

export const ON_APPLY_FILTER = 'on_apply_filter';

export const ON_OPEN_PANEL_MENU = 'on_open_panel_menu';

/**
 * These triggers have not yet been updated, and may be removed or consolidated later.
 */

/**
 * Actions attached to ADD_PANEL_TRIGGER trigger
 * are displayed in dashboards' add panel menu
 *
 * Please consult with @elastic/kibana-presentation before attaching
 * new actions to this trigger.
 */
export const ADD_PANEL_TRIGGER = 'ADD_PANEL_TRIGGER';
/**
 * Actions attached to FEATURED_ADD_PANEL_TRIGGER trigger
 * are displayed at top of dashboards' add panel menu with distinct UI
 *
 * Please consult with @elastic/kibana-presentation before attaching
 * new actions to this trigger.
 */
export const FEATURED_ADD_PANEL_TRIGGER = 'FEATURED_ADD_PANEL_TRIGGER';

export const ALERT_RULE_TRIGGER = 'alertRule';
export const VISUALIZE_FIELD_TRIGGER = 'VISUALIZE_FIELD_TRIGGER';
export const VISUALIZE_GEO_FIELD_TRIGGER = 'VISUALIZE_GEO_FIELD_TRIGGER';

export const CONTROL_HOVER_TRIGGER_ID = 'CONTROL_HOVER_TRIGGER';
export const CONTROL_MENU_TRIGGER = 'CONTROL_MENU_TRIGGER';

export const EDIT_LOOKUP_INDEX_CONTENT_TRIGGER_ID = 'EDIT_LOOKUP_INDEX_CONTENT_TRIGGER_ID';

export const SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID =
  'SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID';
export const DISCOVER_CELL_ACTIONS_TRIGGER_ID = 'DISCOVER_CELL_ACTIONS_TRIGGER_ID';

export const PANEL_BADGE_TRIGGER = 'PANEL_BADGE_TRIGGER';
export const PANEL_NOTIFICATION_TRIGGER = 'PANEL_NOTIFICATION_TRIGGER';
export const MULTI_VALUE_CLICK_TRIGGER = 'MULTI_VALUE_CLICK_TRIGGER';
export const CELL_VALUE_TRIGGER = 'CELL_VALUE_TRIGGER';

export const ESQL_CONTROL_TRIGGER = 'ESQL_CONTROL_TRIGGER';
export const UPDATE_ESQL_QUERY_TRIGGER = 'UPDATE_ESQL_QUERY_TRIGGER';

export const UPDATE_FILTER_REFERENCES_TRIGGER = 'UPDATE_FILTER_REFERENCES_TRIGGER';

export const VISUALIZE_EDITOR_TRIGGER = 'VISUALIZE_EDITOR_TRIGGER';
export const AGG_BASED_VISUALIZATION_TRIGGER = 'AGG_BASED_VISUALIZATION_TRIGGER';
export const DASHBOARD_VISUALIZATION_PANEL_TRIGGER = 'DASHBOARD_VISUALIZATION_PANEL_TRIGGER';

export const ADD_CANVAS_ELEMENT_TRIGGER = 'ADD_CANVAS_ELEMENT_TRIGGER';

export const OPEN_FILE_UPLOAD_LITE_TRIGGER = 'OPEN_FILE_UPLOAD_LITE_TRIGGER';

export const CATEGORIZE_FIELD_TRIGGER = 'CATEGORIZE_FIELD_TRIGGER';

export const IN_APP_EMBEDDABLE_EDIT_TRIGGER = 'IN_APP_EMBEDDABLE_EDIT_TRIGGER';

export const CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER =
  'CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_TRIGGER';
export const UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER = 'UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER';
export const SWIM_LANE_SELECTION_TRIGGER = 'SWIM_LANE_SELECTION_TRIGGER';
export const EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER = 'EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER';
export const SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER =
  'SINGLE_METRIC_VIEWER_ENTITY_FIELD_SELECTION_TRIGGER';

export const O11Y_APM_TRANSACTION_CONTEXT_MENU_TRIGGER = 'apmTransactionContextMenu';
export const O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER = 'apmErrorContextMenu';

export const SECURITY_ESQL_IN_TIMELINE_HISTOGRAM_TRIGGER =
  'security-discoverInTimeline-histogramTrigger';

export const SECURITY_CELL_ACTIONS_DEFAULT = 'security-default-cellActions';
export const SECURITY_CELL_ACTIONS_DETAILS_FLYOUT = 'security-detailsFlyout-cellActions';
export const SECURITY_CELL_ACTIONS_ALERTS_COUNT = 'security-alertsCount-cellActions';
export const SECURITY_CELL_ACTIONS_CASE_EVENTS = 'security-case-events-cellActions';
