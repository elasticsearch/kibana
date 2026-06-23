/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import { SECURITY_SOLUTION_DATA_VIEW } from '../../../constants';
import { getDiscoverESQLState } from './utils';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['common', 'timePicker', 'discover', 'svlCommonPage']);
  const queryBar = getService('queryBar');
  const find = getService('find');
  const retry = getService('retry');

  describe('security document profile', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsViewer();
    });

    describe('row indicators', () => {
      describe('alerts and events', () => {
        before(async () => {
          await PageObjects.svlCommonPage.loginWithRole('platform_engineer');
          await PageObjects.common.navigateToApp('security', {
            path: 'alerts',
          });
        });

        describe('DataView mode', () => {
          it('should have row indicator for both event and alert', async () => {
            await PageObjects.common.navigateToActualUrl('discover', undefined, {
              ensureCurrentUrl: false,
            });
            await PageObjects.discover.selectIndexPattern(SECURITY_SOLUTION_DATA_VIEW);

            await queryBar.clickQuerySubmitButton();
            await PageObjects.discover.waitUntilSearchingHasFinished();

            expect(
              await find.existsByCssSelector(
                '[data-test-subj="unifiedDataTableRowColorIndicatorCell"][title="alert"]'
              )
            ).to.eql(true);
            expect(
              await find.existsByCssSelector(
                '[data-test-subj="unifiedDataTableRowColorIndicatorCell"][title="event"]'
              )
            ).to.eql(true);
          });
        });

        describe('ES|QL mode', () => {
          it('should have row indicator for both event and alert', async () => {
            // Use a targeted FROM clause with only the two indices that exist in the test
            // environment. The full SECURITY_SOLUTION_INDEX_PATTERN includes many patterns
            // (apm-*, endgame-*, winlogbeat-*, etc.) that may not exist, causing ES|QL to
            // fail the entire query. Querying just the alerts index and auditbeat covers both
            // row indicator cases (event.kind == "signal" → alert, everything else → event).
            const state = getDiscoverESQLState(
              'FROM .alerts-security.alerts-default, auditbeat-* | WHERE host.name == "siem-kibana"'
            );
            await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
              ensureCurrentUrl: false,
            });

            await PageObjects.discover.waitUntilSearchingHasFinished();

            // Retry to allow the data grid row indicators to fully render after the search
            // completes. The loading spinner disappears before React finishes painting rows.
            await retry.try(async () => {
              expect(
                await find.existsByCssSelector(
                  '[data-test-subj="unifiedDataTableRowColorIndicatorCell"][title="alert"]'
                )
              ).to.eql(true);
              expect(
                await find.existsByCssSelector(
                  '[data-test-subj="unifiedDataTableRowColorIndicatorCell"][title="event"]'
                )
              ).to.eql(true);
            });
          });
        });
      });
    });
  });
}
