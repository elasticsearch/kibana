/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SignificantEventsGetResponse } from '@kbn/significant-events-schema';
import { z } from '@kbn/zod/v4';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { BUCKET_SIZE_PATTERN } from '../../../../lib/significant_events/helpers/fill_bucket_gaps';
import { fetchQueryOccurrencesFromAlerts } from '../../../../lib/significant_events/fetch_query_occurrences_from_alerts';
import { getSignificantEventsResponse } from '../../../../oas_examples';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { searchModeSchema } from '../../../utils/search_mode';

// Make sure strings are expected for input, but still converted to a
// Date, without breaking the OpenAPI generator.
// Descriptions must be on the inner z.string() so they propagate to OAS parameters.
const makeDateFromString = (description: string) =>
  z
    .string()
    .describe(description)
    .transform((input) => new Date(input));

const readStreamSignificantEventsRoute = createServerRoute({
  endpoint: 'GET /api/streams/{name}/significant_events 2023-10-31',
  params: z.object({
    path: z.object({ name: z.string().describe('The name of the stream.') }),
    query: z.object({
      from: makeDateFromString('Start of the time range as an ISO 8601 date string.'),
      to: makeDateFromString('End of the time range as an ISO 8601 date string.'),
      bucketSize: z
        .string()
        .regex(BUCKET_SIZE_PATTERN)
        .describe('The bucket size for aggregating events (e.g. "1m", "1h").'),
      query: z
        .string()
        .optional()
        .describe('Query string to filter significant events on metadata fields'),
      searchMode: searchModeSchema,
    }),
  }),

  options: {
    access: 'public',
    summary: 'Read the significant events',
    description: 'Read the significant events',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    deprecated: {
      documentationUrl:
        'https://www.elastic.co/docs/api/doc/serverless/operation/operation-get-streams-name-significant-events',
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
          description: 'Significant events for the stream.',
          content: {
            'application/json': {
              examples: {
                significantEvents: { value: getSignificantEventsResponse },
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
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<SignificantEventsGetResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { streamsClient, scopedClusterClient, licensing, uiSettingsClient } = scopedClients;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });
    await streamsClient.ensureStream(params.path.name);

    const { name } = params.path;
    const { from, to, bucketSize, query, searchMode } = params.query;

    const [kiClient, { alertsReader }] = await Promise.all([
      scopedClients.getKnowledgeIndicatorClient(),
      scopedClients.getSignificantEventsAlertingContext(),
    ]);
    return fetchQueryOccurrencesFromAlerts(
      {
        streamNames: [name],
        from,
        to,
        bucketSize,
        query,
        searchMode,
        alertsReader,
      },
      { kiClient, scopedClusterClient }
    );
  },
});

export const significantEventsRoutes = {
  ...readStreamSignificantEventsRoute,
};
