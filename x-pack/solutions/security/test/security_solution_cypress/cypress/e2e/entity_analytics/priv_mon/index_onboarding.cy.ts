/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ONBOARDING_CALLOUT } from '../../../screens/privileged_user_monitoring';
import { createDocument, createIndex, deleteIndex } from '../../../tasks/api_calls/elasticsearch';

import { login } from '../../../tasks/login';
import { visit } from '../../../tasks/navigation';
import {
  clickFileUploaderUpdateButton,
  deletePrivMonEngine,
  openIndexPicker,
  expandIndexPickerOptions,
  selectIndexPickerOption,
  openCreateIndexModal,
  clickCreateIndexButton,
  typeIndexName,
  closeIndexPicker,
} from '../../../tasks/privileged_user_monitoring';
import { ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_URL } from '../../../urls/navigation';

const sourceIndexName = 'test_index';

describe(
  'Privileged User Monitoring - Index onboarding',
  {
    tags: ['@ess'],
    env: {
      ftrConfig: {
        kbnServerArgs: [
          `--xpack.securitySolution.enableExperimental=${JSON.stringify([
            'disable:entityAnalyticsEntityStoreV2',
            'disable:entityAnalyticsWatchlistEnabled',
            'disable:entityAnalyticsNewHomePageEnabled',
          ])}`,
          '--uiSettings.overrides.securitySolution:entityStoreEnableV2=false',
        ],
      },
    },
  },
  () => {
    before(() => {
      cy.task('esArchiverLoad', { archiveName: 'linux_process' });
      deletePrivMonEngine(); // Just in case another test left it behind
      deleteIndex(sourceIndexName); // and in case another spec leaked the shared index name

      createIndex(sourceIndexName, {
        user: {
          properties: {
            name: {
              type: 'keyword',
            },
          },
        },
      });

      createDocument(sourceIndexName, {
        user: {
          name: 'testUser',
        },
      });
    });

    beforeEach(() => {
      login();
    });

    afterEach(() => {
      deletePrivMonEngine();
    });

    after(() => {
      cy.task('esArchiverUnload', { archiveName: 'linux_process' });
      deleteIndex(sourceIndexName);
    });

    it('starts the engine with an index containing a valid user', () => {
      visit(ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_URL);

      openIndexPicker();
      expandIndexPickerOptions();
      selectIndexPickerOption(sourceIndexName);
      // the commbobox is in multi selection mode, it doesn't close on selection alone
      // and the update button might be hidden under the popover
      closeIndexPicker();
      clickFileUploaderUpdateButton();

      cy.get(ONBOARDING_CALLOUT).should('contain.text', 'Privileged user monitoring set up');
    });

    it('creates a new index and starts the engine', () => {
      const newIndex = 'new_index';
      visit(ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_URL);

      openIndexPicker();
      openCreateIndexModal();
      typeIndexName(newIndex);
      clickCreateIndexButton();
      clickFileUploaderUpdateButton();

      cy.get(ONBOARDING_CALLOUT).should('contain.text', 'Privileged user monitoring set up');

      deleteIndex(newIndex); // delete the created index after the test
    });
  }
);
