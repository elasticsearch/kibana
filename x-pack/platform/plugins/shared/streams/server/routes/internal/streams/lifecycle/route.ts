/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { BooleanFromString } from '@kbn/zod-helpers/v4';
import type { IndicesGetResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IScopedClusterClient } from '@kbn/core/server';
import { isNotFoundError } from '@kbn/es-errors';
import {
  MAX_STREAM_NAME_LENGTH,
  Streams,
  findInheritedLifecycle,
  isIlmLifecycle,
  type IlmPolicyWithUsage,
} from '@kbn/streams-schema';
import { processAsyncInChunks } from '../../../../utils/process_async_in_chunks';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { createServerRoute } from '../../../create_server_route';
import { ilmPhases } from '../../../../lib/streams/lifecycle/ilm_phases';
import { getEffectiveLifecycle } from '../../../../lib/streams/lifecycle/get_effective_lifecycle';
import {
  getTemplateLifecycle,
  simulateClassicStreamTemplate,
} from '../../../../lib/streams/data_streams/manage_data_streams';
import {
  buildPolicyUsage,
  normalizeIlmPhases,
  type IlmPoliciesResponse,
} from '../../../../lib/streams/lifecycle/ilm_policies';
import {
  getExistingPolicy,
  assertValidPolicyPhases,
  assertPolicyNameIsValid,
} from '../../../../lib/streams/lifecycle/ilm_policy_validation';
import { StatusError } from '../../../../lib/streams/errors/status_error';

const getDataStreamByBackingIndices = async (
  scopedClusterClient: IScopedClusterClient,
  policiesResponse: IlmPoliciesResponse
): Promise<Record<string, string>> => {
  const inUseIndices = Array.from(
    new Set(
      Object.values(policiesResponse).flatMap((policyEntry) => policyEntry.in_use_by?.indices ?? [])
    )
  );

  if (inUseIndices.length === 0) {
    return {};
  }

  const indexResponse = await processAsyncInChunks<IndicesGetResponse>(
    inUseIndices,
    async (indicesChunk) =>
      scopedClusterClient.asCurrentUser.indices.get({
        index: indicesChunk,
        allow_no_indices: true,
        ignore_unavailable: true,
        filter_path: ['*.data_stream'],
      })
  );

  return Object.fromEntries(
    Object.entries(indexResponse).flatMap(([indexName, indexData]) => {
      const { data_stream: dataStream } = indexData;
      return dataStream ? [[indexName, dataStream]] : [];
    })
  );
};

const lifecycleStatsRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/lifecycle/_stats',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ name: z.string().max(MAX_STREAM_NAME_LENGTH) }),
  }),
  handler: async ({ params, request, getScopedClients }) => {
    const { scopedClusterClient, streamsClient } = await getScopedClients({ request });
    const name = params.path.name;

    const definition = await streamsClient.getStream(name);
    if (!Streams.ingest.all.Definition.is(definition)) {
      throw new StatusError('Lifecycle stats are only available for ingest streams', 400);
    }

    const dataStream = await streamsClient.getDataStream(name);
    const lifecycle = await getEffectiveLifecycle({ definition, streamsClient, dataStream });
    if (!isIlmLifecycle(lifecycle)) {
      throw new StatusError('Lifecycle stats are only available for ILM policy', 400);
    }

    const policyName = lifecycle.ilm.policy;
    let policyDetails: Awaited<
      ReturnType<typeof scopedClusterClient.asCurrentUser.ilm.getLifecycle>
    >;
    try {
      policyDetails = await scopedClusterClient.asCurrentUser.ilm.getLifecycle({
        name: policyName,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return { phases: undefined, policy_missing: true };
      }
      throw error;
    }

    const { policy } = policyDetails[policyName];

    const [{ indices: indicesIlmDetails }, { indices: indicesStats = {} }] = await Promise.all([
      scopedClusterClient.asCurrentUser.ilm.explainLifecycle({ index: name }),
      scopedClusterClient.asCurrentUser.indices.stats({ index: dataStream.name }),
    ]);

    return {
      phases: ilmPhases({ policy, indicesIlmDetails, indicesStats }),
      policy_missing: false,
    };
  },
});

const lifecycleIlmExplainRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/lifecycle/_explain',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ name: z.string().max(MAX_STREAM_NAME_LENGTH) }),
  }),
  handler: async ({ params, request, getScopedClients }) => {
    const { scopedClusterClient, streamsClient } = await getScopedClients({ request });
    const name = params.path.name;

    // verifies read privileges
    await streamsClient.getStream(name);

    return scopedClusterClient.asCurrentUser.ilm.explainLifecycle({
      index: name,
    });
  },
});

const lifecycleInheritedRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/lifecycle/_inherited',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ name: z.string().max(MAX_STREAM_NAME_LENGTH) }),
  }),
  handler: async ({ params, request, getScopedClients, logger }) => {
    const { scopedClusterClient, streamsClient } = await getScopedClients({ request });
    const name = params.path.name;

    const definition = await streamsClient.getStream(name);
    if (!Streams.ingest.all.Definition.is(definition)) {
      throw new StatusError('Inherited lifecycle is only available for ingest streams', 400);
    }

    if (Streams.WiredStream.Definition.is(definition)) {
      const ancestors = await streamsClient.getAncestors(name);
      const inheritingDefinition: Streams.WiredStream.Definition = {
        ...definition,
        ingest: { ...definition.ingest, lifecycle: { inherit: {} } },
      };

      return { lifecycle: findInheritedLifecycle(inheritingDefinition, ancestors) };
    }

    const template = await simulateClassicStreamTemplate({
      esClient: scopedClusterClient.asCurrentUser,
      name,
      logger,
    });

    if (!template || !template.settings) {
      throw new StatusError(
        `Cannot determine template lifecycle for ${name} — the data stream may be replicated and managed by a remote cluster`,
        400
      );
    }

    return { lifecycle: getTemplateLifecycle(template) };
  },
});

const lifecycleIlmPoliciesRoute = createServerRoute({
  endpoint: 'GET /internal/streams/lifecycle/_policies',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({}),
  handler: async ({ request, getScopedClients }): Promise<IlmPolicyWithUsage[]> => {
    const { scopedClusterClient } = await getScopedClients({ request });
    const policiesResponse =
      (await scopedClusterClient.asCurrentUser.ilm.getLifecycle()) as IlmPoliciesResponse;
    const dataStreamByBackingIndices = await getDataStreamByBackingIndices(
      scopedClusterClient,
      policiesResponse
    );
    return Object.entries(policiesResponse).map(([policyName, policyEntry]) => {
      const { in_use_by } = buildPolicyUsage(policyEntry, dataStreamByBackingIndices);
      return {
        name: policyName,
        phases: normalizeIlmPhases(policyEntry.policy?.phases),
        meta: policyEntry.policy?._meta,
        deprecated: policyEntry.policy?.deprecated,
        in_use_by,
      };
    });
  },
});

const ilmPhaseSchema = z.looseObject({
  min_age: z.string().optional(),
  actions: z.record(z.string(), z.any()).optional(),
});

const lifecycleIlmPoliciesUpdateRoute = createServerRoute({
  endpoint: 'POST /internal/streams/lifecycle/_policy',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      name: z.string(),
      phases: z.object({
        hot: ilmPhaseSchema.optional(),
        warm: ilmPhaseSchema.optional(),
        cold: ilmPhaseSchema.optional(),
        frozen: ilmPhaseSchema.optional(),
        delete: ilmPhaseSchema.optional(),
      }),
      meta: z.record(z.string(), z.any()).optional(),
      deprecated: z.boolean().optional(),
      source_policy_name: z.string().optional(),
    }),
    query: z.object({
      allow_overwrite: BooleanFromString.optional().default(false),
    }),
  }),
  handler: async ({ params, request, getScopedClients }) => {
    const { scopedClusterClient } = await getScopedClients({ request });
    const { name, meta, source_policy_name: sourcePolicyName, ...policy } = params.body;
    const { allow_overwrite: allowOverwrite = false } = params.query;
    const existingPolicy = await getExistingPolicy(scopedClusterClient, name);
    const sourcePolicy = sourcePolicyName
      ? await getExistingPolicy(scopedClusterClient, sourcePolicyName)
      : undefined;

    assertPolicyNameIsValid(existingPolicy, allowOverwrite);

    assertValidPolicyPhases({
      existingPolicy,
      incomingPhases: policy.phases,
      sourcePolicy,
    });

    const basePolicy = existingPolicy?.policy ?? {};
    const mergedPolicy = {
      ...basePolicy,
      ...policy,
      phases: policy.phases ?? basePolicy.phases,
      _meta: meta ?? basePolicy._meta,
      deprecated: policy.deprecated ?? basePolicy.deprecated,
    };
    await scopedClusterClient.asCurrentUser.ilm.putLifecycle({ name, policy: mergedPolicy });
    return { acknowledged: true };
  },
});

const lifecycleSnapshotRepositoriesRoute = createServerRoute({
  endpoint: 'GET /internal/streams/lifecycle/_snapshot_repositories',
  options: {
    access: 'internal',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({}),
  handler: async ({
    request,
    getScopedClients,
  }): Promise<{ repositories: Array<{ name: string; type: string }> }> => {
    const { scopedClusterClient } = await getScopedClients({ request });
    const repositoriesByName = await scopedClusterClient.asCurrentUser.snapshot.getRepository({
      name: '*',
    });

    const repositories = Object.entries(repositoriesByName).map(([name, { type }]) => ({
      name,
      type: type ?? '',
    }));

    return { repositories };
  },
});

export const internalLifecycleRoutes = {
  ...lifecycleStatsRoute,
  ...lifecycleIlmExplainRoute,
  ...lifecycleInheritedRoute,
  ...lifecycleIlmPoliciesRoute,
  ...lifecycleIlmPoliciesUpdateRoute,
  ...lifecycleSnapshotRepositoriesRoute,
};
