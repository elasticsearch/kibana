/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, loadTestFile }: FtrProviderContext) {
  const ml = getService('ml');

  describe('machine learning - data frame analytics - group 1', function () {
    this.tags(['ml']);

    before(async () => {
      await ml.securityCommon.createMlRoles();
      await ml.securityCommon.createMlUsers();
    });

    loadTestFile(require.resolve('./cloning'));
    loadTestFile(require.resolve('./results_view_content'));
    loadTestFile(require.resolve('./custom_urls'));
  });
}
