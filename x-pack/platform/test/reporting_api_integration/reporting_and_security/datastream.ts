/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from 'expect';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const reportingAPI = getService('reportingAPI');
  const supertest = getService('supertest');

  describe('Data Stream', () => {
    before(async () => {
      await reportingAPI.initEcommerce();

      // for this test, we don't need to wait for the job to finish or verify the result
      await reportingAPI.postJob(
        `/api/reporting/generate/csv_searchsource?jobParams=%28browserTimezone%3AUTC%2Ccolumns%3A%21%28%29%2CobjectType%3Asearch%2CsearchSource%3A%28fields%3A%21%28%28field%3A%27%2A%27%2Cinclude_unmapped%3Atrue%29%29%2Cfilter%3A%21%28%28meta%3A%28field%3A%27%40timestamp%27%2Cindex%3A%27logstash-%2A%27%2Cparams%3A%28%29%29%2Cquery%3A%28range%3A%28%27%40timestamp%27%3A%28format%3Astrict_date_optional_time%2Cgte%3A%272015-09-22T09%3A17%3A53.728Z%27%2Clte%3A%272015-09-22T09%3A30%3A50.786Z%27%29%29%29%29%2C%28%27%24state%27%3A%28store%3AappState%29%2Cmeta%3A%28alias%3A%21n%2Cdisabled%3A%21f%2Cindex%3A%27logstash-%2A%27%2Ckey%3Aquery%2Cnegate%3A%21f%2Ctype%3Acustom%2Cvalue%3A%27%7B%22bool%22%3A%7B%22minimum_should_match%22%3A1%2C%22should%22%3A%5B%7B%22match_phrase%22%3A%7B%22%40tags%22%3A%22info%22%7D%7D%5D%7D%7D%27%29%2Cquery%3A%28bool%3A%28minimum_should_match%3A1%2Cshould%3A%21%28%28match_phrase%3A%28%27%40tags%27%3Ainfo%29%29%29%29%29%29%29%2Cindex%3A%27logstash-%2A%27%2Cquery%3A%28language%3Akuery%2Cquery%3A%27%27%29%2Csort%3A%21%28%28%27%40timestamp%27%3A%28format%3Astrict_date_optional_time%2Corder%3Adesc%29%29%29%29%2Ctitle%3A%27A%20saved%20search%20with%20match_phrase%20filter%20and%20no%20columns%20selected%27%2Cversion%3A%278.15.0%27%29`
      );
    });

    after(async () => {
      await reportingAPI.deleteAllReports();
      await reportingAPI.teardownEcommerce();
    });

    it('uses the datastream configuration without set policy', async () => {
      const { body } = await supertest
        .get(`/api/index_management/data_streams/.kibana-reporting`)
        .set('kbn-xsrf', 'xxx')
        .set('x-elastic-internal-origin', 'xxx')
        .expect(200);

      expect(body).toEqual({
        _meta: {
          description: 'default kibana reporting template installed by elasticsearch',
          managed: true,
        },
        name: '.kibana-reporting',
        indexTemplateName: '.kibana-reporting',
        timeStampField: { name: '@timestamp' },
        indices: [
          {
            name: expect.any(String),
            uuid: expect.any(String),
            managedBy: 'Index Lifecycle Management',
            ilmPolicyName: 'kibana-reporting',
            indexMode: 'standard',
            preferILM: true,
          },
        ],
        generation: 1,
        health: 'green',
        ilmPolicyName: 'kibana-reporting',
        maxTimeStamp: expect.any(Number),
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
        hidden: true,
        lifecycle: { enabled: true },
        nextGenerationManagedBy: 'Index Lifecycle Management',
        storageSize: expect.any(String),
        storageSizeBytes: expect.any(Number),
        failureStoreEnabled: false,
        matchesFailureStoreClusterPattern: false,
        indexMode: 'standard',
        failureStoreRetention: {
          defaultRetentionPeriod: '30d',
          retentionDisabled: false,
        },
      });
    });
  });
}
