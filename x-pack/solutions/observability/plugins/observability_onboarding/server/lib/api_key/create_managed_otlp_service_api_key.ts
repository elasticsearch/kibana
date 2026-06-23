/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type ElasticsearchClient } from '@kbn/core/server';
import { APM_EVENT_WRITE_APPLICATION } from './privileges';

export function createManagedOtlpServiceApiKey(esClient: ElasticsearchClient, name: string) {
  const timestamp = new Date().toISOString();

  return esClient.security.createApiKey({
    name: `${name}-${timestamp}`,
    metadata: {
      managed: true,
    },
    role_descriptors: {
      apm_writer: {
        cluster: [],
        index: [],
        applications: [APM_EVENT_WRITE_APPLICATION],
      },
    },
  });
}
