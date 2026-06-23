/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../../helpers';

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const es = getService('es');
  const fleetAndAgents = getService('fleetAndAgents');

  const deletePackage = async (name: string, version: string) => {
    await supertest.delete(`/api/fleet/epm/packages/${name}/${version}`).set('kbn-xsrf', 'xxxx');
  };

  describe('upgrading a package from non-TSDS to TSDS with pre-existing data streams', () => {
    skipIfNoDockerRegistry(providerContext);

    before(async () => {
      await fleetAndAgents.setup();
    });

    afterEach(async () => {
      await Promise.all([
        deletePackage('no_tsdb_to_tsdb', '0.2.0'),
        deletePackage('no_tsdb_to_tsdb', '0.1.0'),
        es.transport.request(
          {
            method: 'DELETE',
            path: '/_data_stream/metrics-no_tsdb_to_tsdb.test-default',
          },
          { ignore: [404] }
        ),
      ]);
    });

    // Regression test for: https://github.com/elastic/kibana/issues/259799
    //
    // On ES < 9.2.2, upgrading a package that adds index_mode: time_series to a data stream
    // failed when a non-TSDS data stream already existed. step_update_current_write_indices
    // raised: mapper_parsing_exception: [index.mode=time_series] requires a non-empty
    // [index.routing_path]. Fixed in ES 9.2.2 by ES PR #137852.
    it('should successfully upgrade from non-TSDS to TSDS when a data stream already has non-TSDS backing indices', async function () {
      const templateName = 'metrics-no_tsdb_to_tsdb.test';
      const dataStreamName = 'metrics-no_tsdb_to_tsdb.test-default';

      await supertest
        .post('/api/fleet/epm/packages/no_tsdb_to_tsdb/0.1.0')
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true })
        .expect(200);

      expect(await getIndexMode(templateName)).to.be(undefined);

      await es.index({
        index: dataStreamName,
        document: {
          '@timestamp': new Date().toISOString(),
          some_field: 'test',
          data_stream: {
            type: 'metrics',
            dataset: 'no_tsdb_to_tsdb.test',
            namespace: 'default',
          },
        },
        refresh: 'wait_for',
      });

      await supertest
        .post('/api/fleet/epm/packages/no_tsdb_to_tsdb/0.2.0')
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true })
        .expect(200);

      expect(await getIndexMode(templateName)).to.eql('time_series');
    });

    async function getIndexMode(templateName: string) {
      const { body: indexTemplateResponse } = await es.transport.request<any>(
        { method: 'GET', path: `/_index_template/${templateName}` },
        { meta: true }
      );
      const indexTemplate = indexTemplateResponse.index_templates[0].index_template;
      return indexTemplate.template?.settings?.index?.mode;
    }
  });
}
