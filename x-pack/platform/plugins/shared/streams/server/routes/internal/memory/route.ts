/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ElasticsearchClient, IUiSettingsClient, Logger } from '@kbn/core/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { notFound, serverUnavailable } from '@hapi/boom';
import {
  STREAMS_MEMORY_CONSOLIDATION_WORKFLOW_ID,
  STREAMS_MEMORY_CONVERSATION_SCRAPER_WORKFLOW_ID,
  STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import { createServerRoute } from '../../create_server_route';
import type {
  MemoryEntry,
  MemoryCategoryNode,
  MemorySearchResult,
  MemoryVersionRecord,
} from '../../../lib/memory';
import { MemoryServiceImpl } from '../../../lib/memory';
import type { StreamsServer } from '../../../types';
import { triggerMemorySynthesisWorkflow } from '../../../lib/memory/trigger_memory_synthesis_workflow';
import { assertSignificantEventsAccess } from '../../utils/assert_significant_events_access';
import { isSignificantEventsMemoryEnabled } from '../../../lib/memory/is_significant_events_memory_enabled';
import { FeatureNotEnabledError } from '../../../lib/streams/errors/feature_not_enabled_error';

const assertMemoryEnabled = async ({
  server,
  licensing,
  uiSettingsClient,
}: {
  server: StreamsServer;
  licensing: LicensingPluginStart;
  uiSettingsClient: IUiSettingsClient;
}) => {
  await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

  const useMemory = await isSignificantEventsMemoryEnabled(server.core.featureFlags);
  if (!useMemory) {
    throw new FeatureNotEnabledError(
      'Memory is disabled. Enable the streams.significantEventsMemoryEnabled feature flag.'
    );
  }
};

const createMemoryService = (esClient: ElasticsearchClient, logger: Logger) =>
  new MemoryServiceImpl({ logger, esClient });

const createEntryRoute = createServerRoute({
  endpoint: 'POST /internal/streams/memory/entries',
  options: {
    access: 'internal',
    summary: 'Create a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      name: z.string(),
      title: z.string(),
      content: z.string(),
      categories: z.array(z.string()).optional(),
      references: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }),
  }),
  handler: async ({ params, request, server, logger, getScopedClients }): Promise<MemoryEntry> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const authUser = server.core.security.authc.getCurrentUser(request);
    const user = authUser?.username ?? 'unknown';

    return memory.create({
      ...params.body,
      categories: params.body.categories ?? [],
      references: params.body.references ?? [],
      tags: params.body.tags ?? [],
      user,
    });
  },
});

const getEntryRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/entries/{id}',
  options: {
    access: 'internal',
    summary: 'Get a memory page by ID',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ id: z.string() }),
  }),
  handler: async ({ params, request, server, logger, getScopedClients }): Promise<MemoryEntry> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    return memory.get({ id: params.path.id });
  },
});

const getEntryByNameRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/entries/by-name',
  options: {
    access: 'internal',
    summary: 'Get a memory page by name',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    query: z.object({ name: z.string() }),
  }),
  handler: async ({ params, request, server, logger, getScopedClients }): Promise<MemoryEntry> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const entry = await memory.getByName({ name: params.query.name });
    if (!entry) {
      throw notFound(`Page not found with name: ${params.query.name}`);
    }
    return entry;
  },
});

const updateEntryRoute = createServerRoute({
  endpoint: 'PUT /internal/streams/memory/entries/{id}',
  options: {
    access: 'internal',
    summary: 'Update a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ id: z.string() }),
    body: z.object({
      title: z.string().optional(),
      content: z.string().optional(),
      name: z.string().optional(),
      categories: z.array(z.string()).optional(),
      references: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      change_summary: z.string().optional(),
    }),
  }),
  handler: async ({ params, request, server, logger, getScopedClients }): Promise<MemoryEntry> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const authUser = server.core.security.authc.getCurrentUser(request);
    const user = authUser?.username ?? 'unknown';

    return memory.update({
      id: params.path.id,
      ...params.body,
      changeSummary: params.body.change_summary,
      user,
    });
  },
});

const deleteEntryRoute = createServerRoute({
  endpoint: 'DELETE /internal/streams/memory/entries/{id}',
  options: {
    access: 'internal',
    summary: 'Delete a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ id: z.string() }),
  }),
  handler: async ({
    params,
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ deleted: boolean }> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const authUser = server.core.security.authc.getCurrentUser(request);
    const user = authUser?.username ?? 'unknown';

    await memory.delete({ id: params.path.id, user });
    return { deleted: true };
  },
});

const renameEntryRoute = createServerRoute({
  endpoint: 'POST /internal/streams/memory/entries/{id}/rename',
  options: {
    access: 'internal',
    summary: 'Rename a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ id: z.string() }),
    body: z.object({ new_name: z.string() }),
  }),
  handler: async ({ params, request, server, logger, getScopedClients }): Promise<MemoryEntry> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const authUser = server.core.security.authc.getCurrentUser(request);
    const user = authUser?.username ?? 'unknown';

    return memory.rename({
      id: params.path.id,
      newName: params.body.new_name,
      user,
    });
  },
});

const searchRoute = createServerRoute({
  endpoint: 'POST /internal/streams/memory/search',
  options: {
    access: 'internal',
    summary: 'Search memory pages',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      query: z.string(),
      tags: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      references: z.array(z.string()).optional(),
      size: z.number().min(1).max(50).optional(),
    }),
  }),
  handler: async ({
    params,
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ results: MemorySearchResult[] }> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const results = await memory.search({
      query: params.body.query,
      tags: params.body.tags,
      categories: params.body.categories,
      references: params.body.references,
      size: params.body.size,
    });
    return { results };
  },
});

const getCategoryTreeRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/categories',
  options: {
    access: 'internal',
    summary: 'Get memory category tree',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({}),
  handler: async ({
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ tree: MemoryCategoryNode[] }> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const tree = await memory.getCategoryTree();
    return { tree };
  },
});

const getHistoryRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/entries/{id}/history',
  options: {
    access: 'internal',
    summary: 'Get version history for a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ id: z.string() }),
    query: z
      .object({
        size: z.coerce.number().min(1).max(100).optional(),
      })
      .optional()
      .default({}),
  }),
  handler: async ({
    params,
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ history: MemoryVersionRecord[] }> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const history = await memory.getHistory({
      entryId: params.path.id,
      size: params.query?.size,
    });
    return { history };
  },
});

const getVersionRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/entries/{id}/history/{version}',
  options: {
    access: 'internal',
    summary: 'Get a specific version of a memory page',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({
      id: z.string(),
      version: z.coerce.number(),
    }),
  }),
  handler: async ({
    params,
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<MemoryVersionRecord> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    return memory.getVersion({
      entryId: params.path.id,
      version: params.path.version,
    });
  },
});

const recentChangesRoute = createServerRoute({
  endpoint: 'GET /internal/streams/memory/recent-changes',
  options: {
    access: 'internal',
    summary: 'Get recent changes across all memory pages',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    query: z
      .object({
        size: z.coerce.number().min(1).max(100).optional(),
      })
      .optional()
      .default({}),
  }),
  handler: async ({
    params,
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ changes: MemoryVersionRecord[] }> => {
    const { licensing, uiSettingsClient, scopedClusterClient } = await getScopedClients({
      request,
    });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });
    const memory = createMemoryService(scopedClusterClient.asCurrentUser, logger);

    const changes = await memory.getRecentChanges({
      size: params.query?.size,
    });
    return { changes };
  },
});

const createWorkflowTriggerRoute = (
  endpoint: `POST ${string}`,
  managedWorkflowId: string,
  summary: string
) =>
  createServerRoute({
    endpoint,
    options: { access: 'internal', summary },
    security: { authz: { requiredPrivileges: [STREAMS_API_PRIVILEGES.manage] } },
    params: z.object({ body: z.object({}).passthrough().optional() }),
    handler: async ({
      request,
      server,
      logger,
      getScopedClients,
    }): Promise<{ executionId: string }> => {
      const { licensing, uiSettingsClient } = await getScopedClients({ request });
      await assertMemoryEnabled({ server, licensing, uiSettingsClient });

      const wfMgmt = server.workflowsManagement;
      if (!wfMgmt) {
        throw serverUnavailable(
          'Workflows management plugin is not available. Cannot trigger memory workflow.'
        );
      }

      // Use the user's current space so the execution appears in the Workflows UI.
      const spaceId = server.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;

      const workflow = await wfMgmt.management.getWorkflow(managedWorkflowId, spaceId);
      if (!workflow || !workflow.definition) {
        throw notFound(
          `Managed workflow "${managedWorkflowId}" not found. Kibana may still be starting up.`
        );
      }

      const executionId = await wfMgmt.management.runWorkflow(
        { ...workflow, definition: workflow.definition },
        spaceId,
        {},
        request,
        'sigevents-memory-ui'
      );

      logger.info(`Triggered managed workflow "${managedWorkflowId}", executionId=${executionId}`);
      return { executionId };
    },
  });

const scrapeConversationsRoute = createWorkflowTriggerRoute(
  'POST /internal/streams/memory/_scrape_conversations',
  STREAMS_MEMORY_CONVERSATION_SCRAPER_WORKFLOW_ID,
  'Trigger conversation scraping for memory'
);

const consolidateMemoryRoute = createWorkflowTriggerRoute(
  'POST /internal/streams/memory/_consolidate',
  STREAMS_MEMORY_CONSOLIDATION_WORKFLOW_ID,
  'Trigger memory consolidation'
);

const synthesizeMemoryRoute = createServerRoute({
  endpoint: 'POST /internal/streams/memory/_synthesize',
  options: { access: 'internal', summary: 'Trigger memory synthesis from significant events' },
  security: { authz: { requiredPrivileges: [STREAMS_API_PRIVILEGES.manage] } },
  params: z.object({ body: z.object({}).passthrough().optional() }),
  handler: async ({
    request,
    server,
    logger,
    getScopedClients,
  }): Promise<{ executionId: string }> => {
    const { licensing, uiSettingsClient } = await getScopedClients({ request });
    await assertMemoryEnabled({ server, licensing, uiSettingsClient });

    const executionId = await triggerMemorySynthesisWorkflow({
      workflowsManagement: server.workflowsManagement,
      spaces: server.spaces,
      request,
      logger,
      triggeredBy: 'sigevents-memory-ui',
    });

    if (!executionId) {
      throw serverUnavailable(
        'Memory synthesis workflow is not available. Ensure workflows management is enabled and Kibana has finished installing managed workflows.'
      );
    }

    return { executionId };
  },
});

const detectGapsRoute = createWorkflowTriggerRoute(
  'POST /internal/streams/memory/_detect_gaps',
  STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID,
  'Trigger gap detection for memory'
);

export const internalMemoryRoutes = {
  ...createEntryRoute,
  ...getEntryRoute,
  ...getEntryByNameRoute,
  ...updateEntryRoute,
  ...deleteEntryRoute,
  ...renameEntryRoute,
  ...searchRoute,
  ...getCategoryTreeRoute,
  ...getHistoryRoute,
  ...getVersionRoute,
  ...recentChangesRoute,
  ...scrapeConversationsRoute,
  ...consolidateMemoryRoute,
  ...synthesizeMemoryRoute,
  ...detectGapsRoute,
};
