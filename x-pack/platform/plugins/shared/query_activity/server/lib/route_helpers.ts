/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

/**
 * Reads an Elasticsearch status code from supported client error envelopes.
 */
export const getErrorStatusCode = (error: unknown): number | undefined => {
  const typedError = error as { statusCode?: number; meta?: { statusCode?: number } };
  return typedError?.statusCode ?? typedError?.meta?.statusCode;
};

/**
 * Checks the ES monitor privilege in ESS and relies on Kibana RBAC in Serverless.
 */
export const hasQueryActivityMonitorPrivilege = async (
  esClient: ElasticsearchClient
): Promise<boolean> => {
  const privileges = await esClient.security?.hasPrivileges?.({
    cluster: ['monitor'],
  });

  return privileges ? Boolean(privileges.cluster?.monitor) : true;
};
