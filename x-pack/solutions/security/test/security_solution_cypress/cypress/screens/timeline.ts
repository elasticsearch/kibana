/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getDataTestSubjectSelector, getDataTestSubjectSelectorStartWith } from '../helpers/common';

export const ADD_NOTE_BUTTON = '[data-test-subj="securitySolutionNotesAddNotesButton"]';

export const ADD_FILTER =
  '[data-test-subj="timeline-search-or-filter"] [data-test-subj="addFilter"]';

export const ATTACH_TIMELINE_TO_CASE_BUTTON =
  '[data-test-subj="timeline-modal-attach-to-case-dropdown-button"]';

export const ATTACH_TIMELINE_TO_NEW_CASE_ICON =
  '[data-test-subj="timeline-modal-attach-timeline-to-new-case"]';

export const ATTACH_TIMELINE_TO_EXISTING_CASE_ICON =
  '[data-test-subj="timeline-modal-attach-timeline-to-existing-case"]';

export const SELECT_CASE = (id: string) => {
  return `[data-test-subj="cases-table-row-select-${id}"]`;
};

export const CLOSE_TIMELINE_BTN = '[data-test-subj="timeline-modal-header-close-button"]';

export const COMBO_BOX_INPUT = '[data-test-subj="comboBoxInput"]';

export const CREATE_NEW_TIMELINE = '[data-test-subj="timeline-modal-new-timeline"]';
export const BOTTOM_BAR_CREATE_NEW_TIMELINE =
  '[data-test-subj="timeline-bottom-bar-create-new-timeline"]';

export const BOTTOM_BAR_CREATE_NEW_TIMELINE_TEMPLATE =
  '[data-test-subj="timeline-bottom-bar-create-new-timeline-template"]';

export const DATA_PROVIDERS = '.field-value';

export const DATAGRID_HEADERS = '[data-test-subj^="dataGridHeaderCell-"]';

export const DATAGRID_HEADER = (header: string) => {
  return `[data-test-subj="dataGridHeaderCell-${header}"]`;
};

export const FIELD_BROWSER = '[data-test-subj="show-field-browser"]';

export const LOCKED_ICON = '[data-test-subj="timeline-date-picker-lock-button"]';

export const NOTE_DESCRIPTION =
  '[data-test-subj="securitySolutionNotesTimelineDescriptionComment"]';

export const NOTES_TEXT_AREA = '[data-test-subj="euiMarkdownEditorTextArea"]';

export const NOTES_TAB_BUTTON = '[data-test-subj="timelineTabs-notes"]';

export const NOTES_TEXT = '.euiMarkdownFormat';

export const NOTES_CODE_BLOCK = '.euiCode';

export const NOTES_AUTHOR = '.euiCommentEvent__headerUsername';

export const NOTES_LINK = '[data-test-subj="markdown-link"]';

export const DELETE_NOTE = (index: number) =>
  `[data-test-subj="securitySolutionNotesDeleteNotesButton-${index}"]`;

export const MARKDOWN_INVESTIGATE_BUTTON =
  '[data-test-subj="insight-investigate-in-timeline-button"]';

export const OPEN_TIMELINE_ICON = '[data-test-subj="timeline-modal-open-timeline-button"]';

export const OPEN_TIMELINE_MODAL = '[data-test-subj="open-timeline-modal"]';

export const PIN_EVENT = '[data-test-subj="timeline-pin-event-button"]';

export const PROVIDER_BADGE = '[data-test-subj="providerBadge"]';

export const RESET_FIELDS =
  '[data-test-subj="fields-browser-container"] [data-test-subj="reset-fields"]';

export const SAVE_FILTER_BTN = '[data-test-subj="saveFilter"]';

export const SEARCH_OR_FILTER_CONTAINER =
  '[data-test-subj="timeline-search-or-filter-search-container"]';

export const INDICATOR_MATCH_ROW_RENDER = '[data-test-subj="threat-match-row"]';

export const QUERY_TAB_BUTTON = '[data-test-subj="timelineTabs-query"]';

export const EQL_EVENT_COUNT = '[data-test-subj="eql-events-count"]';

export const QUERY_EVENT_COUNT = '[data-test-subj="query-events-count"]';

export const ALERTS_TABLE_COUNT = `[data-test-subj="toolbar-alerts-count"]`;

export const STAR_ICON = '[data-test-subj="timeline-favorite-empty-star"]';

export const TIMELINE_COLLAPSED_ITEMS_BTN = '[data-test-subj="euiCollapsedItemActionsButton"]';

export const TIMELINE_CREATE_TEMPLATE_FROM_TIMELINE_BTN =
  '[data-test-subj="create-template-from-timeline"]';

