/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { buildUp, tearDown } from '../../helpers';

export default function alertingTests({ loadTestFile, getService }: FtrProviderContext) {
  describe('Alerting', () => {
    before(async () => await buildUp(getService));
    after(async () => await tearDown(getService));

    loadTestFile(require.resolve('./execution_status'));
    loadTestFile(require.resolve('./per_alert_snooze'));
    loadTestFile(require.resolve('./monitoring_collection'));
    loadTestFile(require.resolve('./monitoring'));
    loadTestFile(require.resolve('./mute_all'));
    loadTestFile(require.resolve('./mute_instance'));
    loadTestFile(require.resolve('./unmute_all'));
    loadTestFile(require.resolve('./unmute_instance'));
    loadTestFile(require.resolve('./update'));
    loadTestFile(require.resolve('./update_api_key'));
    loadTestFile(require.resolve('./alerts_space1'));
    loadTestFile(require.resolve('./alerts_default_space'));
    loadTestFile(require.resolve('./transform_rule_types'));
    loadTestFile(require.resolve('./ml_rule_types'));
    loadTestFile(require.resolve('./bulk_edit'));
  });
}
