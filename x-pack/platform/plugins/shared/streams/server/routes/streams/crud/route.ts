/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { badData } from '@hapi/boom';
import { Streams } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS } from '@kbn/management-settings-ids';
import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import type { UpsertStreamResponse } from '../../../lib/streams/client';
import { createServerRoute } from '../../create_server_route';
import { classicIngestHasEsLevelChanges } from '../../../lib/streams/state_management/streams/helpers';
import { readStream } from './read_stream';
import { createClassicStreamRoute } from './create_classic_stream_route';
import { validateClassicStreamRoute } from './validate_classic_stream_route';
import {
  createWiredStreamRequest,
  updateClassicStreamRequest,
  createQueryStreamRequest,
  getWiredStreamResponse,
  listStreamsResponse,
} from '../../../oas_examples';

export const readStreamRoute = createServerRoute({
  endpoint: 'GET /api/streams/{name} 2023-10-31',
  options: {
    access: 'public',
    summary: 'Get a stream',
    description: 'Fetches a stream definition and associated dashboards',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {},
          },
        },
      },
      responses: {
        200: {
          description: 'Stream definition and associated metadata.',
          content: {
            'application/json': {
              examples: {
                getWiredStream: { value: getWiredStreamResponse },
              },
            },
          },
        },
      },
    }),
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ name: z.string().describe('The name of the stream.') }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
  }): Promise<Streams.all.GetResponse> => {
    const { attachmentClient, streamsClient, scopedClusterClient } = await getScopedClients({
      request,
    });

    const body = await readStream({
      name: params.path.name,
      attachmentClient,
      scopedClusterClient,
      streamsClient,
      logger,
    });

    return body;
  },
});

export const listStreamsRoute = createServerRoute({
  endpoint: 'GET /api/streams 2023-10-31',
  options: {
    access: 'public',
    description: 'Fetches list of all streams',
    summary: 'Get stream list',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {},
          },
        },
      },
      responses: {
        200: {
          description: 'A list of all streams.',
          content: {
            'application/json': {
              examples: {
                listStreams: { value: listStreamsResponse },
              },
            },
          },
        },
      },
    }),
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
  }): Promise<{ streams: Streams.all.Definition[] }> => {
    const { streamsClient } = await getScopedClients({ request });
    return {
      streams: await streamsClient.listStreams(),
    };
  },
});

export const editStreamRoute = createServerRoute({
  endpoint: 'PUT /api/streams/{name} 2023-10-31',
  options: {
    access: 'public',
    summary: 'Create or update a stream',
    description:
      'Creates or updates a stream definition. Classic streams can not be created through this API, only updated',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              createWiredStream: { value: createWiredStreamRequest },
              updateClassicStream: { value: updateClassicStreamRequest },
              createQueryStream: { value: createQueryStreamRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The stream was created or updated successfully.',
        },
      },
    }),
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({
      name: z.string().describe('The name of the stream.'),
    }),
    body: Streams.all.UpsertRequest.right,
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    context,
  }): Promise<UpsertStreamResponse> => {
    const { streamsClient } = await getScopedClients({ request });

    // Replicated data streams are managed by the source cluster via CCR.
    // Only Kibana-side data (description, dashboards, rules) can be updated.
    if (Streams.ClassicStream.UpsertRequest.is(params.body)) {
      const dataStream = await streamsClient.getDataStream(params.path.name).catch(() => null);
      if (dataStream?.replicated && classicIngestHasEsLevelChanges(params.body.stream.ingest)) {
        throw badData(
          'Cannot modify Elasticsearch-managed settings (processing, lifecycle, settings, field overrides, failure store) of a replicated stream. It is managed by the source cluster via cross-cluster replication.'
        );
      }
    }

    if (
      Streams.WiredStream.UpsertRequest.is(params.body) &&
      !(await streamsClient.isStreamsEnabled())
    ) {
      throw badData('Streams are not enabled for Wired streams.');
    }

    const core = await context.core;
    const queryStreamsEnabled = await core.uiSettings.client.get(
      OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS
    );

    if (Streams.QueryStream.UpsertRequest.is(params.body) && !queryStreamsEnabled) {
      throw badData('Streams are not enabled for Query streams.');
    }

    return await streamsClient.upsertStream({
      request: params.body,
      name: params.path.name,
    });
  },
});

export const deleteStreamRoute = createServerRoute({
  endpoint: 'DELETE /api/streams/{name} 2023-10-31',
  options: {
    access: 'public',
    summary: 'Delete a stream',
    description: 'Deletes a stream definition and the underlying data stream',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {},
          },
        },
      },
      responses: {
        200: {
          description: 'The stream was deleted successfully.',
        },
      },
    }),
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({
      name: z.string().describe('The name of the stream.'),
    }),
  }),
  handler: async ({ params, request, getScopedClients }): Promise<{ acknowledged: true }> => {
    const { streamsClient } = await getScopedClients({
      request,
    });

    // Replicated data streams are managed by the source cluster via CCR and cannot be deleted locally
    const dataStream = await streamsClient.getDataStream(params.path.name).catch(() => null);
    if (dataStream?.replicated) {
      throw badData(
        'Cannot delete a replicated stream. It is managed by the source cluster via cross-cluster replication.'
      );
    }

    return await streamsClient.deleteStream(params.path.name);
  },
});

export const crudRoutes = {
  ...readStreamRoute,
  ...listStreamsRoute,
  ...editStreamRoute,
  ...deleteStreamRoute,
  ...createClassicStreamRoute,
  ...validateClassicStreamRoute,
};
