/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ClassicIngestUpsertRequest } from '@kbn/streams-schema';
import { badData } from '@hapi/boom';
import type { Streams } from '@kbn/streams-schema';
import { z } from '@kbn/zod/v4';

import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import { getErrorMessage } from '../../../lib/streams/errors/parse_error';
import type { UpsertStreamResponse } from '../../../lib/streams/client';
import { createServerRoute } from '../../create_server_route';
import { upsertDataStream } from '../../../lib/streams/data_streams/manage_data_streams';

export const createClassicStreamRoute = createServerRoute({
  endpoint: 'POST /internal/streams/_create_classic',
  options: {
    access: 'internal',
    summary: 'Create a classic stream',
    description:
      'Creates a classic stream by first creating the backing Elasticsearch data stream and then registering it as a classic stream in Kibana',
    availability: {
      stability: 'experimental',
    },
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      ingest: z.any(),
    }),
  }),
  handler: async ({ params, request, getScopedClients, logger }): Promise<UpsertStreamResponse> => {
    const { streamsClient, scopedClusterClient } = await getScopedClients({ request });
    const {
      name,
      description = '',
      ingest,
    } = params.body as {
      name: string;
      description?: string;
      ingest: ClassicIngestUpsertRequest;
    };

    // Step 1: Create the backing data stream
    try {
      await upsertDataStream({
        esClient: scopedClusterClient.asCurrentUser,
        logger,
        name,
      });
    } catch (error) {
      logger.error(
        `Failed to create data stream for classic stream ${name}: ${getErrorMessage(error)}`
      );
      throw badData(`Failed to create data stream: ${getErrorMessage(error)}`);
    }

    // Step 2: Register the classic stream in Kibana
    try {
      const upsertRequest: Streams.ClassicStream.UpsertRequest = {
        dashboards: [],
        rules: [],
        stream: {
          type: 'classic',
          description,
          ingest,
        },
      };

      return await streamsClient.upsertStream({
        request: upsertRequest,
        name,
      });
    } catch (error) {
      logger.error(`Failed to register classic stream ${name}: ${getErrorMessage(error)}`);
      throw badData(`Failed to register classic stream: ${getErrorMessage(error)}`);
    }
  },
});
