/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlData, SmlTypeDefinition } from '@kbn/agent-context-layer-plugin/server';
import type { SigEvent } from '@kbn/streams-schema';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE, SIGNIFICANT_EVENT_SML_TYPE } from '../../../common';
import { STREAMS_API_PRIVILEGES } from '../../../common/constants';
import { EventService } from '../../lib/sig_events/events/event_service';
import type { GetScopedClients } from '../../routes/types';

interface CreateSignificantEventSmlTypeOptions {
  getScopedClients: GetScopedClients;
}

const PAGE_SIZE = 100;

const eventToSmlContent = (event: SigEvent): string => {
  return [
    event.title,
    event.summary,
    event.root_cause,
    `status: ${event.status}`,
    `criticality: ${event.criticality}`,
    `confidence: ${event.confidence}`,
    `streams: ${event.stream_names.join(', ')}`,
    event.recommendations.length > 0
      ? `recommendations: ${event.recommendations.join('\n')}`
      : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');
};

export const createSignificantEventSmlType = ({
  getScopedClients,
}: CreateSignificantEventSmlTypeOptions): SmlTypeDefinition => {
  const eventService = new EventService();

  return {
    id: SIGNIFICANT_EVENT_SML_TYPE,
    fetchFrequency: () => '10m',

    async *list(context) {
      const eventClient = eventService.getClient({
        esClient: context.esClient,
        space: DEFAULT_SPACE_ID,
      });
      let page = 1;

      while (true) {
        try {
          const { hits } = await eventClient.findLatestPaginated({ page, perPage: PAGE_SIZE });

          if (hits.length === 0) {
            return;
          }

          yield hits.map((event) => ({
            id: event.discovery_slug,
            updatedAt: event['@timestamp'],
            spaces: ['*'],
          }));

          if (hits.length < PAGE_SIZE) {
            return;
          }
          page++;
        } catch (error) {
          context.logger.warn(
            `SML significant event: failed to list events: ${(error as Error).message}`
          );
          return;
        }
      }
    },

    getSmlData: async (originId, context): Promise<SmlData | undefined> => {
      try {
        const eventClient = eventService.getClient({
          esClient: context.esClient,
          space: DEFAULT_SPACE_ID,
        });
        const { hits } = await eventClient.findByDiscoverySlug(originId);
        const event = hits.at(-1);

        if (!event) {
          return undefined;
        }

        return {
          chunks: [
            {
              type: SIGNIFICANT_EVENT_SML_TYPE,
              title: event.title,
              content: eventToSmlContent(event),
              permissions: {
                kibana: { privileges: [{ name: `api:${STREAMS_API_PRIVILEGES.read}` }] },
                elasticsearch: { indices: [] },
              },
            },
          ],
        };
      } catch (error) {
        context.logger.warn(
          `SML significant event: failed to get data for '${originId}': ${(error as Error).message}`
        );
        return undefined;
      }
    },

    toAttachment: async (item, context) => {
      if (!item.origin_id) {
        return undefined;
      }
      const { getEventClient } = await getScopedClients({ request: context.request });
      const { hits } = await getEventClient().findByDiscoverySlug(item.origin_id);
      const event = hits.at(-1);

      if (!event) {
        return undefined;
      }

      return {
        type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
        origin: event.discovery_slug,
        data: event,
      };
    },
  };
};
