/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import {
  LOGSTASH_API_KEY_CLUSTER_PERMISSIONS,
  LOGSTASH_API_KEY_INDICES,
  LOGSTASH_API_KEY_INDICES_PRIVILEGES,
} from '../../../common/constants';

/**
 * Check if an esClient has enought permission to create a valid API key for logstash
 *
 * @param esClient
 */
export async function canCreateLogstashApiKey(esClient: ElasticsearchClient) {
  const res = await esClient.security.hasPrivileges({
    cluster: LOGSTASH_API_KEY_CLUSTER_PERMISSIONS,
    index: [
      {
        names: LOGSTASH_API_KEY_INDICES,
        privileges: LOGSTASH_API_KEY_INDICES_PRIVILEGES,
      },
    ],
  });

  return res.has_all_requested;
}

/**
 * Generate an Elasticsearch API key to use in logstash ES output
 *
 * @param esClient
 */
export async function generateLogstashApiKey(esClient: ElasticsearchClient) {
  const apiKey = await esClient.security.createApiKey({
    name: 'Fleet Logstash output',
    metadata: {
      managed_by: 'fleet',
      managed: true,
      type: 'logstash',
    },
    role_descriptors: {
      'logstash-output': {
        cluster: ['monitor'],
        index: [
          {
            names: [
              'logs-*-*',
              'metrics-*-*',
              'traces-*-*',
              'synthetics-*-*',
              '.logs-endpoint.diagnostic.collection-*',
              '.logs-endpoint.action.responses-*',
              'profiling-*',
              '.profiling-*',
              'profiles-*',
            ],
            privileges: ['auto_configure', 'create_doc'],
          },
        ],
      },
    },
  });

  return apiKey;
}
