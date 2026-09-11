/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EXPAND_ALERT_BTN as TIMELINE_EXPAND_ALERT_BTN } from '../../screens/timeline';
import { EXPAND_ALERT_BTN as ALERTS_TABLE_EXPAND_ALERT_BTN } from '../../screens/alerts';
import { DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_CASE } from '../../screens/expandable_flyout/alert_details_right_panel';
import {
  CREATE_NEW_CASE_FROM_MODAL_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_CREATE_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_DESCRIPTION_INPUT,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_NAME_INPUT,
  VIEW_CASE_TOASTER_CLOSE_BUTTON,
  VIEW_CASE_TOASTER_LINK,
} from '../../screens/expandable_flyout/common';
import { openTakeActionButtonAndSelectItem } from './alert_details_right_panel';

/**
 * Find the alert row at index in the alerts table then click on the expand icon button to open the flyout
 */
export const expandAlertAtIndexExpandableFlyout = (index = 0) => {
  cy.get(ALERTS_TABLE_EXPAND_ALERT_BTN).eq(index).click();
};
/**
 * Find the alert row at index in the timeline table then click on the expand icon button to open the flyout
 */
export const expandAlertInTimelineAtIndexExpandableFlyout = (index = 0) => {
  cy.get(TIMELINE_EXPAND_ALERT_BTN).eq(index).click();
};

/**
 * create a new case from the expanded expandable flyout
 */
export const createNewCaseFromExpandableFlyout = () => {
  openTakeActionButtonAndSelectItem(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_CASE);
  cy.get(CREATE_NEW_CASE_FROM_MODAL_BUTTON).click();
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_NAME_INPUT).type('case');
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_DESCRIPTION_INPUT).type('case description');
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_CREATE_BUTTON).click();

  // NOTE: wait for case link (case created)
  cy.get(VIEW_CASE_TOASTER_LINK).should('be.visible');

  // NOTE: close pop up to limit interaction with flyout behind
  cy.get(VIEW_CASE_TOASTER_CLOSE_BUTTON).click();
};
