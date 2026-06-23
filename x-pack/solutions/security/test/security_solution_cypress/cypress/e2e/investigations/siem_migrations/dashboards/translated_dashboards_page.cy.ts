/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SUCCESS_TOASTER_BODY,
  SUCCESS_TOASTER_HEADER,
} from '../../../../screens/alerts_detection_rules';
import {
  DASHBOARD_MIGRATION_PROGRESS_BAR,
  DASHBOARD_MIGRATION_PROGRESS_BAR_TEXT,
  TRANSLATED_DASHBOARDS_RESULT_TABLE,
} from '../../../../screens/siem_migrations';
import { deleteConnectors } from '../../../../tasks/api_calls/common';
import { suppressGlobalAnnouncements } from '../../../../tasks/api_calls/suppress_global_announcements';
import { createBedrockConnector } from '../../../../tasks/api_calls/connectors';
import { visit } from '../../../../tasks/navigation';
import {
  goToTranslatedDashboardsPageFromOnboarding,
  openReprocessDialog,
  reprocessDashboards,
  selectMigrationConnector,
} from '../../../../tasks/siem_migrations';
import { GET_STARTED_URL } from '../../../../urls/navigation';
import { role } from '../common/role';

let bedrockConnectorId: string | null = null;

// TODO: https://github.com/elastic/kibana/issues/228940 remove @skipInServerlessMKI tag when privileges issue is fixed
// FLAKY: https://github.com/elastic/kibana/issues/242870
describe.skip(
  'Dashboard Migrations - Translated Dashboards Page',
  { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] },

  () => {
    before(() => {
      role.setup();
    });

    beforeEach(() => {
      deleteConnectors();
      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/dashboards/items',
      });

      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/dashboards/migrations',
      });

      cy.waitUntil(
        () => {
          return createBedrockConnector()
            .then((response) => {
              bedrockConnectorId = response.body.id;
            })
            .then(() => true);
        },
        { interval: 500, timeout: 12000 }
      );

      role.login();
      suppressGlobalAnnouncements();
      visit(`${GET_STARTED_URL}/siem_migrations`);
      selectMigrationConnector();
      goToTranslatedDashboardsPageFromOnboarding();
    });

    after(() => {
      role.teardown();

      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/dashboards/items',
      });

      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/dashboards/migrations',
      });
    });

    it('should be able to see the result of the completed migration', () => {
      cy.get(TRANSLATED_DASHBOARDS_RESULT_TABLE.ROWS).should('have.length', 7);
      cy.get(TRANSLATED_DASHBOARDS_RESULT_TABLE.STATUS('full')).should('have.length', 1);
      cy.get(TRANSLATED_DASHBOARDS_RESULT_TABLE.STATUS('partial')).should('have.length', 1);
      cy.get(TRANSLATED_DASHBOARDS_RESULT_TABLE.STATUS('untranslatable')).should('have.length', 2);
      cy.get(TRANSLATED_DASHBOARDS_RESULT_TABLE.STATUS('failed')).should('have.length', 3);
    });

    it('should be able to reprocess a failed Dashboard', () => {
      cy.intercept({
        url: '**/start',
      }).as('reprocessFailedDashboards');
      openReprocessDialog();
      reprocessDashboards();
      cy.wait('@reprocessFailedDashboards')
        .its('request.body.settings')
        .should('have.property', 'connector_id', bedrockConnectorId);
      cy.get(DASHBOARD_MIGRATION_PROGRESS_BAR).should('be.visible');
      cy.get(DASHBOARD_MIGRATION_PROGRESS_BAR_TEXT).should('contain.text', '57%');

      // Shows "Started" migration toast
      cy.get(SUCCESS_TOASTER_HEADER).should('have.text', 'Migration started successfully.');

      // After translation has been finished, shows "Translation completed" toast
      cy.get(SUCCESS_TOASTER_HEADER).should('have.text', 'Dashboards translation complete.');
      cy.get(SUCCESS_TOASTER_BODY).should(
        'have.text',
        'Migration "Test automatic rule migration 1" has finished. Results have been added to the translated dashboards page.Go to translated dashboards'
      );
    });
  }
);
