/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { setupSpacesAndUsers, tearDown } from '../../../setup';

export default function alertingTests({ loadTestFile, getService }: FtrProviderContext) {
  describe('Alerts', () => {
    before(async () => {
      await setupSpacesAndUsers(getService);
    });

    after(async () => {
      await tearDown(getService);
    });

    loadTestFile(require.resolve('./alert_deletion'));
    loadTestFile(require.resolve('./aggregate'));
    loadTestFile(require.resolve('./mute_all'));
    loadTestFile(require.resolve('./mute_instance'));
    loadTestFile(require.resolve('./snooze_instance'));
    loadTestFile(require.resolve('./unmute_all'));
    loadTestFile(require.resolve('./unmute_instance'));
    loadTestFile(require.resolve('./unsnooze_instance'));
    loadTestFile(require.resolve('./update'));
    loadTestFile(require.resolve('./update_api_key'));
  });
}
