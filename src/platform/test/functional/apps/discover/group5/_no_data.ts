/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group5/_no_data.ts

import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const { common, header } = getPageObjects(['common', 'discover', 'header']);

  describe('discover no data', () => {
    const kbnDirectory = 'src/platform/test/functional/fixtures/kbn_archiver/discover';

    before(async function () {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      log.debug('load kibana with no data');
      await kibanaServer.importExport.unload(kbnDirectory);
      await common.navigateToApp('discover');
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
    });

    it('when no data opens integrations', async () => {
      await header.waitUntilLoadingHasFinished();

      const addIntegrations = await testSubjects.find('noDataDefaultActionButton');
      await addIntegrations.click();
      await common.waitUntilUrlIncludes('integrations/browse');
    });
  });
}
