/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getDataTestSubjectSelector } from '../helpers/common';

export const ADD_EXCEPTION_BTN = '[data-test-subj="add-exception-menu-item"]';

export const ADD_ENDPOINT_EXCEPTION_BTN = '[data-test-subj="add-endpoint-exception-menu-item"]';

export const ALERT_COUNT_TABLE_COLUMN = (column: number) =>
  `[data-test-subj="embeddablePanel"] [data-test-subj="dataGridRowCell"]:nth-child(${column}) [data-test-subj="lnsTableCellContent"]`;

export const ALERT_EMBEDDABLE_PROGRESS_BAR =
  '[data-test-subj="chartPanels"] [data-test-subj="embeddablePanel"] .euiProgress';

export const ALERT_EMBEDDABLE_EMPTY_PROMPT =
  '[data-test-subj="embeddablePanel"] [data-test-subj="emptyPlaceholder"]';

export const ALERT_CHECKBOX = '[data-test-subj="bulk-actions-row-cell"].euiCheckbox__input';

export const ALERT_GRID_CELL = '[data-test-subj="dataGridRowCell"]';

export const ALERT_RULE_NAME = '[data-test-subj="formatted-field-kibana.alert.rule.name"]';

export const ALERT_RISK_SCORE = '[data-test-subj="formatted-field-kibana.alert.risk_score"]';

export const ALERT_SEVERITY = '[data-test-subj="formatted-field-kibana.alert.severity"]';

export const ALERT_DATA_GRID = '[data-test-subj="euiDataGridBody"]';

export const ALERT_DATA_GRID_ROW = `${ALERT_DATA_GRID} .euiDataGridRow`;

export const ALERTS_COUNT = '[data-test-subj="toolbar-alerts-count"]';

export const CLOSE_ALERT_BTN = '[data-test-subj="alert-close-context-menu-item"]';

export const CLOSED_ALERTS_FILTER_BTN = '[data-test-subj="closedAlerts"]';

export const EMPTY_ALERT_TABLE = '[data-test-subj="alertsTableEmptyState"]';

export const EXPAND_ALERT_BTN = '[data-test-subj="expand-event"]';

export const TAKE_ACTION_BTN = '[data-test-subj="securitySolutionFlyoutFooterDropdownButton"]';

export const ACKNOWLDEGED_ALERTS_FILTER_BTN = '[data-test-subj="acknowledgedAlerts"]';

export const TAKE_ACTION_MENU = '[data-test-subj="takeActionPanelMenu"]';

export const CLOSE_FLYOUT = '[data-test-subj="euiFlyoutCloseButton"]';

/**
 * Selectors for bulk alert actions popover items
 */
export const OPEN_ALERT_BTN = '[data-test-subj="open-alert-status"]';
export const CLOSE_SELECTED_ALERTS_BTN = '[data-test-subj="alert-close-context-menu-item"]';
export const MARK_ALERT_ACKNOWLEDGED_BTN = '[data-test-subj="acknowledged-alert-status"]';
export const ALERT_TAGGING_CONTEXT_MENU_ITEM = '[data-test-subj="alert-tags-context-menu-item"]';

export const OPENED_ALERTS_FILTER_BTN = '[data-test-subj="openAlerts"]';

export const COLUMN_HEADER = '[data-test-subj="dataGridHeader"]';

export const TIMESTAMP_COLUMN = '[data-test-subj="dataGridHeaderCell-@timestamp"]';

export const MESSAGE = '[data-test-subj="formatted-field-message"]';

export const SELECTED_ALERTS = '[data-test-subj="selectedShowBulkActionsButton"]';

export const SEND_ALERT_TO_TIMELINE_BTN = '[data-test-subj="send-alert-to-timeline-button"]';

export const OPEN_ANALYZER_BTN = '[data-test-subj="view-in-analyzer"]';

export const ANALYZER_NODE = '[data-test-subj="resolver:node"';

export const TAKE_ACTION_POPOVER_BTN = '[data-test-subj="selectedShowBulkActionsButton"]';

export const TIMELINE_CONTEXT_MENU_BTN = '[data-test-subj="timeline-context-menu-button"]';

export const ATTACH_ALERT_TO_CASE_BUTTON = '[data-test-subj="add-to-existing-case-action"]';

export const ATTACH_TO_NEW_CASE_BUTTON = '[data-test-subj="add-to-new-case-action"]';

export const DATAGRID_CHANGES_IN_PROGRESS = '[data-test-subj="body-data-grid"] .euiProgress';

