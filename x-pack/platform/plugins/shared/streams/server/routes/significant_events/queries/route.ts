/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ErrorCause } from '@elastic/elasticsearch/lib/api/types';
import type { StreamQuery } from '@kbn/significant-events-schema';
import { deriveQueryType } from '@kbn/streams-schema';
import {
  bulkStreamQueryInputSchema,
  upsertStreamQueryRequestSchema,
} from '@kbn/significant-events-schema';
import { z } from '@kbn/zod/v4';
import { STREAMS_API_PRIVILEGES } from '../../../../common/constants';
import { QueryNotFoundError } from '../../../lib/streams/errors/query_not_found_error';
import {
  upsertStreamQueryRequest,
  bulkStreamQueriesRequest,
  listStreamQueriesResponse,
} from '../../../oas_examples';
import {
  EsqlQueryValidationError,
  validateEsqlQueryForStreamOrThrow,
} from '../../../lib/significant_events/validate_esql_query';
import { createServerRoute } from '../../create_server_route';
import { assertSignificantEventsAccess } from '../../utils/assert_significant_events_access';

export interface ListQueriesResponse {
  queries: StreamQuery[];
}

export interface UpsertQueryResponse {
  acknowledged: boolean;
}

export interface DeleteQueryResponse {
  acknowledged: boolean;
}

export type BulkUpdateAssetsResponse = { acknowledged: boolean } | { errors: ErrorCause[] };

const listQueriesRoute = createServerRoute({
  endpoint: 'GET /api/streams/{name}/queries 2023-10-31',
  options: {
    access: 'public',
    summary: 'Get stream queries',
    description:
      'Fetches all queries linked to a stream that are visible to the current user in the current space.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    deprecated: {
      documentationUrl:
        'https://www.elastic.co/docs/api/doc/serverless/operation/operation-get-streams-name-queries',
      severity: 'warning',
      message:
        'This experimental Significant Events endpoint is deprecated and will be removed in a future release.',
      reason: { type: 'remove' },
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
          description: 'List of queries linked to the stream.',
          content: {
            'application/json': {
              examples: {
                listQueries: { value: listStreamQueriesResponse },
              },
            },
          },
        },
      },
    }),
  },
  params: z.object({
    path: z.object({
      name: z.string().describe('The name of the stream.'),
    }),
  }),
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  async handler({ params, request, getScopedClients, server }): Promise<ListQueriesResponse> {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });
    await streamsClient.ensureStream(params.path.name);

    const {
      path: { name: streamName },
    } = params;

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    const { [streamName]: queryLinks } = await kiClient.getStreamToQueryLinksMap([streamName]);

    return {
      queries: queryLinks.map((queryLink) => queryLink.query),
    };
  },
});

const upsertQueryRoute = createServerRoute({
  endpoint: 'PUT /api/streams/{name}/queries/{queryId} 2023-10-31',
  options: {
    access: 'public',
    summary: 'Upsert a query to a stream',
    description: 'Adds a query to a stream. Noop if the query is already present on the stream.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    deprecated: {
      documentationUrl:
        'https://www.elastic.co/docs/api/doc/serverless/operation/operation-put-streams-name-queries-queryid',
      severity: 'warning',
      message:
        'This experimental Significant Events endpoint is deprecated and will be removed in a future release.',
      reason: { type: 'remove' },
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              upsertQuery: { value: upsertStreamQueryRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'The query was added or updated successfully.',
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
      queryId: z.string().describe('The identifier of the query.'),
    }),
    body: upsertStreamQueryRequestSchema,
  }),
  handler: async ({ params, request, getScopedClients, server }): Promise<UpsertQueryResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;
    const {
      path: { name: streamName, queryId },
      body,
    } = params;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const definition = await streamsClient.getStream(streamName);

    validateEsqlQueryForStreamOrThrow({
      esqlQuery: body.esql.query,
      stream: definition,
    });

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    await kiClient.upsertQuery(definition, {
      id: queryId,
      type: deriveQueryType(body.esql.query),
      title: body.title,
      description: body.description,
      esql: body.esql,
      severity_score: body.severity_score,
      evidence: body.evidence,
      expires_at: body.expires_at,
    });

    return {
      acknowledged: true,
    };
  },
});

