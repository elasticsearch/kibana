/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../../../../../../../config/serverless/config.base';
import { ELASTICSEARCH_MAX_RESPONSE_SIZE_ARG } from '../max_response_size';

export default createTestConfig({
  testFiles: [require.resolve('..')],
  junit: {
    reportName:
      'Detection Engine - New Terms Rule Execution Logic Integration Tests - Serverless Env - Complete Tier - Max response size',
  },
  kbnTestServerArgs: [ELASTICSEARCH_MAX_RESPONSE_SIZE_ARG],
});
