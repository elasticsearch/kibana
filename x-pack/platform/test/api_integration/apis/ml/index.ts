/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, loadTestFile }: FtrProviderContext) {
  const ml = getService('ml');

  describe('Machine Learning', function () {
    this.tags(['ml']);

    before(async () => {
      await ml.securityCommon.createMlRoles();
      await ml.securityCommon.createMlUsers();

      // ML saved objects (e.g. lang_ident_model_1) might have lost the * space
      // assignment when privious test suites loaded and unloaded the .kibana index.
      // We're making sure that it's in the expected state again.
      await ml.api.initSavedObjects();
    });

    loadTestFile(require.resolve('./annotations'));
    loadTestFile(require.resolve('./anomaly_detectors'));
    loadTestFile(require.resolve('./datafeeds'));
    loadTestFile(require.resolve('./data_frame_analytics'));
    loadTestFile(require.resolve('./fields_service'));
    loadTestFile(require.resolve('./job_validation'));
    loadTestFile(require.resolve('./job_audit_messages'));
    loadTestFile(require.resolve('./jobs'));
    loadTestFile(require.resolve('./modules'));
    loadTestFile(require.resolve('./results'));
    loadTestFile(require.resolve('./saved_objects'));
    loadTestFile(require.resolve('./system'));
    loadTestFile(require.resolve('./trained_models'));
    loadTestFile(require.resolve('./notifications'));
    loadTestFile(require.resolve('./model_management'));
  });
}
