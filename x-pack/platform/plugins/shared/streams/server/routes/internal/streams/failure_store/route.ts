/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  MAX_STREAM_NAME_LENGTH,
  Streams,
  findInheritedFailureStore,
  isInheritFailureStore,
} from '@kbn/streams-schema';
import type { EffectiveFailureStore } from '@kbn/streams-schema';
import {
  getClusterDefaultFailureStoreRetentionValue,
  getFailureStoreStats,
} from '../../../../lib/streams/failure_store';
import { simulateClassicStreamTemplate } from '../../../../lib/streams/data_streams/manage_data_streams';
import { StatusError } from '../../../../lib/streams/errors/status_error';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { createServerRoute } from '../../../create_server_route';

export const getFailureStoreStatsRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/failure_store/stats',
  options: {
    access: 'internal',
    summary: 'Get failure store stats',
    description: 'Gets the failure store statistics for a stream',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({
      name: z.string().max(MAX_STREAM_NAME_LENGTH),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server }) => {
    const { scopedClusterClient, streamsClient, isSecurityEnabled } = await getScopedClients({
      request,
    });

    const { name } = params.path;

    const privileges = await streamsClient.getPrivileges(name);

    if (!privileges.manage_failure_store) {
      return { stats: null };
    }

    const stats = await getFailureStoreStats({
      name,
      esClient: scopedClusterClient.asCurrentUser,
      esClientAsSecondaryAuthUser: isSecurityEnabled
        ? scopedClusterClient.asSecondaryAuthUser
        : undefined,
      isServerless: server.isServerless,
    });

    return { stats };
  },
});

const inheritedFailureStoreRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/failure_store/_inherited',
  options: {
    access: 'internal',
    summary: 'Get inherited failure store config',
    description:
      'Resolves the failure store configuration inherited from template or parent stream',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({
      name: z.string().max(MAX_STREAM_NAME_LENGTH),
    }),
  }),
  handler: async ({ params, request, getScopedClients, logger }) => {
    const { scopedClusterClient, streamsClient } = await getScopedClients({ request });
    const { name } = params.path;

    const definition = await streamsClient.getStream(name);

    return resolveInheritedFailureStore({
      name,
      definition,
      getAncestors: () => streamsClient.getAncestors(name),
      getTemplate: () =>
        simulateClassicStreamTemplate({
          esClient: scopedClusterClient.asCurrentUser,
          name,
          logger,
        }),
    });
  },
});

type SimulatedTemplate = Awaited<ReturnType<typeof simulateClassicStreamTemplate>>;

/**
 * Resolves the failure store a stream inherits from its parent (wired) or index
 * template (classic). Extracted from the route handler so the branching and 400
 * error paths can be unit tested without a live cluster.
 */
export async function resolveInheritedFailureStore({
  name,
  definition,
  getAncestors,
  getTemplate,
}: {
  name: string;
  definition: Streams.all.Definition;
  getAncestors: () => Promise<Streams.WiredStream.Definition[]>;
  getTemplate: () => Promise<SimulatedTemplate>;
}): Promise<{ failure_store: EffectiveFailureStore }> {
  if (!Streams.ingest.all.Definition.is(definition)) {
    throw new StatusError('Inherited failure store is only available for ingest streams', 400);
  }

  // Wired streams inherit from parent streams.
  if (Streams.WiredStream.Definition.is(definition)) {
    const ancestors = await getAncestors();
    const inheritingDefinition: Streams.WiredStream.Definition = {
      ...definition,
      ingest: { ...definition.ingest, failure_store: { inherit: {} } },
    };

    const hasInheritableOrigin = ancestors.some(
      ({ ingest }) => !isInheritFailureStore(ingest.failure_store)
    );
    if (!hasInheritableOrigin) {
      return { failure_store: { disabled: {} } };
    }

    return { failure_store: findInheritedFailureStore(inheritingDefinition, ancestors) };
  }

  const template = await getTemplate();

  if (!template) {
    throw new StatusError(
      `Cannot determine template failure store for ${name} — the data stream may be replicated and managed by a remote cluster`,
      400
    );
  }

  const failureStoreOptions = template.data_stream_options?.failure_store;

  const inherited: EffectiveFailureStore = (() => {
    const enabled = failureStoreOptions?.enabled ?? failureStoreOptions?.lifecycle != null;
    if (!enabled) {
      return { disabled: {} };
    }

    const lifecycle = failureStoreOptions?.lifecycle;
    if (lifecycle?.enabled === false) {
      return { lifecycle: { disabled: {} } };
    }

    const lifecycleEnabled = lifecycle?.enabled ?? lifecycle?.data_retention != null;
    if (lifecycleEnabled) {
      const retention =
        typeof lifecycle?.data_retention === 'string' ? lifecycle.data_retention : undefined;
      return {
        lifecycle: {
          enabled: {
            ...(retention ? { data_retention: retention } : {}),
            is_default_retention: !retention,
          },
        },
      };
    }

    return {
      lifecycle: {
        enabled: {
          is_default_retention: true,
        },
      },
    };
  })();

  return { failure_store: inherited };
}

export const getFailureStoreDefaultRetentionRoute = createServerRoute({
  endpoint: 'GET /internal/streams/failure_store/default_retention',
  options: {
    access: 'internal',
    summary: 'Get failure store default retention',
    description: 'Gets the default retention period for the failure store',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({ request, getScopedClients, server }) => {
    const { scopedClusterClient } = await getScopedClients({
      request,
    });

    const defaultRetention = await getClusterDefaultFailureStoreRetentionValue({
      esClient: scopedClusterClient.asCurrentUser,
      isServerless: !!server.isServerless,
    });

    return { default_retention: defaultRetention };
  },
});

export const failureStoreRoutes = {
  ...getFailureStoreStatsRoute,
  ...inheritedFailureStoreRoute,
  ...getFailureStoreDefaultRetentionRoute,
};
