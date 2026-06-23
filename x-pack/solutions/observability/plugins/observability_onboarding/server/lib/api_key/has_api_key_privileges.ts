/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';

export interface ApiKeyPrivileges {
  index?: estypes.SecurityIndicesPrivileges[];
  application?: estypes.SecurityApplicationPrivileges[];
}

/**
 * Verifies the current user holds the privileges that will be assigned to a new API key.
 *
 * Elasticsearch does not reject `createApiKey` when the owner lacks the assigned privileges; it
 * silently clamps the key to the intersection with the owner's privileges, which would hand the
 * user a key that cannot ingest. This pre-check surfaces a friendly error instead. `manage_own_api_key`
 * is always required because the owner must be able to create the key in the first place.
 */
export async function hasApiKeyPrivileges(
  esClient: ElasticsearchClient,
  { index, application }: ApiKeyPrivileges
): Promise<boolean> {
  const res = await esClient.security.hasPrivileges({
    cluster: ['manage_own_api_key'],
    index,
    application,
  });

  return res.has_all_requested;
}
