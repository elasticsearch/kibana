/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FIELDS_BROWSER_BTN } from '../../../screens/rule_details';
import { getNewRule } from '../../../objects/rule';
import {
  ALERT_RENDERER_HOST_NAME,
  EVENT_SUMMARY_ALERT_RENDERER_CONTENT,
  EVENT_SUMMARY_COLUMN,
  HOVER_ACTIONS,
  SHOW_TOP_N_DROPDOWN,
  SHOW_TOP_N_DROPDOWN_ALERT_OPTION,
  SHOW_TOP_N_HEADER,
} from '../../../screens/alerts';
import {
  DATA_GRID_COLUMN_ORDER_BTN,
  DATA_GRID_FIELD_SORT_BTN,
} from '../../../screens/common/data_grid';
import {
  showHoverActionsEventRenderedView,
  switchAlertTableToEventRenderedView,
  waitForAlerts,
} from '../../../tasks/alerts';
import { createRule } from '../../../tasks/api_calls/rules';
import { deleteAlertsAndRules } from '../../../tasks/api_calls/common';
import { login } from '../../../tasks/login';
import { visit } from '../../../tasks/navigation';
import { ALERTS_URL } from '../../../urls/navigation';
import {
  TOP_N_ALERT_HISTOGRAM,
  TOP_N_CONTAINER_CLOSE_BTN,
  XY_CHART,
} from '../../../screens/shared';

describe(`Event Rendered View`, { tags: ['@ess', '@serverless'] }, () => {
  beforeEach(() => {
    deleteAlertsAndRules();
    login();
    createRule(getNewRule());
    // Set up intercept before visiting the page so it captures all search
    // requests, including those triggered by switchAlertTableToEventRenderedView.
    // This avoids a race condition where the request completes before the alias
    // is registered, causing cy.wait('@alertsSearch') to time out.
    cy.intercept('POST', '/internal/search/privateRuleRegistryAlertsSearchStrategy').as(
      'alertsSearch'
    );
    visit(ALERTS_URL);
    waitForAlerts();
    switchAlertTableToEventRenderedView();
    cy.wait('@alertsSearch');
    waitForAlerts();
  });

  it('should show Event Summary column correctly', () => {
    cy.get(EVENT_SUMMARY_COLUMN).should('be.visible');
    cy.get(EVENT_SUMMARY_ALERT_RENDERER_CONTENT).should('be.visible');
  });

  it('should show TopN in Event Summary column', () => {
    showHoverActionsEventRenderedView(ALERT_RENDERER_HOST_NAME);
    cy.get(HOVER_ACTIONS.SHOW_TOP).trigger('click');
    cy.get(SHOW_TOP_N_HEADER).first().should('have.text', 'Top host.name');
    cy.get(SHOW_TOP_N_DROPDOWN).click();
    cy.get(SHOW_TOP_N_DROPDOWN_ALERT_OPTION).click();
    cy.get(TOP_N_ALERT_HISTOGRAM).should('be.visible');
    cy.get(XY_CHART).should('be.visible');
    cy.get(TOP_N_CONTAINER_CLOSE_BTN).trigger('click');
    cy.get(XY_CHART).should('not.exist');
  });

  /*
   *
   * Alert table is third party component which cannot be easily tested by jest.
   * This test main checks if Alert Table controls are rendered properly.
   *
   * */
  it('should not show Field Browser', () => {
    cy.get(FIELDS_BROWSER_BTN).should('not.exist');
  });

  it('should now show Sorting Control', () => {
    cy.get(DATA_GRID_FIELD_SORT_BTN).should('not.exist');
  });

  it('should not show column order control', () => {
    cy.get(DATA_GRID_COLUMN_ORDER_BTN).should('not.exist');
  });
});