export const TIMELINE_CREATE_TIMELINE_FROM_TEMPLATE_BTN = '[data-test-subj="create-from-template"]';

export const TIMELINE_CORRELATION_INPUT = '[data-test-subj="eqlQueryBarTextInput"]';

export const TIMELINE_CORRELATION_TAB = '[data-test-subj="timelineTabs-eql"]';

export const TIMELINE_DATA_PROVIDERS_ACTION_MENU = '[data-test-subj="providerActions"]';

export const TIMELINE_ADD_FIELD_BUTTON = '[data-test-subj="addField"]';

export const TIMELINE_DATA_PROVIDER_FIELD = '[data-test-subj="field"]';

export const TIMELINE_DATA_PROVIDER_OPERATOR = `[data-test-subj="operator"]`;

export const TIMELINE_DATA_PROVIDER_VALUE = `[data-test-subj="value"]`;

export const SAVE_DATA_PROVIDER_BTN = `[data-test-subj="save"]`;

export const TIMELINE_DESCRIPTION_INPUT =
  '[data-test-subj="save-timeline-modal-description-input"]';

export const TIMELINE_DROPPED_DATA_PROVIDERS = '[data-test-subj="providerContainer"]';

export const TIMELINE_EVENT = '[data-test-subj="event"]';

export const TIMELINE_DISCOVER_FIELDS_BUTTON =
  '[data-test-subj="timeline"] [data-test-subj="dataView-add-field_btn"]';

export const TIMELINE_FILTER_FIELD = '[data-test-subj="filterFieldSuggestionList"]';

export const TIMELINE_TITLE_BY_ID = (id: string) => `[data-test-subj="timeline-title-${id}"]`;

export const TIMELINE_FILTER_OPERATOR = '[data-test-subj="filterOperatorList"]';

export const TIMELINE_FILTER_VALUE =
  '[data-test-subj="filterParamsComboBox phraseParamsComboxBox"]';

export const TIMELINE_FLYOUT = '[data-test-subj="timeline-container"]';

export const TIMELINE_FLYOUT_HEADER = '[data-test-subj="query-tab-flyout-header"]';

export const TIMELINE_HEADER = '[data-test-subj="timeline-hide-show-container"]';

export const TIMELINE_INSPECT_BUTTON = `${TIMELINE_FLYOUT} [data-test-subj="inspect-empty-button"]`;

export const TIMELINE_PANEL = `[data-test-subj="timeline-modal-header-panel"]`;

export const TIMELINE_QUERY = '[data-test-subj="timelineQueryInput"]';

export const BOTTOM_BAR_TIMELINE_PLUS_ICON = '[data-test-subj="timeline-bottom-bar-open-button"]';

export const TIMELINE_SEARCH_OR_FILTER = '[data-test-subj="timeline-select-search-or-filter"]';

export const TIMELINE_KQLMODE_SEARCH = '[data-test-subj="kqlModePopoverSearch"]';

export const TIMELINE_KQLMODE_FILTER = '[data-test-subj="kqlModePopoverFilter"]';

export const TIMELINE_SHOWQUERYBARMENU_BUTTON = `${TIMELINE_FLYOUT} [data-test-subj="showQueryBarMenu"]`;

export const TIMELINE_SWITCHQUERYLANGUAGE_BUTTON = '[data-test-subj="switchQueryLanguageButton"]';

export const TIMELINE_LUCENELANGUAGE_BUTTON = '[data-test-subj="luceneLanguageMenuItem"]';

export const TIMELINE_KQLLANGUAGE_BUTTON = '[data-test-subj="kqlLanguageMenuItem"]';

export const TIMELINE_TITLE = '[data-test-subj="timeline-modal-header-title"]';

export const TIMELINE_TITLE_INPUT = '[data-test-subj="save-timeline-modal-title-input"]';

export const TIMELINE_SAVE_MODAL = '[data-test-subj="save-timeline-modal"]';

export const TIMELINE_SAVE_MODAL_SAVE_BUTTON = '[data-test-subj="save-timeline-modal-save-button"]';

export const TIMELINE_SAVE_MODAL_SAVE_AS_NEW_SWITCH =
  '[data-test-subj="save-timeline-modal-save-as-new-switch"]';

export const TIMELINE_FLYOUT_WRAPPER = '[data-test-subj="timeline-portal-ref"]';

export const TIMELINE_WRAPPER = '[data-test-subj="timeline-portal-overlay-mask"]';

export const TIMELINE_FULL_SCREEN_BUTTON = '[data-test-subj="full-screen-active"]';

export const TIMELINE_PROGRESS_BAR = '[data-test-subj="progress-bar"]';

const TIMELINE_ROW_RENDERERS_MODAL = '[data-test-subj="row-renderers-modal"]';

