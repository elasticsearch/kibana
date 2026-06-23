/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CookieCredentials, InternalRequestHeader } from '@kbn/ftr-common-functional-services';
import type { ReportApiJSON } from '@kbn/reporting-common/types';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const log = getService('log');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const PageObjects = getPageObjects(['common', 'svlCommonPage', 'header']);
  const reportingAPI = getService('svlReportingApi');
  const samlAuth = getService('samlAuth');
  let cookieCredentials: CookieCredentials;
  let internalReqHeader: InternalRequestHeader;

  const archives: Record<string, { data: string; savedObjects: string }> = {
    ecommerce: {
      data: 'x-pack/platform/test/fixtures/es_archives/reporting/ecommerce',
      savedObjects: 'x-pack/platform/test/functional/fixtures/kbn_archives/reporting/ecommerce',
    },
  };

  const navigateToReportingManagement = async () => {
    log.debug(`navigating to reporting management app`);
    await retry.tryForTime(60 * 1000, async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.common.navigateToApp('reportingManagement');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await testSubjects.existOrFail('reportingPageHeader', { timeout: 2000 });
    });
  };

  describe('Reporting Management app', () => {
    let job: ReportApiJSON;
    let path: string;

    before('initialize saved object archive', async () => {
      // add test saved search object
      await esArchiver.load(archives.ecommerce.data);
      await kibanaServer.importExport.load(archives.ecommerce.savedObjects);

      cookieCredentials = await samlAuth.getM2MApiCookieCredentialsWithRoleScope('admin', {
        forceNewSession: true,
      });
      internalReqHeader = samlAuth.getInternalRequestHeader();

      // generate a test report to ensure the user is able to see it in the listing
      ({ job, path } = await reportingAPI.createReportJobInternal(
        'csv_searchsource',
        {
          browserTimezone: 'UTC',
          objectType: 'search',
          searchSource: {
            fields: [
              { field: 'order_date', include_unmapped: true },
              { field: 'order_id', include_unmapped: true },
              { field: 'products.product_id', include_unmapped: true },
            ],
            filter: [
              {
                meta: {
                  field: 'order_date',
                  index: '5193f870-d861-11e9-a311-0fa548c5f953',
                  params: {},
                },
                query: {
                  range: {
                    order_date: {
                      format: 'strict_date_optional_time',
                      gte: '2019-06-20T23:59:44.609Z',
                      lte: '2019-06-21T00:01:06.957Z',
                    },
                  },
                },
              },
              {
                $state: { store: 'appState' },
                meta: {
                  alias: null,
                  disabled: false,
                  index: '5193f870-d861-11e9-a311-0fa548c5f953',
                  key: 'products.product_id',
                  negate: false,
                  params: { query: 22599 },
                  type: 'phrase',
                },
                query: { match_phrase: { 'products.product_id': 22599 } },
              },
            ],
            index: '5193f870-d861-11e9-a311-0fa548c5f953',
            query: { language: 'kuery', query: '' },
            sort: [{ order_date: { format: 'strict_date_optional_time', order: 'desc' } }],
          },
          title: 'Ecommerce Data',
          version: '8.15.0',
        },
        cookieCredentials,
        internalReqHeader
      ));
    });

    after('clean up archives', async () => {
      await reportingAPI.waitForJobToFinish(path, cookieCredentials, internalReqHeader);
      await esArchiver.unload(archives.ecommerce.data);
      await kibanaServer.importExport.unload(archives.ecommerce.savedObjects);
    });

    it(`user sees a job they've created`, async () => {
      await navigateToReportingManagement();
      await testSubjects.existOrFail(`viewReportingLink-${job.id}`);
    });
  });
};
