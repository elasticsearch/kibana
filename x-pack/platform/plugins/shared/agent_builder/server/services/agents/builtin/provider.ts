/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { AgentType, createAgentNotFoundError } from '@kbn/agent-builder-common';
import type { BuiltInAgentDefinition, AgentConfigContext } from '@kbn/agent-builder-server/agents';
import type { BuiltinAgentRegistry } from './registry';
import type { AgentProviderFn, GetAgentOptions, ReadonlyAgentProvider } from '../agent_source';
import type { InternalAgentDefinition } from '../agent_registry';
import { AgentAvailabilityCache } from './availability_cache';

export const createBuiltinProviderFn = ({
  registry,
}: {
  registry: BuiltinAgentRegistry;
}): AgentProviderFn<true> => {
  const availabilityCache = new AgentAvailabilityCache();
  return ({ request, space }) => {
    return registryToProvider({ registry, request, space, availabilityCache });
  };
};

const registryToProvider = ({
  registry,
  request,
  space,
  availabilityCache,
}: {
  registry: BuiltinAgentRegistry;
  request: KibanaRequest;
  space: string;
  availabilityCache: AgentAvailabilityCache;
}): ReadonlyAgentProvider => {
  const configContext: AgentConfigContext = { request, spaceId: space };

  return {
    id: 'builtin',
    readonly: true,
    has: (agentId: string) => {
      return registry.has(agentId);
    },
    get: (agentId: string, _opts?: GetAgentOptions) => {
      const definition = registry.get(agentId);
      if (!definition) {
        throw createAgentNotFoundError({ agentId });
      }
      return toInternalDefinition({ definition, availabilityCache, configContext });
    },
    list: (opts) => {
      const definitions = registry.list();
      return Promise.all(
        definitions.map((definition) =>
          toInternalDefinition({ definition, availabilityCache, configContext })
        )
      );
    },
  };
};

export const toInternalDefinition = async ({
  definition,
  availabilityCache,
  configContext,
}: {
  definition: BuiltInAgentDefinition;
  availabilityCache: AgentAvailabilityCache;
  configContext: AgentConfigContext;
}): Promise<InternalAgentDefinition> => {
  const configuration =
    typeof definition.configuration === 'function'
      ? await definition.configuration(configContext)
      : definition.configuration;

  return {
    ...definition,
    configuration: {
      ...configuration,
      enable_elastic_capabilities: configuration.enable_elastic_capabilities ?? true,
    },
    type: AgentType.chat,
    access_control: undefined,
    created_by: undefined,
    readonly: true,
    permissions: {
      update_agent: false,
      update_access_control: false,
    },
    isAvailable: async (ctx) => {
      if (definition.availability) {
        return availabilityCache.getOrCompute(definition.id, definition.availability, ctx);
      } else {
        return { status: 'available' };
      }
    },
  };
};