export const EVENT_CONTAINER_TABLE_LOADING = '[data-test-subj="internalAlertsPageLoading"]';

export const SELECT_ALL_VISIBLE_ALERTS = '[data-test-subj="bulk-actions-header"]';

export const SELECT_ALL_ALERTS = '[data-test-subj="selectAllAlertsButton"]';

export const EVENT_CONTAINER_TABLE_NOT_LOADING =
  '[data-test-subj="events-container-loading-false"]';

export const FILTER_BADGE = '[data-test-subj^="filter-badge"]';

export const FILTER_BADGE_DELETE = '[data-test-subj="deleteFilter"]';

export const CELL_FILTER_IN_BUTTON =
  '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-filterIn"]';

export const CELL_FILTER_OUT_BUTTON =
  '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-filterOut"]';

export const CELL_ADD_TO_TIMELINE_BUTTON =
  '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-addToTimeline"]';

export const CELL_SHOW_TOP_FIELD_BUTTON =
  '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-showTopN"]';

export const CELL_COPY_BUTTON =
  '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-copyToClipboard"]';

export const ACTIONS_EXPAND_BUTTON = '[data-test-subj="euiDataGridCellExpandButton"]';

export const SHOW_TOP_N_HEADER =
  '[data-test-subj="topN-container"] [data-test-subj="header-section-title"]';

export const SHOW_TOP_N_DROPDOWN =
  '[data-test-subj="topN-container"] [data-test-subj="header-section-supplements"] [data-test-subj="view-select"]';

export const SHOW_TOP_N_DROPDOWN_ALERT_OPTION = '[data-test-subj="option-alert"]';

export const SESSION_VIEWER_BUTTON = '[data-test-subj="session-view-button"]';

/**
 * Alerts KPIs
 */

export const ALERT_CHARTS_TOGGLE_BUTTON = getDataTestSubjectSelector('query-toggle-header');

export const SELECT_OVERVIEW_CHARTS = getDataTestSubjectSelector('chart-select-charts');

export const ALERT_SUMMARY_CHARTS = getDataTestSubjectSelector('alerts-charts-panel');

export const ALERT_SUMMARY_SEVERITY_DONUT_CHART =
  getDataTestSubjectSelector('severity-level-donut');

export const ALERT_SUMMARY_RULES_TABLE = getDataTestSubjectSelector('alerts-by-rule-panel');

export const ALERT_SUMMARY_PROGRESS_BAR_CHARTS = getDataTestSubjectSelector(
  'alerts-progress-bar-panel'
);

export const ALERT_SUMMARY_CHARTS_COLLAPSED = getDataTestSubjectSelector('chart-collapse');

export const ALERTS_HISTOGRAM = getDataTestSubjectSelector('alerts-histogram-panel');

export const ALERTS_HISTOGRAM_LEGEND =
  '[data-test-subj="alerts-histogram-panel"] .echLegendItem__action';

export const ALERTS_HISTOGRAM_SERIES = '[data-ech-series-name]';

export const SELECT_HISTOGRAM = '[data-test-subj="chart-select-trend"]';

export const LEGEND_ACTIONS = {
  ADD_TO_TIMELINE: (ruleName: string) =>
    `[data-test-subj="legend-${ruleName}-embeddable_addToTimeline"]`,
  FILTER_FOR: (ruleName: string) => `[data-test-subj="legend-${ruleName}-embeddable_filterIn"]`,
  FILTER_OUT: (ruleName: string) => `[data-test-subj="legend-${ruleName}-embeddable_filterOut"]`,
  COPY: (ruleName: string) => `[data-test-subj="legend-${ruleName}-embeddable_copyToClipboard"]`,
};

export const ALERT_COUNT_TABLE = getDataTestSubjectSelector('alertsCountPanel');

export const SELECT_COUNTS_TABLE = '[data-test-subj="chart-select-table"]';

export const SELECT_TREEMAP = getDataTestSubjectSelector('chart-select-treemap');

export const ALERT_TREEMAP = getDataTestSubjectSelector('treemapPanel');

export const ALERT_TAGGING_CONTEXT_MENU = '[data-test-subj="alert-tags-selectable-menu"]';

export const ALERT_TAGGING_UPDATE_BUTTON = '[data-test-subj="alert-tags-update-button"]';

export const SELECTED_ALERT_TAG = '[data-test-subj="selected-alert-tag"]';

export const MIXED_ALERT_TAG = '[data-test-subj="mixed-alert-tag"]';

