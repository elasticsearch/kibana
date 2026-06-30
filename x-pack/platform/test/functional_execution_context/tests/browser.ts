/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Ecs, KibanaExecutionContext } from '@kbn/core/server';
import { encode } from '@kbn/rison';
import type { FtrProviderContext } from '../ftr_provider_context';
import { assertLogContains, isExecutionContextLog, readLogFile } from '../test_utils';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects([
    'common',
    'dashboard',
    'discover',
    'header',
    'home',
    'timePicker',
  ]);

  describe('Browser apps', () => {
    let logs: Ecs[];
    let discoverSessionFirstTabId = '';
    const retry = getService('retry');

    const logContains = async ({
      predicate,
      description,
    }: {
      predicate: (record: Ecs) => boolean;
      description: string;
    }) => {
      return retry.try(async () => {
        try {
          await assertLogContains({ logs, predicate, description });
        } catch (err) {
          // if we did not find our predicate in the logs, wait a bit and parse them again
          await new Promise((resolve) => setTimeout(resolve, 10000));
          logs = await readLogFile();
          throw err;
        }
      });
    };
    before(async () => {
      await PageObjects.common.navigateToUrl('home', '/tutorial_directory/sampleData', {
        useActualUrl: true,
      });
      await PageObjects.home.addSampleDataSet('flights');
      await PageObjects.header.waitUntilLoadingHasFinished();
    });

    after(async () => {
      await PageObjects.common.navigateToUrl('home', '/tutorial_directory/sampleData', {
        useActualUrl: true,
      });
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.home.removeSampleDataSet('flights');
    });

    describe('discover app', () => {
      before(async () => {
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.timePicker.setCommonlyUsedTime('Last_7 days');
        await PageObjects.header.waitUntilLoadingHasFinished();
        logs = await readLogFile();
      });

      function checkExecutionContextEntry(expectedExecutionContext: KibanaExecutionContext) {
        return (record: Ecs) =>
          isExecutionContextLog(record, expectedExecutionContext) ||
          isExecutionContextLog(record, {
            ...expectedExecutionContext,
            // There is a race condition that makes these 2 fields to show up some times
            page: 'app',
            id: 'new',
          });
      }

      describe('propagates context for Discover', () => {
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: (record) =>
              Boolean(record.http?.request?.id?.includes('kibana:application:discover')),
          });
        });

        it('propagates to Kibana logs (fetch documents)', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs (fetch documents)',
            predicate: checkExecutionContextEntry({
              type: 'application',
              name: 'discover',
              url: '/app/discover',
              page: 'app',
              id: 'new',
              description: 'fetch documents',
              space: 'default',
            }),
          });
        });

        it('propagates to Kibana logs (fetch chart data and total hits)', async () => {
          await logContains({
            description:
              'execution context propagates to Kibana logs (fetch chart data and total hits)',
            predicate: checkExecutionContextEntry({
              type: 'application',
              name: 'discover',
              url: '/app/discover',
              page: 'app',
              id: 'new',
              description: 'fetch chart data and total hits',
              space: 'default',
              child: {
                type: 'lens',
                name: 'lnsXY',
                id: 'unifiedHistogramLensComponent',
                description: 'Edit visualization',
                url: '/app/lens#/edit_by_value',
              },
            }),
          });
        });
      });
    });

    describe('dashboard app', () => {
      before(async () => {
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.discover.waitForDiscoverAppOnScreen();
        await PageObjects.discover.loadSavedSearch('[Flights] Flight Log');
        await PageObjects.discover.waitUntilTabIsLoaded();
        discoverSessionFirstTabId = (await PageObjects.discover.getFirstTabId()) ?? '';
        await PageObjects.common.navigateToApp('dashboard');
        await PageObjects.dashboard.loadSavedDashboard('[Flights] Global Flight Dashboard');
        await PageObjects.timePicker.setCommonlyUsedTime('Last_7 days');
        await PageObjects.dashboard.waitForRenderComplete();
        await PageObjects.header.waitUntilLoadingHasFinished();
        logs = await readLogFile();
      });

      function checkHttpRequestId(suffix: string) {
        return (record: Ecs): boolean =>
          Boolean(
            [
              'kibana:application:dashboards:7adfa750-4c81-11e8-b3d7-01146121b73d;',
              // Race conditions may miss the dashboard ID at the top level
              'kibana:application:dashboards:;',
              // Race conditions may assign the dashboard type to the top level
              'kibana:dashboard:dashboards:7adfa750-4c81-11e8-b3d7-01146121b73d;',
            ].some((prefix) => record.http?.request?.id?.includes(`${prefix}${suffix}`))
          );
      }

      function checkExecutionContextEntry(expectedExecutionContext: KibanaExecutionContext) {
        return (record: Ecs) =>
          isExecutionContextLog(record, expectedExecutionContext) ||
          isExecutionContextLog(record, { ...expectedExecutionContext, page: 'list' }) ||
          isExecutionContextLog(record, { ...expectedExecutionContext, page: 'app' }) ||
          isExecutionContextLog(record, {
            ...expectedExecutionContext,
            // There is a race condition that makes this field to be missed sometimes
            page: 'app',
            id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
          }) ||
          isExecutionContextLog(record, {
            ...expectedExecutionContext,
            // There is a race condition that makes the top context to match the child one
            page: 'app',
            type: 'dashboard',
            id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
          }) ||
          isExecutionContextLog(record, {
            ...expectedExecutionContext,
            // There is a race condition that makes the top context to match the child one
            page: 'app',
            type: 'dashboard',
            id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
            description: '[Flights] Global Flight Dashboard',
          }) ||
          // Some race conditions misses one nested step
          (!!expectedExecutionContext.child &&
            isExecutionContextLog(record, expectedExecutionContext.child));
      }

      describe('propagates context for Lens visualizations', () => {
        describe('lnsXY', () => {
          it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
            await logContains({
              description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
              predicate: checkHttpRequestId('lens:lnsXY:086ac2e9-dd16-4b45-92b8-1e43ff7e3f65'),
            });
          });

          it('propagates to Kibana logs', async () => {
            await logContains({
              description: 'execution context propagates to Kibana logs',
              predicate: checkExecutionContextEntry({
                type: 'dashboard',
                name: 'dashboards',
                url: '/app/dashboards',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                space: 'default',
                child: {
                  type: 'lens',
                  name: 'lnsXY',
                  id: '086ac2e9-dd16-4b45-92b8-1e43ff7e3f65',
                  description: '[Flights] Flight count',
                  url: '/app/lens#/edit_by_value',
                },
              }),
            });
          });
        });

        describe('lnsMetric', () => {
          it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
            await logContains({
              description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
              predicate: checkHttpRequestId('lens:lnsMetric:b766e3b8-4544-46ed-99e6-9ecc4847e2a2'),
            });
          });

          it('propagates to Kibana logs', async () => {
            await logContains({
              description: 'execution context propagates to Kibana logs',
              predicate: checkExecutionContextEntry({
                type: 'dashboard',
                name: 'dashboards',
                url: '/app/dashboards',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                space: 'default',
                child: {
                  type: 'lens',
                  name: 'lnsMetric',
                  id: 'b766e3b8-4544-46ed-99e6-9ecc4847e2a2',
                  description: '',
                  url: '/app/lens#/edit_by_value',
                },
              }),
            });
          });
        });

        describe('lnsDatatable', () => {
          it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
            await logContains({
              description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
              predicate: checkHttpRequestId(
                'lens:lnsDatatable:fb86b32f-fb7a-45cf-9511-f366fef51bbd'
              ),
            });
          });

          it('propagates to Kibana logs', async () => {
            await logContains({
              description: 'execution context propagates to Kibana logs',
              predicate: checkExecutionContextEntry({
                type: 'dashboard',
                name: 'dashboards',
                url: '/app/dashboards',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                space: 'default',
                child: {
                  type: 'lens',
                  name: 'lnsDatatable',
                  id: 'fb86b32f-fb7a-45cf-9511-f366fef51bbd',
                  description: '[Flights] Most delayed cities',
                  url: '/app/lens#/edit_by_value',
                },
              }),
            });
          });
        });

        describe('lnsPie', () => {
          it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
            await logContains({
              description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
              predicate: checkHttpRequestId('lens:lnsPie:5d53db36-2d5a-4adc-af7b-cec4c1a294e0'),
            });
          });

          it('propagates to Kibana logs', async () => {
            await logContains({
              description: 'execution context propagates to Kibana logs',
              predicate: checkExecutionContextEntry({
                type: 'dashboard',
                name: 'dashboards',
                url: '/app/dashboards',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                space: 'default',
                child: {
                  type: 'lens',
                  name: 'lnsPie',
                  id: '5d53db36-2d5a-4adc-af7b-cec4c1a294e0',
                  description: '[Flights] Delay Type',
                  url: '/app/lens#/edit_by_value',
                },
              }),
            });
          });
        });
      });

      describe('propagates context for built-in Discover', () => {
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: checkHttpRequestId(
              'discover_session:discover:571aaf70-4c88-11e8-b3d7-01146121b73d'
            ),
          });
        });

        it('propagates to Kibana logs', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs',
            predicate: checkExecutionContextEntry({
              type: 'dashboard',
              name: 'dashboards',
              url: '/app/dashboards',
              page: 'app',
              id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
              description: '[Flights] Global Flight Dashboard',
              space: 'default',
              child: {
                type: 'discover_session',
                name: 'discover',
                id: '571aaf70-4c88-11e8-b3d7-01146121b73d',
                description: '[Flights] Flight Log',
                url: `/app/discover#/view/571aaf70-4c88-11e8-b3d7-01146121b73d?_tab=${encode({
                  tabId: discoverSessionFirstTabId,
                })}`,
              },
            }),
          });
        });
      });

      describe.skip('propagates context for TSVB visualizations', () => {
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: checkHttpRequestId('agg_based:metrics:bcb63b50-4c89-11e8-b3d7-01146121b73d'),
          });
        });

        it('propagates to Kibana logs', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs',
            predicate: checkExecutionContextEntry({
              name: 'dashboards',
              url: '/app/dashboards',
              type: 'application',
              page: 'app',
              description: '[Flights] Global Flight Dashboard',
              child: {
                type: 'agg_based',
                name: 'metrics',
                id: 'bcb63b50-4c89-11e8-b3d7-01146121b73d',
                description: '[Flights] Delays & Cancellations',
                url: '/app/visualize#/edit/bcb63b50-4c89-11e8-b3d7-01146121b73d',
              },
            }),
          });
        });
      });

      describe.skip('propagates context for Vega visualizations', () => {
        // CHECKPOINT this is the test that failed and caused the global .skip()
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: checkHttpRequestId(
              'dashboard:dashboards:7adfa750-4c81-11e8-b3d7-01146121b73d;agg_based:vega:ed78a660-53a0-11e8-acbd-0be0ad9d822b'
            ),
          });
        });

        it('propagates to Kibana logs', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs',
            predicate: checkExecutionContextEntry({
              name: 'dashboards',
              url: '/app/dashboards',
              type: 'application',
              child: {
                name: 'dashboards',
                url: '/app/dashboards',
                type: 'dashboard',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                child: {
                  type: 'agg_based',
                  name: 'vega',
                  id: 'ed78a660-53a0-11e8-acbd-0be0ad9d822b',
                  description: '[Flights] Airport Connections (Hover Over Airport)',
                  url: '/app/visualize#/edit/ed78a660-53a0-11e8-acbd-0be0ad9d822b',
                },
              },
            }),
          });
        });
      });

      describe.skip('propagates context for Tag Cloud visualization', () => {
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: checkHttpRequestId(
              'dashboard:dashboards:7adfa750-4c81-11e8-b3d7-01146121b73d;agg_based:tagcloud:293b5a30-4c8f-11e8-b3d7-01146121b73d'
            ),
          });
        });

        it('propagates to Kibana logs', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs',
            predicate: checkExecutionContextEntry({
              name: 'dashboards',
              url: '/app/dashboards',
              type: 'application',
              child: {
                name: 'dashboards',
                url: '/app/dashboards',
                type: 'dashboard',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                child: {
                  type: 'agg_based',
                  name: 'tagcloud',
                  id: '293b5a30-4c8f-11e8-b3d7-01146121b73d',
                  description: '[Flights] Destination Weather',
                  url: '/app/visualize#/edit/293b5a30-4c8f-11e8-b3d7-01146121b73d',
                },
              },
            }),
          });
        });
      });

      describe.skip('propagates context for Vertical bar visualization', () => {
        it('propagates to Elasticsearch via "x-opaque-id" header', async () => {
          await logContains({
            description: 'execution context propagates to Elasticsearch via "x-opaque-id" header',
            predicate: checkHttpRequestId(
              'dashboard:dashboards:7adfa750-4c81-11e8-b3d7-01146121b73d;agg_based:histogram:9886b410-4c8b-11e8-b3d7-01146121b73d'
            ),
          });
        });

        it('propagates to Kibana logs', async () => {
          await logContains({
            description: 'execution context propagates to Kibana logs',
            predicate: checkExecutionContextEntry({
              type: 'application',
              name: 'dashboards',
              url: '/app/dashboards',
              child: {
                type: 'dashboard',
                name: 'dashboards',
                url: '/app/dashboards',
                page: 'app',
                id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
                description: '[Flights] Global Flight Dashboard',
                child: {
                  type: 'agg_based',
                  name: 'histogram',
                  id: '9886b410-4c8b-11e8-b3d7-01146121b73d',
                  description: '[Flights] Delay Buckets',
                  url: '/app/visualize#/edit/9886b410-4c8b-11e8-b3d7-01146121b73d',
                },
              },
            }),
          });
        });
      });
    });
  });
}
