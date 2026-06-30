/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG } from '@kbn/streams-plugin/common';
import { createServerlessFeatureFlagTestConfig } from '../../default_configs/feature_flag.serverless.config.base';
import { services } from '../../services';

export default createServerlessFeatureFlagTestConfig<typeof services>({
  services,
  serverlessProject: 'oblt',
  testFiles: [require.resolve('./oblt.significant_events.feature_flag.index.ts')],
  // Significant events is gated behind this flag (defaults to false); force it on for these suites.
  kbnServerArgs: [`--feature_flags.overrides.${STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG}=true`],
  junit: {
    reportName: 'Serverless Observability - Streams Significant Events API Integration Tests',
  },
});
