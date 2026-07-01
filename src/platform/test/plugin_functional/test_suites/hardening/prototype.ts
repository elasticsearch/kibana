/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { PluginFunctionalProviderContext } from '../../services';

export default function ({ getService, getPageObjects }: PluginFunctionalProviderContext) {
  const PageObjects = getPageObjects(['common', 'header']);
  const browser = getService('browser');
  const supertest = getService('supertest');
  const snapshots = getService('snapshots');
  const testSubjects = getService('testSubjects');

  describe('prototype', function () {
    it('does not allow polluting most prototypes on the server', async () => {
      const response = await supertest
        .get('/internal/hardening/_pollute_prototypes')
        .set('kbn-xsrf', 'true')
        .expect(200);

      await snapshots.compareAgainstBaseline('hardening/prototype_server', response.body);
    });

    it('does not allow polluting most prototypes on the client', async () => {
      const pageTitle = 'Hardening test - Elastic';

      await PageObjects.common.navigateToApp('hardeningPlugin');
      await PageObjects.header.waitUntilLoadingHasFinished();
      expect(await browser.getTitle()).eql(pageTitle);

      const resultText = await testSubjects.getVisibleText('pollution-result');
      await snapshots.compareAgainstBaseline('hardening/prototype_client', JSON.parse(resultText));
    });

    it('blocks prototype reassignment via __proto__ on the server', async () => {
      const response = await supertest
        .get('/internal/hardening/_reassign_prototypes')
        .set('kbn-xsrf', 'true')
        .expect(200);

      await snapshots.compareAgainstBaseline('hardening/prototype_reassign_server', response.body);
    });

    it('blocks prototype reassignment via __proto__ on the client', async () => {
      await PageObjects.common.navigateToApp('hardeningPlugin');
      await PageObjects.header.waitUntilLoadingHasFinished();

      const resultText = await testSubjects.getVisibleText('reassign-result');
      await snapshots.compareAgainstBaseline(
        'hardening/prototype_reassign_client',
        JSON.parse(resultText)
      );
    });
  });
}
