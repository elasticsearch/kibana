/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ loadTestFile, getService }: FtrProviderContext) {
  const kibanaServer = getService('kibanaServer');
  const esArchiver = getService('esArchiver');
  const browser = getService('browser');
  const log = getService('log');
  const supertest = getService('supertest');

  describe('maps app', function () {
    this.tags(['skipFirefox']);

    before(async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'x-pack/platform/test/functional/fixtures/kbn_archives/maps.json'
      );
      // Functional tests verify behavior when referenced index pattern saved objects can not be found.
      // However, saved object import fails when reference saved objects can not be found.
      // To prevent import errors, index pattern saved object references exist during import
      // but are then deleted afterwards to enable testing of missing reference index pattern saved objects.

      log.info('Delete index pattern');
      log.debug('id: ' + 'idThatDoesNotExitForESGeoGridSource');
      log.debug('id: ' + 'idThatDoesNotExitForESSearchSource');
      log.debug('id: ' + 'idThatDoesNotExitForESJoinSource');
      await supertest
        .delete('/api/index_patterns/index_pattern/' + 'idThatDoesNotExitForESGeoGridSource')
        .set('kbn-xsrf', 'true')
        .expect(200);

      await supertest
        .delete('/api/index_patterns/index_pattern/' + 'idThatDoesNotExitForESSearchSource')
        .set('kbn-xsrf', 'true')
        .expect(200);

      await supertest
        .delete('/api/index_patterns/index_pattern/' + 'idThatDoesNotExitForESJoinSource')
        .set('kbn-xsrf', 'true')
        .expect(200);

      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/maps/data');
      await kibanaServer.uiSettings.replace({
        defaultIndex: 'c698b940-e149-11e8-a35a-370a8516603a',
      });
      await browser.setWindowSize(1600, 1000);
    });

    after(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/maps/data');
      await kibanaServer.importExport.unload(
        'x-pack/platform/test/functional/fixtures/kbn_archives/maps.json'
      );
    });

    loadTestFile(require.resolve('./es_geo_grid_source'));
    loadTestFile(require.resolve('./adhoc_data_view'));
    loadTestFile(require.resolve('./multiple_data_views'));
  });
}
