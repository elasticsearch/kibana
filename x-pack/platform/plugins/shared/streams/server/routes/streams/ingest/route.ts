/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { badData, badRequest } from '@hapi/boom';
import { z } from '@kbn/zod/v4';
import { Streams } from '@kbn/streams-schema';
import { WiredIngestUpsertRequest, IngestUpsertRequest } from '@kbn/streams-schema';
import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import { createServerRoute } from '../../create_server_route';
import { getWiredIngestResponse, upsertWiredIngestRequest } from '../../../oas_examples';
import { updateWiredIngest, updateClassicIngest } from '../../../lib/streams/helpers/ingest_upsert';

const readIngestRoute = createServerRoute({
  endpoint: 'GET /api/streams/{name}/_ingest 2023-10-31',
  options: {
    access: 'public',
    summary: 'Get ingest stream settings',
    description: 'Fetches the ingest settings of an ingest stream definition',
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
          description: 'Ingest settings for the stream.',
          content: {
            'application/json': {
              examples: {
                getWiredIngest: { value: getWiredIngestResponse },
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
  }): Promise<{ ingest: Streams.ingest.all.Definition['ingest'] }> => {
    const { streamsClient } = await getScopedClients({
      request,
    });

    const name = params.path.name;

    const definition = await streamsClient.getStream(name);

    if (Streams.ingest.all.Definition.is(definition)) {
      return { ingest: definition.ingest };
    }

    throw badRequest(`Stream is not an ingest stream`);
  },
});

const upsertIngestRoute = createServerRoute({
  endpoint: 'PUT /api/streams/{name}/_ingest 2023-10-31',
  options: {
    access: 'public',
    summary: 'Update ingest stream settings',
    description: 'Upserts the ingest settings of an ingest stream definition',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              upsertWiredIngest: { value: upsertWiredIngestRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The ingest settings were updated successfully.',
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
    body: z.object({
      ingest: IngestUpsertRequest.right,
    }),
  }),
  handler: async ({ params, request, getScopedClients }) => {
    const { streamsClient, attachmentClient } = await getScopedClients({
      request,
    });

    const { name } = params.path;
    const { ingest } = params.body;

    const definition = await streamsClient.getStream(name);

    if (!Streams.ingest.all.Definition.is(definition)) {
      throw badData(`_ingest is only supported on Wired and Classic streams`);
    }

    // Replicated data streams are managed by the source cluster via CCR.
    // Ingest settings (routing, processing, field mappings) cannot be modified locally.
    const dataStream = await streamsClient.getDataStream(name).catch(() => null);
    if (dataStream?.replicated) {
      throw badData(
        'Cannot modify ingest settings of a replicated stream. It is managed by the source cluster via cross-cluster replication.'
      );
    }

    if (WiredIngestUpsertRequest.is(ingest)) {
      return await updateWiredIngest({
        streamsClient,
        attachmentClient,
        name,
        ingest,
      });
    }

    return await updateClassicIngest({
      streamsClient,
      attachmentClient,
      name,
      ingest,
    });
  },
});

export const ingestRoutes = {
  ...readIngestRoute,
  ...upsertIngestRoute,
};
