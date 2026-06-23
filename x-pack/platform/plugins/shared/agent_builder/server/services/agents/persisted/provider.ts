/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { SecurityServiceStart } from '@kbn/core-security-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { ElasticsearchServiceStart } from '@kbn/core-elasticsearch-server';
import {
  agentBuilderDefaultAgentId,
  createBadRequestError,
  isAgentNotFoundError,
} from '@kbn/agent-builder-common';
import type { GetAgentOptions, WritableAgentProvider, AgentProviderFn } from '../agent_source';
import type { ToolsServiceStart } from '../../tools';
import { createClient } from './client';
import type { AgentClient } from './client';
import type { InternalAgentDefinition } from '../agent_registry';
import type { PersistedAgentDefinitionWithPermissions } from './types';
import { getDefaultAgentCreateRequest } from '../default_agent_definition';

export const createPersistedProviderFn =
  (opts: {
    security: SecurityServiceStart;
    elasticsearch: ElasticsearchServiceStart;
    toolsService: ToolsServiceStart;
    logger: Logger;
  }): AgentProviderFn<false> =>
  ({ request, space }) => {
    return createPersistedProvider({
      ...opts,
      request,
      space,
    });
  };

const ensureDefaultAgent = async (
  client: AgentClient
): Promise<PersistedAgentDefinitionWithPermissions> => {
  return client.ensureDefaultAgent(getDefaultAgentCreateRequest());
};

const createPersistedProvider = async ({
  space,
  request,
  security,
  elasticsearch,
  toolsService,
  logger,
}: {
  space: string;
  request: KibanaRequest;
  security: SecurityServiceStart;
  elasticsearch: ElasticsearchServiceStart;
  toolsService: ToolsServiceStart;
  logger: Logger;
}): Promise<WritableAgentProvider> => {
  const client = await createClient({
    elasticsearch,
    logger,
    request,
    security,
    toolsService,
    space,
  });

  return {
    id: 'persisted',
    readonly: false,
    has: async (agentId: string) => {
      const exists = await client.has(agentId);
      if (!exists && agentId === agentBuilderDefaultAgentId) {
        await ensureDefaultAgent(client);
        return true;
      }
      return exists;
    },
    get: async (agentId: string, opts?: GetAgentOptions) => {
      const access = opts?.access ?? 'read';
      try {
        const definition = await client.getWithAccess(agentId, access);
        return toInternalDefinition({ definition });
      } catch (e) {
        if (agentId === agentBuilderDefaultAgentId && isAgentNotFoundError(e)) {
          const definition = await ensureDefaultAgent(client);
          return toInternalDefinition({ definition });
        }
        throw e;
      }
    },
    list: async (opts) => {
      const definitions = await client.list(opts);
      const hasDefault = definitions.some((def) => def.id === agentBuilderDefaultAgentId);
      if (!hasDefault) {
        const defaultAgent = await ensureDefaultAgent(client);
        definitions.push(defaultAgent);
      }
      return definitions.map((definition) => toInternalDefinition({ definition }));
    },
    create: async (createRequest) => {
      if (createRequest.id === agentBuilderDefaultAgentId) {
        throw createBadRequestError('The default agent cannot be manually created');
      }
      const definition = await client.create(createRequest);
      return toInternalDefinition({ definition });
    },
    update: async (agentId, update) => {
      const definition = await client.update(agentId, update);
      return toInternalDefinition({ definition });
    },
    delete: (agentId: string) => {
      return client.delete({ id: agentId });
    },
    getAccessControl: async (agentId: string) => {
      const result = await client.getAccessControl(agentId);
      return result;
    },
    updateAccessControl: async (agentId, update) => {
      return client.updateAccessControl(agentId, update);
    },
  };
};

export const toInternalDefinition = ({
  definition,
}: {
  definition: PersistedAgentDefinitionWithPermissions;
}): InternalAgentDefinition => {
  return {
    ...definition,
    readonly: false,
    isAvailable: () => {
      return { status: 'available' };
    },
  };
};
