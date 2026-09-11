/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { createSpacesAndUsers, deleteSpacesAndUsers } from '../../../../common/lib/authentication';

export default ({ loadTestFile, getService }: FtrProviderContext): void => {
  describe('cases attachments framework (feature flag ON)', function () {
    before(async () => {
      await createSpacesAndUsers(getService);
    });

    after(async () => {
      await deleteSpacesAndUsers(getService);
    });

    loadTestFile(require.resolve('./alerts'));
    loadTestFile(require.resolve('./comments'));
    loadTestFile(require.resolve('./endpoint'));
    loadTestFile(require.resolve('./events'));
    loadTestFile(require.resolve('./files'));
    loadTestFile(require.resolve('./indicator'));
    loadTestFile(require.resolve('./osquery'));
    loadTestFile(require.resolve('./timeline'));
    loadTestFile(require.resolve('./persistable_state'));
    loadTestFile(require.resolve('./mixed_reads'));
    loadTestFile(require.resolve('./validation'));
    loadTestFile(require.resolve('./entity_sub_privilege'));
    loadTestFile(require.resolve('./attack'));
    loadTestFile(require.resolve('./attack_status_sync'));
    loadTestFile(require.resolve('./legacy_route_compat'));
    loadTestFile(require.resolve('./import_export'));

    // Reference saved-object types that only exist as unified attachments
    loadTestFile(require.resolve('./saved_object_attachments'));
  });
};
