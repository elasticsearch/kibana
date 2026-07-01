/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PREFIX } from '../../../shared/test_ids';

const HEADER_TEST_ID = 'Header';
const CONTENT_TEST_ID = 'Content';

/* Table */

const FLYOUT_TABLE_TEST_ID = `${PREFIX}Table` as const;
export const FLYOUT_TABLE_FIELD_NAME_CELL_ICON_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}FieldNameCellIcon` as const;
export const FLYOUT_TABLE_FIELD_NAME_CELL_TEXT_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}FieldNameCellText` as const;
export const FLYOUT_TABLE_PREVIEW_LINK_FIELD_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}PreviewLinkField` as const;
export const FLYOUT_TABLE_PIN_ACTION_TEST_ID = `${FLYOUT_TABLE_TEST_ID}PinAction` as const;
export const TABLE_TAB_SETTING_BUTTON_TEST_ID = `${PREFIX}TableTabSettingButton` as const;
export const TABLE_TAB_SETTING_HIGHLIGHTED_FIELDS_ONLY_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}HighlightedFieldsOnly` as const;
export const TABLE_TAB_SETTING_HIDE_EMPTY_FIELDS_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}HideEmptyFields` as const;
export const TABLE_TAB_SETTING_HIDE_ALERT_FIELDS_TEST_ID =
  `${FLYOUT_TABLE_TEST_ID}HideAlertFields` as const;
export const TABLE_TAB_TOUR_TEST_ID = `${FLYOUT_TABLE_TEST_ID}Tour` as const;

/* Header */

const FLYOUT_HEADER_TEST_ID = `${PREFIX}Header` as const;
export const STATUS_TITLE_TEST_ID = `${FLYOUT_HEADER_TEST_ID}StatusTitle` as const;
export const SHARE_BUTTON_TEST_ID = `${FLYOUT_HEADER_TEST_ID}ShareButton` as const;
export const CHAT_BUTTON_TEST_ID = 'newChatByTitle' as const;
export const AGENT_ATTACHMENT_BUTTON_TEST_ID = 'newAgentBuilderAttachment' as const;

export const NOTES_TITLE_TEST_ID = `${FLYOUT_HEADER_TEST_ID}NotesTitle` as const;
export const NOTES_ADD_NOTE_BUTTON_TEST_ID = `${FLYOUT_HEADER_TEST_ID}NotesAddNoteButton` as const;
export const NOTES_VIEW_NOTES_BUTTON_TEST_ID =
  `${FLYOUT_HEADER_TEST_ID}NotesViewNotesButton` as const;
export const NOTES_ADD_NOTE_ICON_BUTTON_TEST_ID =
  `${FLYOUT_HEADER_TEST_ID}NotesAddNoteIconButton` as const;
export const NOTES_COUNT_TEST_ID = `${FLYOUT_HEADER_TEST_ID}NotesCount` as const;
export const NOTES_LOADING_TEST_ID = `${FLYOUT_HEADER_TEST_ID}NotesLoading` as const;

export const ASSIGNEES_EMPTY_TEST_ID = `${FLYOUT_HEADER_TEST_ID}AssigneesEmpty` as const;
export const ASSIGNEES_TEST_ID = `${FLYOUT_HEADER_TEST_ID}Assignees` as const;
export const ASSIGNEES_ADD_BUTTON_TEST_ID = `${FLYOUT_HEADER_TEST_ID}AssigneesAddButton` as const;

export const FLYOUT_ALERT_PAGINATION_TEST_ID = `${FLYOUT_HEADER_TEST_ID}AlertPagination` as const;
export const FLYOUT_LOADING_SPINNER_TEST_ID = `${PREFIX}LoadingSpinner` as const;
/* About section */

const ABOUT_SECTION_TEST_ID = `${PREFIX}AboutSection` as const;
export const ABOUT_SECTION_HEADER_TEST_ID = ABOUT_SECTION_TEST_ID + HEADER_TEST_ID;
export const ABOUT_SECTION_CONTENT_TEST_ID = ABOUT_SECTION_TEST_ID + CONTENT_TEST_ID;

export const WORKFLOW_STATUS_TEST_ID = `${PREFIX}WorkflowStatus` as const;
export const WORKFLOW_STATUS_TITLE_TEST_ID = `${WORKFLOW_STATUS_TEST_ID}Title` as const;
export const WORKFLOW_STATUS_DETAILS_TEST_ID = `${WORKFLOW_STATUS_TEST_ID}Details` as const;

/* Investigation section */

const INVESTIGATION_SECTION_TEST_ID = `${PREFIX}InvestigationSection` as const;
export const INVESTIGATION_SECTION_HEADER_TEST_ID = INVESTIGATION_SECTION_TEST_ID + HEADER_TEST_ID;
export const INVESTIGATION_SECTION_CONTENT_TEST_ID =
  INVESTIGATION_SECTION_TEST_ID + CONTENT_TEST_ID;

/* Insights section */

export const INSIGHTS_TEST_ID = `${PREFIX}Insights` as const;
export const INSIGHTS_HEADER_TEST_ID = INSIGHTS_TEST_ID + HEADER_TEST_ID;
export const INSIGHTS_CONTENT_TEST_ID = INSIGHTS_TEST_ID + CONTENT_TEST_ID;

/* Visualizations section */

export const VISUALIZATIONS_TEST_ID = `${PREFIX}Visualizations` as const;
export const VISUALIZATIONS_SECTION_HEADER_TEST_ID = VISUALIZATIONS_TEST_ID + HEADER_TEST_ID;
export const VISUALIZATIONS_SECTION_CONTENT_TEST_ID = VISUALIZATIONS_TEST_ID + CONTENT_TEST_ID;

/* Response section */

const RESPONSE_TEST_ID = `${PREFIX}Response` as const;
export const RESPONSE_SECTION_TEST_ID = `${RESPONSE_TEST_ID}Section` as const;
export const RESPONSE_SECTION_HEADER_TEST_ID = RESPONSE_SECTION_TEST_ID + HEADER_TEST_ID;
export const RESPONSE_SECTION_CONTENT_TEST_ID = RESPONSE_SECTION_TEST_ID + CONTENT_TEST_ID;
export const RESPONSE_BUTTON_TEST_ID = `${RESPONSE_TEST_ID}Button` as const;
export const RESPONSE_EMPTY_TEST_ID = `${RESPONSE_TEST_ID}Empty` as const;
export const GRAPH_PREVIEW_TEST_ID = `${PREFIX}GraphPreview` as const;
export const GRAPH_PREVIEW_LOADING_TEST_ID = `${GRAPH_PREVIEW_TEST_ID}Loading` as const;
