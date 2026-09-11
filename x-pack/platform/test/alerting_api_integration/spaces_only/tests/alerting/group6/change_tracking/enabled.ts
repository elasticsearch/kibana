/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { asKibanaClient } from '@kbn/change-history/test_utils';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';

export default function changeTrackingEnabledTest({ getService }: FtrProviderContext) {
  const es = getService('es');
  const retry = getService('retry');

  describe('change tracking service - enabled', () => {
    it('should create the change history data stream for stack-scoped rule types', async () => {
      const client = asKibanaClient(es);
      await retry.tryForTime(30_000, async () => {
        const response = await client.indices.getDataStream({ name: '.kibana_change_history' });
        expect(response.data_streams.length).to.be.greaterThan(0);
      });
    });
  });
}
