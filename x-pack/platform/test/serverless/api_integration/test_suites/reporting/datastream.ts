/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from 'expect';
import type {
  CookieCredentials,
  InternalRequestHeader,
  RoleCredentials,
} from '@kbn/ftr-common-functional-services';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const reportingAPI = getService('svlReportingApi');
  const svlCommonApi = getService('svlCommonApi');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const svlUserManager = getService('svlUserManager');
  const samlAuth = getService('samlAuth');
  let roleAuthc: RoleCredentials;
  let cookieCredentials: CookieCredentials;
  let internalReqHeader: InternalRequestHeader;

  const archives: Record<string, { data: string; savedObjects: string }> = {
    ecommerce: {
      data: 'x-pack/platform/test/fixtures/es_archives/reporting/ecommerce',
      savedObjects: 'x-pack/platform/test/functional/fixtures/kbn_archives/reporting/ecommerce',
    },
  };

  describe('Data Stream', function () {
    const generatedReports = new Set<string>();
    before(async () => {
      roleAuthc = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
      cookieCredentials = await samlAuth.getM2MApiCookieCredentialsWithRoleScope('admin', {
        forceNewSession: true,
      });
      internalReqHeader = svlCommonApi.getInternalRequestHeader();

      await esArchiver.load(archives.ecommerce.data);
      await kibanaServer.importExport.load(archives.ecommerce.savedObjects);

      // generate a report that will initialize the Reporting data stream
      const { job, path } = await reportingAPI.createReportJobInternal(
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
      );
      await reportingAPI.waitForJobToFinish(path, cookieCredentials, internalReqHeader);

      generatedReports.add(job.id);
    });

    after(async () => {
      for (const reportId of generatedReports) {
        await reportingAPI.deleteReport(reportId, cookieCredentials, internalReqHeader);
      }

      await esArchiver.unload(archives.ecommerce.data);
      await kibanaServer.importExport.unload(archives.ecommerce.savedObjects);
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAuthc);
    });

    it('uses the datastream configuration', async () => {
      const { status, body } = await supertestWithoutAuth
        .get(`/api/index_management/data_streams/.kibana-reporting`)
        .set(internalReqHeader)
        .set(roleAuthc.apiKeyHeader); // use API key since the datastream management API is a public endpoint

      svlCommonApi.assertResponseStatusCode(200, status, body);

      expect(body).toEqual(
        expect.objectContaining({
          _meta: {
            description: 'default kibana reporting template installed by elasticsearch',
            managed: true,
          },
          failureStoreEnabled: false,
          name: '.kibana-reporting',
          indexTemplateName: '.kibana-reporting',
          generation: 1,
          health: 'green',
          hidden: true,
          indices: [
            {
              name: expect.any(String),
              uuid: expect.any(String),
              managedBy: 'Data stream lifecycle',
              indexMode: 'standard',
              preferILM: true,
            },
          ],
          lifecycle: expect.objectContaining({ enabled: true }),
          nextGenerationManagedBy: 'Data stream lifecycle',
          privileges: {
            delete_index: true,
            manage_data_stream_lifecycle: true,
            read_failure_store: true,
            manage: true,
          },
          timeStampField: { name: '@timestamp' },
        })
      );
    });
  });
}
