/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../common/ftr_provider_context';
import { createSpacesAndUsers, deleteSpacesAndUsers } from '../../../common/lib/authentication';

export default ({ loadTestFile, getService }: FtrProviderContext): void => {
  describe('cases unified attachments (feature flag ON)', function () {
    before(async () => {
      await createSpacesAndUsers(getService);
    });

    after(async () => {
      await deleteSpacesAndUsers(getService);
    });

    loadTestFile(require.resolve('./unified_alerts'));
    loadTestFile(require.resolve('./unified_comments'));
    loadTestFile(require.resolve('./unified_endpoint'));
    loadTestFile(require.resolve('./unified_events'));
    loadTestFile(require.resolve('./unified_files'));
    loadTestFile(require.resolve('./unified_osquery'));
    loadTestFile(require.resolve('./unified_persistable_state'));
    loadTestFile(require.resolve('./mixed_reads'));
    loadTestFile(require.resolve('./unified_validation'));
    loadTestFile(require.resolve('./entity_sub_privilege'));

    // Unified only attachments
    loadTestFile(require.resolve('./dashboard'));
    loadTestFile(require.resolve('./discover_session'));
    loadTestFile(require.resolve('./map'));
  });
};
