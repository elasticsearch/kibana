/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { IScopedClusterClient } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { ContextEnginePluginStart } from '@kbn/context-engine-plugin/server';
import { hasContextEngineReadPrivilege } from '../has_context_engine_read_privilege';

export type AiIndexDataReadServiceApi = ReturnType<
  ContextEnginePluginStart['getAiIndexDataReadService']
>;

export interface AiIndexToolDeps {
  getContextEngineStart: () => Promise<ContextEnginePluginStart>;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
}

export const CONTEXT_ENGINE_READ_DENIED_MESSAGE =
  'Insufficient privileges to read Context Engine AI indices.';

/** Read service that runs as the current user. Throws if the user lacks Context Engine read privilege. */
export const getAiIndexDataReadServiceForUser = async ({
  deps: { getContextEngineStart, getSecurityStart },
  esClient,
  request,
}: {
  deps: AiIndexToolDeps;
  esClient: IScopedClusterClient;
  request: KibanaRequest;
}): Promise<AiIndexDataReadServiceApi> => {
  const [contextEngine, security] = await Promise.all([
    getContextEngineStart(),
    getSecurityStart(),
  ]);
  if (!(await hasContextEngineReadPrivilege({ security, request }))) {
    throw new Error(CONTEXT_ENGINE_READ_DENIED_MESSAGE);
  }
  return contextEngine.getAiIndexDataReadService({ esClient: esClient.asCurrentUser, request });
};

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
