/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PAGE_TITLE = '[data-test-subj="entityAnalyticsHomePage"]';
/** Shown on entity_analytics_home_page while data view / page deps resolve (EuiLoadingSpinner) */
export const COMBINED_RISK_DONUT_CHART = '[data-test-subj="risk-score-donut-chart"]';
export const ANOMALIES_PLACEHOLDER_PANEL = '[data-test-subj="recent-anomalies-panel"]';

export const ENTITIES_TABLE_GRID = '[data-test-subj="entity-analytics-test-subj-grid-wrapper"]';
export const ENTITIES_TABLE_EMPTY = '[data-test-subj="entity-analytics-empty-state"]';

export const DATAGRID_HEADER = '[data-test-subj="dataGridHeader"]';
export const DATAGRID_COLUMN_SELECTOR = '[data-test-subj="dataGridColumnSelectorButton"]';
export const DATAGRID_SORTING_SELECTOR = '[data-test-subj="dataGridColumnSortingButton"]';
export const DATA_GRID_ROW_CELL = '[data-test-subj="dataGridRowCell"]';
export const dataGridRowCellByColumn = (columnId: string) =>
  `${DATA_GRID_ROW_CELL}[data-gridcell-column-id="${columnId}"]`;

export const EXPAND_ROW_BUTTON = '[data-test-subj="docTableExpandToggleColumn"]';

export const TIMELINE_ACTION = '[data-test-subj="entity-analytics-home-timeline-icon"]';

export const FIELDS_SELECTOR_BUTTON = '[data-test-subj="entityAnalyticsFieldsSelectorOpenButton"]';
export const FIELDS_SELECTOR_MODAL = '[data-test-subj="entityAnalyticsFieldsSelectorModal"]';
export const FIELDS_SELECTOR_RESET = '[data-test-subj="entityAnalyticsFieldsSelectorResetButton"]';
export const FIELDS_SELECTOR_CLOSE = '[data-test-subj="entityAnalyticsFieldsSelectorCloseButton"]';

export const LAST_UPDATED = '[data-test-subj="entity-analytics-toolbar-updated-at"]';

export const FLYOUT_RIGHT_PANEL = '[data-test-subj="rightSection"]';
export const FLYOUT_TITLE_TEXT = '[data-test-subj="flyoutTitleText"]';
/** Resolution group header — opens the primary (target) entity flyout */
export const GROUP_HEADER_OPEN_ENTITY_FLYOUT_BUTTON =
  '[data-test-subj="entity-analytics-resolution-group-open-flyout"]';

// Grouping selectors (from @kbn/grouping)
export const GROUP_SELECTOR_DROPDOWN = '[data-test-subj="group-selector-dropdown"]';
export const GROUPING_TABLE = '[data-test-subj="grouping-table"]';
export const GROUPING_LEVEL_0 = '[data-test-subj="grouping-level-0"]';
export const GROUPING_ACCORDION = '[data-test-subj="grouping-accordion"]';
export const GROUPING_ACCORDION_CONTENT = '[data-test-subj="grouping-accordion-content"]';
export const GROUP_PANEL_TOGGLE = '[data-test-subj="group-panel-toggle"]';
export const GROUP_STATS = '[data-test-subj="group-stats"]';
export const GROUP_COUNT = '[data-test-subj="group-count"]';
export const IS_LOADING_GROUPING_TABLE = '[data-test-subj="is-loading-grouping-table"]';
export const GLOBAL_LOADING_INDICATOR_HIDDEN = '[data-test-subj="globalLoadingIndicator-hidden"]';
export const GLOBAL_LOADING_INDICATOR = '[data-test-subj="globalLoadingIndicator"]';

// Group selector menu options
export const PANEL_NONE = '[data-test-subj="panel-none"]';
export const PANEL_ENTITY_TYPE = '[data-test-subj="panel-entity.EngineMetadata.Type"]';
export const PANEL_RESOLUTION =
  '[data-test-subj="panel-entity.relationships.resolution.resolved_to"]';
