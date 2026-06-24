/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { ROLES } from '@kbn/security-solution-plugin/common/test';

import { getTimeline } from '../../../objects/timeline';

import {
  // NOTES_TEXT,

  TIMELINE_FLYOUT_WRAPPER,
  TIMELINE_QUERY,
  TIMELINE_PANEL,
  TIMELINE_STATUS,
  // TIMELINE_TAB_CONTENT_GRAPHS_NOTES,
  SAVE_TIMELINE_ACTION_BTN,
  SAVE_TIMELINE_TOOLTIP,
} from '../../../screens/timeline';
import { ROWS } from '../../../screens/timelines';
import {
  createTimelineTemplate,
  deleteTimelines,
  deleteTimelineTemplates,
} from '../../../tasks/api_calls/timelines';

import { login } from '../../../tasks/login';
import { visit, visitWithTimeRange } from '../../../tasks/navigation';
import { openTimelineUsingToggle } from '../../../tasks/security_main';
import { selectCustomTemplates } from '../../../tasks/templates';
import {
  addNameAndDescriptionToTimeline,
  // addNotesToTimeline,
  clickingOnCreateTimelineFormTemplateBtn,
  closeTimeline,
  createNewTimeline,
  executeTimelineKQL,
  expandEventAction,
  addNameToTimelineAndSave,
  addNameToTimelineAndSaveAsNew,
} from '../../../tasks/timeline';
import { waitForTimelinesPanelToBeLoaded } from '../../../tasks/timelines';

import { OVERVIEW_URL, TIMELINE_TEMPLATES_URL, TIMELINES_URL } from '../../../urls/navigation';

const mockTimeline = getTimeline();

describe('Timelines', { tags: ['@ess', '@serverless'] }, (): void => {
  beforeEach(() => {
    deleteTimelines();
    deleteTimelineTemplates();
  });

  it('should create a timeline from a template and should have the same query and open the timeline modal', () => {
    login();
    createTimelineTemplate();
    visit(TIMELINE_TEMPLATES_URL);
    selectCustomTemplates();
    expandEventAction();
    clickingOnCreateTimelineFormTemplateBtn();
    cy.get(TIMELINE_FLYOUT_WRAPPER).should('have.css', 'visibility', 'visible');
    cy.get(TIMELINE_QUERY).should('have.text', mockTimeline.query);
  });

  it('should be able to create timeline with crud privileges', () => {
    login();
    visitWithTimeRange(OVERVIEW_URL);
    openTimelineUsingToggle();
    createNewTimeline();
    addNameAndDescriptionToTimeline(mockTimeline);
    cy.get(TIMELINE_PANEL).should('be.visible');
  });

  it('should not be able to create/update timeline with only read privileges', () => {
    login(ROLES.t1_analyst);
    visitWithTimeRange(TIMELINES_URL);
    waitForTimelinesPanelToBeLoaded();
    openTimelineUsingToggle();
    createNewTimeline();
    cy.get(TIMELINE_PANEL).should('be.visible');
    cy.get(SAVE_TIMELINE_ACTION_BTN).should('be.disabled');
    cy.get(SAVE_TIMELINE_ACTION_BTN).first().realHover();
    cy.get(SAVE_TIMELINE_TOOLTIP).should('be.visible');
    cy.get(SAVE_TIMELINE_TOOLTIP).should(
      'have.text',
      'You can use Timeline to investigate events, but you do not have the required permissions to save timelines for future use. If you need to save timelines, contact your Kibana administrator.'
    );
  });

  it('should show the different timeline states', () => {
    login();
    visitWithTimeRange(TIMELINES_URL);
    openTimelineUsingToggle();

    // Unsaved
    cy.get(TIMELINE_PANEL).should('be.visible');
    cy.get(TIMELINE_STATUS).should('be.visible');
    cy.get(TIMELINE_STATUS)
      .invoke('text')
      .should('match', /^Unsaved/);

    addNameToTimelineAndSave('Test');

    // Saved
    cy.get(TIMELINE_STATUS).should('not.exist');

    executeTimelineKQL('agent.name : *');

    // Saved but has unsaved changes
    cy.get(TIMELINE_STATUS).should('be.visible');
    cy.get(TIMELINE_STATUS)
      .invoke('text')
      .should('match', /^Unsaved changes/);
  });

  it('should save timelines as new', () => {
    login();
    visitWithTimeRange(TIMELINES_URL);
    cy.get(ROWS).should('have.length', '0');

    openTimelineUsingToggle();
    addNameToTimelineAndSave('First');

    addNameToTimelineAndSaveAsNew('Second');
    closeTimeline();

    cy.get(ROWS).should('have.length', '2');
    cy.get(ROWS)
      .first()
      .invoke('text')
      .should('match', /Second/);
    cy.get(ROWS).last().invoke('text').should('match', /First/);
  });
});
