/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  WATCHLISTS_PRIVILEGES_URL,
  WATCHLISTS_URL,
} from '@kbn/security-solution-plugin/common/entity_analytics/watchlists/constants';
import { visit } from '../../../tasks/navigation';
import { login } from '../../../tasks/login';
import { ENTITY_ANALYTICS_MANAGEMENT_URL } from '../../../urls/navigation';
import { WATCHLISTS_MANAGEMENT_TABLE } from '../../../screens/entity_analytics/watchlists_management';

const ENTITY_ANALYTICS_WATCHLISTS_TAB_URL = `${ENTITY_ANALYTICS_MANAGEMENT_URL}/watchlists`;

describe(
  'Watchlist index source API key warning',
  {
    tags: ['@ess', '@serverless'],
  },
  () => {
    const WATCHLIST_ID = 'watchlist-1';
    const SOURCE_ID = 'source-1';

    const buildWatchlist = (overrides = {}) => ({
      id: WATCHLIST_ID,
      name: 'Test watchlist',
      description: 'Test watchlist description',
      users: [{ name: 'user-1' }],
      riskModifier: 1.5,
      source: 'manual',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    });

    const buildIndexSource = (overrides = {}) => ({
      id: SOURCE_ID,
      type: 'index',
      name: 'my-index-source',
      indexPattern: 'logs-*',
      identifierField: 'user.name',
      enabled: true,
      range: { start: 'now-10d', end: 'now' },
      ...overrides,
    });

    beforeEach(() => {
      login();
      cy.intercept('GET', WATCHLISTS_PRIVILEGES_URL, {
        statusCode: 200,
        body: {
          has_all_required: true,
          has_read_permissions: true,
          has_write_permissions: true,
          privileges: { elasticsearch: { cluster: {}, index: {} }, kibana: {} },
        },
      }).as('watchlistsPrivileges');
    });

    describe('when an index source is missing its API key', () => {
      beforeEach(() => {
        cy.intercept('GET', `${WATCHLISTS_URL}/list`, {
          statusCode: 200,
          body: [buildWatchlist()],
        }).as('watchlistsList');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}`, {
          statusCode: 200,
          body: buildWatchlist(),
        }).as('getWatchlist');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/list`, {
          statusCode: 200,
          body: { sources: [buildIndexSource({ apiKeyId: undefined })] },
        }).as('entitySources');

        visit(ENTITY_ANALYTICS_WATCHLISTS_TAB_URL);
        cy.get(WATCHLISTS_MANAGEMENT_TABLE).should('exist');
        cy.get('[aria-label="Edit watchlist"]').click();
        cy.wait('@getWatchlist');
        cy.wait('@entitySources');
      });

      it('shows the missing API key warning callout in the flyout', () => {
        cy.contains('Sync paused — re-authorization required').should('exist');
        cy.contains('This data source is not authorized to read from the configured index').should(
          'exist'
        );
      });

      it('shows the Re-authorize button inside the warning callout', () => {
        cy.contains('button', 'Re-authorize').should('exist');
      });

      it('calls the update entity source API when Re-authorize is clicked', () => {
        cy.intercept(
          'PUT',
          `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/${SOURCE_ID}`,
          (req) => {
            expect(req.body).to.deep.include({ type: 'index' });
            req.reply({ statusCode: 200, body: buildIndexSource({ apiKeyId: 'new-kid' }) });
          }
        ).as('reauthorize');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/list`, {
          statusCode: 200,
          body: { sources: [buildIndexSource({ apiKeyId: 'new-kid' })] },
        }).as('entitySourcesRefreshed');

        cy.contains('button', 'Re-authorize').click();
        cy.wait('@reauthorize');
      });

      it('hides the warning callout after re-authorization succeeds', () => {
        cy.intercept('PUT', `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/${SOURCE_ID}`, {
          statusCode: 200,
          body: buildIndexSource({ apiKeyId: 'new-kid' }),
        }).as('reauthorize');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/list`, {
          statusCode: 200,
          body: { sources: [buildIndexSource({ apiKeyId: 'new-kid' })] },
        }).as('entitySourcesRefreshed');

        cy.contains('button', 'Re-authorize').click();
        cy.wait('@reauthorize');
        cy.wait('@entitySourcesRefreshed');
        cy.contains('Sync paused — re-authorization required').should('not.exist');
      });
    });

    describe('when all index sources have a valid API key', () => {
      beforeEach(() => {
        cy.intercept('GET', `${WATCHLISTS_URL}/list`, {
          statusCode: 200,
          body: [buildWatchlist()],
        }).as('watchlistsList');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}`, {
          statusCode: 200,
          body: buildWatchlist(),
        }).as('getWatchlist');

        cy.intercept('GET', `${WATCHLISTS_URL}/${WATCHLIST_ID}/entity_source/list`, {
          statusCode: 200,
          body: { sources: [buildIndexSource({ apiKeyId: 'kid-1' })] },
        }).as('entitySources');

        visit(ENTITY_ANALYTICS_WATCHLISTS_TAB_URL);
        cy.get(WATCHLISTS_MANAGEMENT_TABLE).should('exist');
        cy.get('[aria-label="Edit watchlist"]').click();
        cy.wait('@getWatchlist');
        cy.wait('@entitySources');
      });

      it('does not show the missing API key warning callout', () => {
        cy.contains('Sync paused — re-authorization required').should('not.exist');
      });
    });
  }
);