export const UNSELECTED_ALERT_TAG = '[data-test-subj="unselected-alert-tag"]';

export const ALERTS_TABLE_ROW_LOADER = '[data-test-subj="row-loader"]';

export const ALERT_TABLE_SUMMARY_VIEW_SELECTABLE = '[data-test-subj="summary-view-selector"]';

export const ALERT_TABLE_GRID_VIEW_OPTION = '[data-test-subj="gridView"]';

export const EVENT_SUMMARY_COLUMN = '[data-gridcell-column-id="eventSummary"]';

export const EVENT_SUMMARY_ALERT_RENDERER_CONTENT = '[data-test-subj="alertRenderer"]';

export const ALERT_TABLE_EVENT_RENDERED_VIEW_OPTION = '[data-test-subj="eventRenderedView"]';

export const ALERT_RENDERER_HOST_NAME =
  '[data-test-subj="alertFieldBadge"] [data-test-subj="render-content-host.name"]';

export const HOVER_ACTIONS_CONTAINER = getDataTestSubjectSelector('hoverActionsPopover');

export const ALERT_USERS_PROFILES_SELECTABLE_MENU_ITEM = '.euiSelectableListItem';

export const ALERT_USERS_PROFILES_CLEAR_SEARCH_BUTTON = '[data-test-subj="clearSearchButton"]';

export const ALERT_ASSIGN_CONTEXT_MENU_ITEM =
  '[data-test-subj="alert-assignees-context-menu-item"]';

export const ALERT_UNASSIGN_CONTEXT_MENU_ITEM =
  '[data-test-subj="remove-alert-assignees-menu-item"]';

export const ALERT_ASSIGNEES_SELECT_PANEL =
  '[data-test-subj="securitySolutionAssigneesSelectable"]';

export const ALERT_ASSIGNEES_UPDATE_BUTTON =
  '[data-test-subj="securitySolutionAssigneesApplyButton"]';

export const ALERT_ASSIGNEES_SELECTABLE_OPTIONS =
  '[data-test-subj="securitySolutionAssigneesSelectable"] .euiSelectableListItem[role="option"]';

export const ALERT_USER_AVATAR = (assignee: string) => {
  const expectedAssignee = assignee;

  return `[data-test-subj^="securitySolutionUsersAvatar-"][aria-label^='${expectedAssignee}']`;
};

export const ALERT_AVATARS_PANEL = '[data-test-subj="securitySolutionUsersAvatarsPanel"]';

export const ALERT_ASIGNEES_COLUMN =
  '[data-test-subj="dataGridRowCell"][data-gridcell-column-id="kibana.alert.workflow_assignee_ids"]';

export const FILTER_BY_ASSIGNEES_BUTTON = '[data-test-subj="filter-popover-button-assignees"]';

export const ALERT_DETAILS_ASSIGN_BUTTON =
  '[data-test-subj="securitySolutionFlyoutHeaderAssigneesAddButton"]';

export const ALERT_DETAILS_TAKE_ACTION_BUTTON =
  '[data-test-subj="securitySolutionFlyoutFooterDropdownButton"]';

export const USER_COLUMN = '[data-gridcell-column-id="user.name"]';

export const TOOLTIP = '[data-test-subj="message-tool-tip"]';

export const HOVER_ACTIONS = {
  ADD_TO_TIMELINE: '[data-test-subj="actionItem-security-default-cellActions-addToTimeline"]',
  FILTER_FOR: '[data-test-subj="actionItem-security-default-cellActions-filterIn"]',
  FILTER_OUT: '[data-test-subj="actionItem-security-default-cellActions-filterOut"]',
  COPY: '[data-test-subj="actionItem-security-default-cellActions-copyToClipboard"]',
  SHOW_TOP: '[data-test-subj="actionItem-security-default-cellActions-showTopN"]',
};

export const ADD_TO_NEW_CASE_BUTTON = '[data-test-subj="attach-new-case"]';

export const ADD_TO_EXISTING_CASE_BUTTON = '[data-test-subj="attach-existing-case"]';

export const GROUP_ALERTS_BY_BTN = '[data-test-subj="alerts-table-group-selector"]';

export const TAKE_ACTION_GROUPED_ALERTS_BTN = '[data-test-subj="take-action-button"]';

export const ALERT_STATUS_BADGE_BUTTON = '[data-test-subj="rule-status-badge"]';

export const ALERTS_PAGE_KQL_BAR = '[data-test-subj="alerts-page-search-bar"]';
