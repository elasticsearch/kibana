/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getDataTestSubjectSelector } from '../../helpers/common';

export const DOCUMENT_DETAILS_FLYOUT_BODY = getDataTestSubjectSelector(
  'securitySolutionFlyoutBody'
);

/* Header */

export const DOCUMENT_DETAILS_FLYOUT_HEADER_ICON = getDataTestSubjectSelector(
  'securitySolutionFlyoutAlertTitleIcon'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_TITLE = getDataTestSubjectSelector(
  'securitySolutionFlyoutAlertTitleText'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_LINK_ICON = getDataTestSubjectSelector(
  'securitySolutionFlyoutAlertTitleLinkIcon'
);
export const DOCUMENT_DETAILS_FLYOUT_CLOSE_BUTTON =
  getDataTestSubjectSelector('euiFlyoutCloseButton');
export const DOCUMENT_DETAILS_FLYOUT_EXPAND_DETAILS_BUTTON = getDataTestSubjectSelector(
  'securitySolutionFlyoutNavigationExpandDetailButton'
);
export const DOCUMENT_DETAILS_FLYOUT_COLLAPSE_DETAILS_BUTTON = getDataTestSubjectSelector(
  'securitySolutionFlyoutNavigationCollapseDetailButton'
);
export const DOCUMENT_DETAILS_FLYOUT_OVERVIEW_TAB = getDataTestSubjectSelector(
  'securitySolutionFlyoutOverviewTab'
);
export const DOCUMENT_DETAILS_FLYOUT_TABLE_TAB = getDataTestSubjectSelector(
  'securitySolutionFlyoutTableTab'
);
export const DOCUMENT_DETAILS_FLYOUT_JSON_TAB = getDataTestSubjectSelector(
  'securitySolutionFlyoutJsonTab'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_STATUS =
  getDataTestSubjectSelector('rule-status-badge');
export const DOCUMENT_DETAILS_FLYOUT_HEADER_RISK_SCORE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderRiskScoreTitle'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_RISK_SCORE_VALUE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderRiskScoreValue'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_SEVERITY_VALUE = getDataTestSubjectSelector('severity');
export const DOCUMENT_DETAILS_FLYOUT_HEADER_ASSIGNEES_TITLE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderAssigneesTitle'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_ASSIGNEES_VALUE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderAssignees'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_NOTES_TITLE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderNotesTitle'
);
export const DOCUMENT_DETAILS_FLYOUT_HEADER_NOTES_VALUE = getDataTestSubjectSelector(
  'securitySolutionFlyoutHeaderNotesAddNoteButton'
);

/* Footer */

export const DOCUMENT_DETAILS_FLYOUT_FOOTER = getDataTestSubjectSelector(
  'securitySolutionFlyoutFooter'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON = getDataTestSubjectSelector(
  'securitySolutionFlyoutFooterDropdownButton'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON_DROPDOWN =
  getDataTestSubjectSelector('takeActionPanelMenu');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_CASE =
  getDataTestSubjectSelector('add-to-case-action');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_MARK_AS_ACKNOWLEDGED = getDataTestSubjectSelector(
  'acknowledged-alert-status'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_MARK_AS_CLOSED = getDataTestSubjectSelector(
  'alert-close-context-menu-item'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_ENDPOINT_EXCEPTION = getDataTestSubjectSelector(
  'add-endpoint-exception-menu-item'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_RULE_EXCEPTION =
  getDataTestSubjectSelector('add-exception-menu-item');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_RULE_EXCEPTION_FLYOUT_HEADER =
  getDataTestSubjectSelector('exceptionFlyoutTitle');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_RULE_EXCEPTION_FLYOUT_CANCEL_BUTTON =
  getDataTestSubjectSelector('cancelExceptionAddButton');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_ISOLATE_HOST = getDataTestSubjectSelector(
  'isolate-host-action-item'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_RESPOND = getDataTestSubjectSelector(
  'endpointResponseActions-action-item'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_INVESTIGATE_IN_TIMELINE = getDataTestSubjectSelector(
  'investigate-in-timeline-action-item'
);
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_INVESTIGATE_IN_TIMELINE_SECTION =
  getDataTestSubjectSelector('timelineHeader');
export const DOCUMENT_DETAILS_FLYOUT_FOOTER_INVESTIGATE_IN_TIMELINE_ENTRY =
  getDataTestSubjectSelector('providerContainer');
