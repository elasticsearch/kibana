/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SmlSearchFilters,
  SmlSearchConstraints,
} from '@kbn/agent-context-layer-plugin/public';

/**
 * Query keys for react-query
 */
export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    byAgent: (agentId: string) => ['conversations', 'list', { agentId }],
    byId: (conversationId: string) => ['conversations', conversationId],
  },
  agentProfiles: {
    all: ['agentProfiles'] as const,
    byId: (agentProfileId?: string) => ['agentProfiles', agentProfileId],
    accessControl: (agentProfileId: string) =>
      ['agentProfiles', agentProfileId, 'accessControl'] as const,
  },
  security: {
    users: ['security', 'users'] as const,
    suggestUsers: (query: string) => ['security', 'users', 'suggest', query] as const,
    roles: ['security', 'roles'] as const,
  },
  tools: {
    all: ['tools', 'list'] as const,
    typeInfo: ['tools', 'typeInfo'] as const,
    byId: (toolId?: string) => ['tools', toolId],
    indexSearch: {
      resolveTargets: (pattern: string) => ['tools', 'indexSearch', 'resolveTargets', pattern],
    },
    workflows: {
      byId: (workflowId?: string) => ['tools', 'workflows', workflowId],
      list: () => ['tools', 'workflows', 'list'] as const,
    },
    connectors: {
      list: (type?: string) => ['tools', 'connectors', 'list', type],
      get: (connectorId: string) => ['tools', 'connectors', 'get', connectorId],
      listMcpTools: (connectorId: string) => ['tools', 'connectors', 'listMcpTools', connectorId],
    },
    health: {
      list: () => ['tools', 'health', 'list'] as const,
      byId: (toolId: string) => ['tools', 'health', toolId],
      mcp: () => ['tools', 'health', 'mcp'] as const,
    },
    namespace: {
      validate: (namespace: string, connectorId?: string) =>
        ['tools', 'namespace', 'validate', namespace, connectorId] as const,
    },
  },
  skills: {
    all: ['skills'] as const,
    list: ['skills', 'list'] as const,
    byId: (skillId?: string) => ['skills', skillId],
    byAgent: (agentId?: string) => ['skills', 'byAgent', agentId],
  },
  sml: {
    search: (query: string, constraints?: SmlSearchConstraints, filters?: SmlSearchFilters) =>
      ['sml', 'search', { query, constraints, filters }] as const,
    autocomplete: (query: string, constraints?: SmlSearchConstraints, filters?: SmlSearchFilters) =>
      ['sml', 'autocomplete', { query, constraints, filters }] as const,
  },
  plugins: {
    all: ['plugins', 'list'] as const,
    byId: (pluginId?: string) => ['plugins', pluginId],
  },
  connectors: {
    all: ['connectors'] as const,
  },
  oauthClients: {
    all: ['oauthClients', 'list'] as const,
    byId: (clientId: string) => ['oauthClients', clientId] as const,
  },
};
