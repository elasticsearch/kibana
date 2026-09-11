/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { createSpacesAndUsers, deleteSpacesAndUsers } from '../../../../common/lib/authentication';

export default ({ loadTestFile, getService }: FtrProviderContext): void => {
  describe('cases attachments framework (attackAttachmentsEnabled OFF)', function () {
    before(async () => {
      await createSpacesAndUsers(getService);
    });

    after(async () => {
      await deleteSpacesAndUsers(getService);
    });

    loadTestFile(require.resolve('./attack_flag_off'));
  });
};