export const TIMELINE_ROW_RENDERERS_DISABLE_ALL_BTN = `[data-test-subj="disable-all"]`;

export const TIMELINE_ROW_RENDERERS_MODAL_CLOSE_BUTTON = `${TIMELINE_ROW_RENDERERS_MODAL} .euiModal__closeIcon`;

export const TIMELINE_ROW_RENDERERS_MODAL_ITEMS_CHECKBOX = `${TIMELINE_ROW_RENDERERS_MODAL} .euiCheckbox__input`;

export const TIMELINE_ROW_RENDERERS_SEARCHBOX = `${TIMELINE_ROW_RENDERERS_MODAL} input[type="search"]`;

export const TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE = `[data-test-subj="render-content-suricata.eve.alert.signature"]`;

export const TIMELINE_ROW_RENDERERS_SURICATA_LINK_TOOLTIP = `[data-test-subj="externalLinkTooltip"]`;

export const TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE_TOOLTIP = `[data-test-subj="suricata.eve.alert.signature-tooltip"]`;

export const TIMELINE_SHOW_ROW_RENDERERS_GEAR = '[data-test-subj="show-row-renderers-gear"]';

export const TIMELINE_ENABLE_DISABLE_ALL_ROW_RENDERER =
  getDataTestSubjectSelector('row-renderer-switch');

export const TIMELINE_TABS = '[data-test-subj="timeline"] .euiTabs';

export const TIMELINE_TAB_CONTENT_EQL = '[data-test-subj="timeline-tab-content-eql"]';

export const TIMELINE_STATUS = '[data-test-subj="timeline-save-status"]';

export const ALERT_TABLE_SEVERITY_VALUES =
  '[data-test-subj="formatted-field-kibana.alert.severity"]';

export const ALERT_TABLE_FILE_NAME_HEADER = '[data-gridcell-column-id="file.name"]';

export const ALERT_TABLE_SEVERITY_HEADER = '[data-gridcell-column-id="kibana.alert.severity"]';

export const ALERT_TABLE_FILE_NAME_VALUES = `${ALERT_TABLE_FILE_NAME_HEADER}[data-test-subj="dataGridRowCell"]`; // empty column for the test data

export const ACTIVE_TIMELINE_BOTTOM_BAR = '[data-test-subj="timeline-bottom-bar-title-button"]';

export const TIMELINE_EVENT_COUNT_BADGE = '[data-test-subj="timeline-event-count-badge"]';

// timeline table grid cell
export const GET_TIMELINE_GRID_CELL = (fieldName: string) =>
  `[data-test-subj="dataGridRowCell"][data-gridcell-column-id="${fieldName}"]`;

// actual content within timeline table grid cell without screenreader text
export const GET_TIMELINE_GRID_CELL_VALUE = (fieldName: string) =>
  `[data-test-subj="dataGridRowCell"][data-gridcell-column-id="${fieldName}"] .unifiedDataTable__cellValue`;

export const TIMELINE_DATA_PROVIDERS_CONTAINER = '[data-test-subj="dataProviders"]';

export const TIMELINE_VIEW_IN_ANALYZER = '[data-test-subj="view-in-analyzer"]';

export const HOVER_ACTIONS = {
  ADD_TO_TIMELINE:
    '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-addToTimeline"]',
  FILTER_FOR: '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-filterIn"]',
  FILTER_OUT: '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-filterOut"]',
  COPY: '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-copyToClipboard"]',
  SHOW_TOP: '[data-test-subj="dataGridColumnCellAction-security-default-cellActions-showTopN"]',
};

export const TIMELINE_FILTER_BADGE_ENABLED = '[data-test-subj~="filter-enabled"]';

export const ESQL_TAB = getDataTestSubjectSelector('timelineTabs-esql');

export const TIMELINE_DATE_PICKER_CONTAINER = getDataTestSubjectSelector(
  'timeline-date-picker-container'
);

export const NEW_TIMELINE_ACTION = getDataTestSubjectSelector(
  'timeline-modal-new-timeline-dropdown-button'
);

export const SAVE_TIMELINE_ACTION = getDataTestSubjectSelector('timeline-modal-save-timeline');
export const SAVE_TIMELINE_ACTION_BTN = getDataTestSubjectSelector('timeline-modal-save-timeline');

export const SAVE_TIMELINE_TOOLTIP = getDataTestSubjectSelector(
  'timeline-modal-save-timeline-tooltip'
);

export const TOGGLE_DATA_PROVIDER_BTN = getDataTestSubjectSelector('toggle-data-provider');

export const EXPAND_ALERT_BTN = getDataTestSubjectSelector('docTableExpandToggleColumn');

export const TIMELINE_ROW_RENDERERS_WRAPPER =
  getDataTestSubjectSelectorStartWith('timeline-row-renderer-');