const deleteQueryRoute = createServerRoute({
  endpoint: 'DELETE /api/streams/{name}/queries/{queryId} 2023-10-31',
  options: {
    access: 'public',
    summary: 'Remove a query from a stream',
    description: 'Remove a query from a stream. Noop if the query is not found on the stream.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    deprecated: {
      documentationUrl:
        'https://www.elastic.co/docs/api/doc/serverless/operation/operation-delete-streams-name-queries-queryid',
      severity: 'warning',
      message:
        'This experimental Significant Events endpoint is deprecated and will be removed in a future release.',
      reason: { type: 'remove' },
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
          description: 'The query was removed successfully.',
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
      queryId: z.string().describe('The identifier of the query to remove.'),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    logger,
    server,
  }): Promise<DeleteQueryResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { queryId, name: streamName },
    } = params;

    const definition = await streamsClient.getStream(streamName);

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    const queryLink = await kiClient.bulkGetQueriesByIds(streamName, [queryId]);
    if (queryLink.length === 0) {
      throw new QueryNotFoundError(`Query [${queryId}] not found in stream [${streamName}]`);
    }

    await kiClient.deleteQuery(definition, queryId);

    logger.get('significant_events').debug(`Deleting query ${queryId} for stream ${streamName}`);

    return {
      acknowledged: true,
    };
  },
});

const bulkQueriesRoute = createServerRoute({
  endpoint: `POST /api/streams/{name}/queries/_bulk 2023-10-31`,
  options: {
    access: 'public',
    summary: 'Bulk update queries',
    description: 'Bulk update queries of a stream. Can add new queries and delete existing ones.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    deprecated: {
      documentationUrl:
        'https://www.elastic.co/docs/api/doc/serverless/operation/operation-post-streams-name-queries-bulk',
      severity: 'warning',
      message:
        'This experimental Significant Events endpoint is deprecated and will be removed in a future release.',
      reason: { type: 'remove' },
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              bulkQueries: { value: bulkStreamQueriesRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Bulk operation completed successfully.',
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
      operations: z.array(
        z.union([
          z.object({
            index: bulkStreamQueryInputSchema,
          }),
          z.object({
            delete: z.object({ id: z.string() }),
          }),
        ])
      ),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    logger,
    server,
  }): Promise<BulkUpdateAssetsResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, licensing, uiSettingsClient } = scopedClients;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { name: streamName },
      body: { operations },
    } = params;

    const definition = await streamsClient.getStream(streamName);

    // Validation is all-or-nothing: if any index operation fails validation,
    // the entire batch is rejected. Operations that pass validation are
    // collected in typedOperations and applied atomically via kiClient.syncQueries.
    const validationErrors: Array<{ id: string; message: string }> = [];
    const typedOperations: Array<{ index?: StreamQuery; delete?: { id: string } }> = [];

    for (const operation of operations) {
      if ('index' in operation && operation.index) {
        const { id, title, description, esql, severity_score, evidence, expires_at } =
          operation.index;
        try {
          validateEsqlQueryForStreamOrThrow({ esqlQuery: esql.query, stream: definition });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          validationErrors.push({ id, message });
          continue;
        }
        typedOperations.push({
          index: {
            id,
            title,
            description,
            esql,
            severity_score,
            evidence,
            expires_at,
            type: deriveQueryType(esql.query),
          },
        });
      } else if ('delete' in operation) {
        typedOperations.push(operation);
      }
    }

    if (validationErrors.length > 0) {
      throw new EsqlQueryValidationError('One or more ES|QL queries are invalid', {
        errors: validationErrors,
      });
    }

    const kiClient = await scopedClients.getKnowledgeIndicatorClient();
    const deleteIds = new Set(typedOperations.flatMap((op) => (op.delete ? [op.delete.id] : [])));
    const indexQueriesById = new Map(
      typedOperations.flatMap((op) => (op.index ? [[op.index.id, op.index] as const] : []))
    );
    const { [streamName]: currentLinks } = await kiClient.getStreamToQueryLinksMap([streamName]);
    const currentIds = new Set(currentLinks.map((l) => l.query.id));
    const nextQueries: StreamQuery[] = [
      ...currentLinks
        .filter((l) => !deleteIds.has(l.query.id))
        .map((l) => indexQueriesById.get(l.query.id) ?? l.query),
      ...Array.from(indexQueriesById.values()).filter((q) => !currentIds.has(q.id)),
    ];
    await kiClient.syncQueries(definition, nextQueries, { currentLinks });

    logger
      .get('significant_events')
      .debug(
        `Performing bulk significant events operation with ${operations.length} operations for stream ${streamName}`
      );

    return { acknowledged: true };
  },
});

export const queryRoutes = {
  ...listQueriesRoute,
  ...upsertQueryRoute,
  ...deleteQueryRoute,
  ...bulkQueriesRoute,
};
