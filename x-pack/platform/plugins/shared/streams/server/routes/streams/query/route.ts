/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { badData, badRequest } from '@hapi/boom';
import { Streams } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS } from '@kbn/management-settings-ids';
import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import { createServerRoute } from '../../create_server_route';
import { getEsqlView } from '../../../lib/streams/esql_views/manage_esql_views';
import { upsertQueryStreamRequest } from '../../../oas_examples';
import { upsertQueryStream } from '../../../lib/streams/helpers/query_upsert';

/**
 * Schema for API request body - accepts esql for UX simplicity.
 * This is different from the stored Query schema which uses { view: string }.
 */
const queryRequestBodySchema = z.object({
  esql: z.string(),
});

export interface QueryStreamObjectGetResponse {
  /** The view reference stored in the definition */
  query: Streams.QueryStream.Definition['query'] & { esql: string };
  /** Field descriptions map (field name -> description) */
  field_descriptions?: Record<string, string>;
}

const readQueryStreamRoute = createServerRoute({
  endpoint: 'GET /api/streams/{name}/_query 2023-10-31',
  options: {
    access: 'public',
    summary: 'Get query stream settings',
    description: 'Fetches the query settings of a query stream definition',
    availability: {
      since: '9.4.0',
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
          description: 'Query settings for the stream.',
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
    path: z.object({ name: z.string().describe('The name of the query stream.') }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    logger,
  }): Promise<QueryStreamObjectGetResponse> => {
    const { streamsClient, scopedClusterClient } = await getScopedClients({
      request,
    });

    const { name } = params.path;

    const definition = await streamsClient.getStream(name);

    if (!Streams.QueryStream.Definition.is(definition)) {
      throw badRequest(`Stream is not a query stream`);
    }

    // Fetch the actual esql from the ES|QL view
    const viewName = definition.query.view;
    const esqlView = await getEsqlView({
      esClient: scopedClusterClient.asCurrentUser,
      logger,
      name: viewName,
    });

    return {
      query: {
        ...definition.query,
        esql: esqlView.query,
      },
      ...(definition.field_descriptions && { field_descriptions: definition.field_descriptions }),
    };
  },
});

const upsertQueryStreamRoute = createServerRoute({
  endpoint: 'PUT /api/streams/{name}/_query 2023-10-31',
  options: {
    access: 'public',
    description: 'Upserts the query settings of a query stream definition',
    summary: 'Upsert query stream settings',
    availability: {
      since: '9.4.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              upsertQueryStream: { value: upsertQueryStreamRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The query stream settings were updated successfully.',
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
      name: z.string().describe('The name of the query stream.'),
    }),
    body: z.object({
      // API accepts esql for UX simplicity, not the stored query format
      query: queryRequestBodySchema,
      // Optional field descriptions map
      field_descriptions: z.record(z.string(), z.string()).optional(),
    }),
  }),
  handler: async ({ params, request, getScopedClients, context }) => {
    const { streamsClient, attachmentClient } = await getScopedClients({
      request,
    });

    const core = await context.core;
    const queryStreamsEnabled = await core.uiSettings.client.get(
      OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS
    );

    if (!queryStreamsEnabled) {
      throw badData('Streams are not enabled for Query streams.');
    }

    const { name } = params.path;
    const { esql } = params.body.query;
    const { field_descriptions: fieldDescriptions } = params.body;

    // The state management layer handles ES|QL view creation/update and validation.
    return await upsertQueryStream({
      streamsClient,
      attachmentClient,
      name,
      esql,
      fieldDescriptions,
    });
  },
});

export const queryStreamRoutes = {
  ...readQueryStreamRoute,
  ...upsertQueryStreamRoute,
};
