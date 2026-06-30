/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import { createUsersAndRoles, deleteUsersAndRoles } from '../../unified_alerts/utils/auth';

export default function ({ loadTestFile, getService }: FtrProviderContext) {
  describe('Detection Engine - Attacks APIs', function () {
    before(async () => {
      await createUsersAndRoles(getService);
    });

    after(async () => {
      await deleteUsersAndRoles(getService);
    });

    loadTestFile(require.resolve('./search_attacks'));
    loadTestFile(require.resolve('./set_workflow_status'));
  });
}
