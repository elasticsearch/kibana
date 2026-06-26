/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { login } from '../../../tasks/login';
import { visit } from '../../../tasks/navigation';
import { ENTITY_ANALYTICS_HOME_PAGE_URL } from '../../../urls/navigation';
import {
  PAGE_TITLE,
  COMBINED_RISK_DONUT_CHART,
  ANOMALIES_PLACEHOLDER_PANEL,
  ENTITIES_TABLE_GRID,
  TIMELINE_ACTION,
} from '../../../screens/entity_analytics/entity_analytics_home';
import { interceptEntityStoreStatus } from '../../../tasks/entity_analytics/entity_analytics_home';

describe(
  'Entity Analytics page',
  {
    tags: ['@ess'],
    env: {
      ftrConfig: {
        kbnServerArgs: [
          `--xpack.securitySolution.enableExperimental=${JSON.stringify([
            'entityAnalyticsNewHomePageEnabled',
          ])}`,
          '--uiSettings.overrides.securitySolution:entityStoreEnableV2=true',
        ],
      },
    },
  },
  () => {
    before(() => {
      cy.task('esArchiverLoad', { archiveName: 'entity_store_v2_home' });
    });

    beforeEach(() => {
      interceptEntityStoreStatus('running');
      login();
      // Set grouping to "none" so the flat EntitiesDataTable renders.
      // Default "Resolution" grouping renders GroupWrapper, which doesn't
      // contain the ENTITIES_TABLE_GRID or TIMELINE_ACTION test subjects.
      cy.window().then((win) =>
        win.localStorage.setItem(
          'groups',
          JSON.stringify({ 'entityAnalytics:grouping': { activeGroups: ['none'] } })
        )
      );
      visit(ENTITY_ANALYTICS_HOME_PAGE_URL);
      cy.wait('@entityStoreStatus', { timeout: 20000 });
    });

    after(() => {
      cy.task('esArchiverUnload', { archiveName: 'entity_store_v2_home' });
    });

    it('renders page as expected', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get('h1').contains('Entity analytics').should('be.visible');
    });

    it('renders KQL search bar', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get('[data-test-subj="globalQueryBar"]').should('be.visible');
    });

    it('renders combined risk donut chart', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get(COMBINED_RISK_DONUT_CHART).should('be.visible');
    });

    it('renders anomalies placeholder panel', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get(ANOMALIES_PLACEHOLDER_PANEL).should('be.visible');
      cy.get(ANOMALIES_PLACEHOLDER_PANEL).contains('Recent anomalies');
    });

    it('renders entities table', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get(ENTITIES_TABLE_GRID).should('exist');
    });

    it('displays timeline action icons in the data grid', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get(ENTITIES_TABLE_GRID).should('exist');

      cy.get(TIMELINE_ACTION).should('have.length.at.least', 1);
    });

    it('can interact with timeline action icon', () => {
      cy.get(PAGE_TITLE).should('exist');
      cy.get(ENTITIES_TABLE_GRID).should('exist');

      cy.get(TIMELINE_ACTION).first().should('be.visible');
      cy.get(TIMELINE_ACTION).first().click();
    });
  }
);
