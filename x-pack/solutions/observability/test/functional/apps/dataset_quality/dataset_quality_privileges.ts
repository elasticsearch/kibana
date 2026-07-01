/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { DatasetQualityFtrProviderContext } from './config';
import { datasetNames, defaultNamespace, getInitialTestLogs, getLogsForDataset } from './data';
import {
  createDatasetQualityUserWithRole,
  deleteDatasetQualityUserWithRole,
} from './roles/role_management';
import { waitUntilDatasetQualityTableOrTimeoutWithFallback } from './helpers';

export default function ({ getService, getPageObjects }: DatasetQualityFtrProviderContext) {
  const PageObjects = getPageObjects([
    'common',
    'security',
    'navigationalSearch',
    'observabilityLogsExplorer',
    'datasetQuality',
  ]);
  const security = getService('security');
  const synthtrace = getService('logSynthtraceEsClient');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const logger = getService('log');

  const to = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString();

  const apacheAccessDatasetName = 'apache.access';
  const apacheAccessDatasetHumanName = 'Apache access logs';
  const regularDataStreamName = `logs-${datasetNames[0]}-${defaultNamespace}`;
  const apacheAccessDataStreamName = `logs-${apacheAccessDatasetName}-${defaultNamespace}`;

  describe('Dataset quality handles user privileges', () => {
    before(async () => {
      await PageObjects.observabilityLogsExplorer.setupInitialIntegrations();
    });

    after(async () => {
      await PageObjects.observabilityLogsExplorer.removeInstalledPackages();
    });

    describe('User cannot read any logs-*', () => {
      before(async () => {
        // Index logs for synth-* and apache.access datasets
        await synthtrace.index(getInitialTestLogs({ to, count: 4 }));

        await createDatasetQualityUserWithRole(security, 'noAccess');

        // Logout in order to re-login with a different user
        await PageObjects.security.forceLogout();
        await PageObjects.security.login('noAccess', 'noAccess-password', {
          expectSpaceSelector: false,
        });

        await PageObjects.datasetQuality.navigateTo();
      });

      after(async () => {
        await synthtrace.clean();

        // Cleanup the user and role
        await PageObjects.security.forceLogout();
        await deleteDatasetQualityUserWithRole(security, 'noAccess');
      });

      it('shows empty state as user cannot read any dataset', async () => {
        // Existence of `datasetQualityNoPrivilegesEmptyState` cannot be asserted as without the logs-*-* read privilege,
        // only the management home screen is shown
        await testSubjects.existOrFail(
          PageObjects.datasetQuality.testSubjectSelectors.managementHome
        );
      });
    });

    describe('User has access to dataset quality with limited privileges', () => {
      before(async () => {
        await createDatasetQualityUserWithRole(security, 'fullAccess', []);

        await PageObjects.security.login('fullAccess', 'fullAccess-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        // Cleanup the user and role
        await PageObjects.security.forceLogout();
        await deleteDatasetQualityUserWithRole(security, 'fullAccess');
      });

      describe('User cannot monitor any data stream', () => {
        before(async function () {
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );
        });
        after(async () => {
          // Cleanup the user and role
          await PageObjects.security.forceLogout();
          await deleteDatasetQualityUserWithRole(security, 'fullAccess');
        });

        it('user has access to dataset quality app but cannot read any dataset', async () => {
          await testSubjects.existOrFail(
            PageObjects.datasetQuality.testSubjectSelectors.datasetQualityNoPrivilegesEmptyState
          );
        });
      });

      describe('User has access to a single data stream', () => {
        before(async function () {
          await createDatasetQualityUserWithRole(security, 'fullAccess', [
            { names: ['metrics-*'], privileges: ['read', 'view_index_metadata'] },
          ]);

          await PageObjects.security.login('fullAccess', 'fullAccess-password', {
            expectSpaceSelector: false,
          });
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );
        });

        after(async () => {
          // Cleanup the user and role
          await PageObjects.security.forceLogout();
          await deleteDatasetQualityUserWithRole(security, 'fullAccess');
        });

        it('should still be able to navigate and use the dataset quality app', async () => {
          await testSubjects.missingOrFail(
            PageObjects.datasetQuality.testSubjectSelectors.datasetQualityNoPrivilegesEmptyState
          );
        });

        it('types filter should not be rendered', async () => {
          await testSubjects.missingOrFail(
            PageObjects.datasetQuality.testSubjectSelectors.datasetQualityTypesSelectableButton
          );
        });
      });

      describe('User has access to a multiple data streams', () => {
        before(async function () {
          await createDatasetQualityUserWithRole(security, 'fullAccess', [
            { names: ['logs-*'], privileges: ['read', 'view_index_metadata'] },
            { names: ['metrics-*'], privileges: ['read', 'view_index_metadata'] },
          ]);

          await PageObjects.security.login('fullAccess', 'fullAccess-password', {
            expectSpaceSelector: false,
          });
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );
        });

        it('types filter should be rendered', async () => {
          await testSubjects.existOrFail(
            PageObjects.datasetQuality.testSubjectSelectors.datasetQualityTypesSelectableButton
          );
        });
      });
    });

    describe('User can read logs-*', () => {
      before(async () => {
        await createDatasetQualityUserWithRole(security, 'fullAccess', [
          { names: ['logs-*'], privileges: ['read', 'view_index_metadata'] },
          { names: ['logs-synth*'], privileges: ['read'] }, // No monitor privilege
          { names: ['logs-apache*'], privileges: ['monitor'] },
        ]);

        // Logout in order to re-login with a different user
        await PageObjects.security.forceLogout();
        await PageObjects.security.login('fullAccess', 'fullAccess-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        // Cleanup the user and role
        await PageObjects.security.forceLogout();
        await deleteDatasetQualityUserWithRole(security, 'fullAccess');
      });

      describe('User cannot monitor any data stream', () => {
        before(async function () {
          // Index logs for synth-* and apache.access datasets
          await synthtrace.index(getInitialTestLogs({ to, count: 4 }));

          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );
        });

        after(async () => {
          await synthtrace.clean();
        });

        it('Estimated data are not available due to underprivileged user', async () => {
          await testSubjects.existOrFail(
            `${PageObjects.datasetQuality.testSubjectSelectors.datasetQualityInsufficientPrivileges}-${PageObjects.datasetQuality.texts.estimatedData}`,
            /**
             * This test was failing periodically because of
             * poor network conditions in the CI.
             * In those cases the default timeout of 2 minutes
             * was not enough to properly load the UI and pass the test.
             */
            { timeout: 240000 }
          );
        });

        it('does not show size column for underprivileged data stream', async () => {
          const cols = await PageObjects.datasetQuality.getDatasetTableHeaderTexts();

          expect(cols).to.not.contain('Size');
        });
      });

      describe('User can monitor some data streams', function () {
        // This disables the forward-compatibility test for Elasticsearch 8.19 with Kibana and ES 9.0.
        // These versions are not expected to work together. Note: Failure store is not available in ES 9.0,
        // and running these tests will result in an "unknown index privilege [read_failure_store]" error.
        this.onlyEsVersion('8.19 || >=9.1');

        before(async () => {
          // Index logs for synth-* and apache.access datasets
          await synthtrace.index(getInitialTestLogs({ to, count: 4 }));
          await synthtrace.index(
            getLogsForDataset({ to, count: 10, dataset: apacheAccessDatasetName })
          );
        });

        after(async () => {
          await synthtrace.clean();
        });

        it('shows underprivileged warning when size cannot be accessed for some data streams', async function () {
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );

          await PageObjects.datasetQuality.refreshTable();

          const datasetWithMonitorPrivilege = apacheAccessDatasetHumanName;
          const datasetWithoutMonitorPrivilege = 'synth.1';

          await retry.tryForTime(10000, async () => {
            // "Size" should be available for `apacheAccessDatasetName`
            await testSubjects.missingOrFail(
              `${PageObjects.datasetQuality.testSubjectSelectors.datasetQualityInsufficientPrivileges}-sizeBytes-${datasetWithMonitorPrivilege}`
            );
            // "Size" should not be available for `datasetWithoutMonitorPrivilege`
            await testSubjects.existOrFail(
              `${PageObjects.datasetQuality.testSubjectSelectors.datasetQualityInsufficientPrivileges}-sizeBytes-${datasetWithoutMonitorPrivilege}`
            );
          });
        });

        it('Details page shows insufficient privileges warning for underprivileged data stream', async function () {
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );

          await PageObjects.datasetQuality.navigateToDetails({
            dataStream: regularDataStreamName,
          });

          await testSubjects.existOrFail(
            `${PageObjects.datasetQuality.testSubjectSelectors.datasetQualityInsufficientPrivileges}-Size`
          );

          await PageObjects.datasetQuality.navigateTo();
        });

        it('"View dashboards" is hidden for underprivileged user', async function () {
          await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
            this.skip()
          );

          await PageObjects.datasetQuality.navigateToDetails({
            dataStream: apacheAccessDataStreamName,
          });
          await PageObjects.datasetQuality.openIntegrationActionsMenu();

          // "View Dashboards" is hidden
          await testSubjects.missingOrFail(
            PageObjects.datasetQuality.testSubjectSelectors.datasetQualityDetailsIntegrationAction(
              'ViewDashboards'
            )
          );

          await PageObjects.datasetQuality.navigateTo();
        });
      });
    });

    // A role built with a Lucene complement (negated) index pattern that excludes
    // `logs-apache*` can still read the other logs data streams. The wildcard
    // `logs-*-*` privilege check fails for such a role, but the page must remain
    // usable and list the accessible datasets while omitting the negated ones.
    describe('User has a negated index pattern role', function () {
      // Failure store privileges are not available in ES 9.0, which the server
      // privilege check requests; this mirrors the guard used by sibling suites.
      this.onlyEsVersion('8.19 || >=9.1');

      before(async () => {
        // Index logs for synth-* (accessible) and apache.access (negated) datasets
        await synthtrace.index(getInitialTestLogs({ to, count: 4 }));
        await synthtrace.index(
          getLogsForDataset({ to, count: 4, dataset: apacheAccessDatasetName })
        );

        await createDatasetQualityUserWithRole(security, 'fullAccess', [
          {
            names: ['/~(([.]|ilm-history-|logs-apache).*)/'],
            privileges: ['read', 'monitor', 'view_index_metadata'],
          },
        ]);

        // Logout in order to re-login with a different user
        await PageObjects.security.forceLogout();
        await PageObjects.security.login('fullAccess', 'fullAccess-password', {
          expectSpaceSelector: false,
        });

        await PageObjects.datasetQuality.navigateTo();
      });

      after(async () => {
        await synthtrace.clean();
        await PageObjects.security.forceLogout();
        await deleteDatasetQualityUserWithRole(security, 'fullAccess');
      });

      it('lists accessible datasets and omits negated ones despite the wildcard check failing', async function () {
        await waitUntilDatasetQualityTableOrTimeoutWithFallback(PageObjects, logger, () =>
          this.skip()
        );

        // The page is usable: the no-privileges empty state is not shown.
        await testSubjects.missingOrFail(
          PageObjects.datasetQuality.testSubjectSelectors.datasetQualityNoPrivilegesEmptyState
        );

        const cols = await PageObjects.datasetQuality.parseDatasetTable();
        const datasetNameCol = cols[PageObjects.datasetQuality.texts.datasetNameColumn];
        const datasetNameColCellTexts = await datasetNameCol.getCellTexts();

        // Accessible synth datasets are listed.
        expect(datasetNameColCellTexts).to.contain(datasetNames[0]);

        // The negated `logs-apache*` dataset is not listed.
        expect(datasetNameColCellTexts).to.not.contain(apacheAccessDatasetName);
        expect(datasetNameColCellTexts).to.not.contain(apacheAccessDatasetHumanName);
      });
    });
  });
}
