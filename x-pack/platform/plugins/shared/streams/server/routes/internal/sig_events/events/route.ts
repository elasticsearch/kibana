/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  sigEventSchema,
  type Detection,
  type SigEvent,
  type Discovery,
  type LifecycleDetection,
  type EventLifecycleResponse,
} from '@kbn/streams-schema';
import { z } from '@kbn/zod/v4';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import type { PaginatedResponse } from '../../../../lib/sig_events/query_utils';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';

const toArray = (val: string | string[] | undefined): string[] | undefined =>
  val === undefined ? undefined : Array.isArray(val) ? val : [val];

const isLifecycleDetection = (
  hit: Detection
): hit is Detection & { kind: LifecycleDetection['kind'] } => hit.kind !== 'handled';

const collectEmbeddedDetections = (discoveries: Discovery[]) => {
  const seen = new Set<string>();
  const result: Array<Omit<LifecycleDetection, 'kind' | '@timestamp'>> = [];

  for (const discovery of discoveries) {
    for (const det of discovery.detections ?? []) {
      const { detection_id, rule_name, stream_name, change_point_type } = det;
      if (!detection_id || seen.has(detection_id)) continue;
      seen.add(detection_id);
      result.push({ detection_id, rule_name, stream_name, change_point_type });
    }
  }

  return result;
};

const eventsSearchRoute = createServerRoute({
  endpoint: 'GET /internal/sig_events/events',
  options: {
    access: 'internal',
    summary: 'Get latest events',
    description: 'Search event entities using their latest derived state with pagination.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    query: z.object({
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
      page: z.coerce.number().int().min(1).optional(),
      perPage: z.coerce.number().int().min(1).max(1000).optional(),
      status: z.union([z.string().max(50), z.array(z.string().max(50)).max(50)]).optional(),
      stream: z.union([z.string().max(255), z.array(z.string().max(255)).max(50)]).optional(),
      search: z.string().max(500).optional(),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<PaginatedResponse<SigEvent>> => {
    const { getEventClient, licensing, uiSettingsClient } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { status, stream, search, ...rest } = params.query;

    return getEventClient().findLatestPaginated({
      ...rest,
      status: toArray(status),
      stream: toArray(stream),
      search: search || undefined,
    });
  },
});

const eventsHistoryRoute = createServerRoute({
  endpoint: 'GET /internal/sig_events/events/{id}/history',
  options: {
    access: 'internal',
    summary: 'Get event history',
    description: 'Get all historical versions of a significant event entity.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({
      id: z.string().max(255),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server }): Promise<{ hits: SigEvent[] }> => {
    const { getEventClient, licensing, uiSettingsClient } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    return getEventClient().findById(params.path.id);
  },
});

const eventsBulkCreateRoute = createServerRoute({
  endpoint: 'POST /internal/sig_events/events',
  options: {
    access: 'internal',
    summary: 'Bulk create events',
    description: 'Create event entities in bulk.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.array(sigEventSchema),
  }),
  handler: async ({ params, request, getScopedClients, server }) => {
    const { getEventClient, licensing, uiSettingsClient } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    return getEventClient().bulkCreate(params.body);
  },
});

const eventsLifecycleRoute = createServerRoute({
  endpoint: 'GET /internal/sig_events/events/{id}/lifecycle',
  options: {
    access: 'internal',
    summary: 'Get event lifecycle',
    description:
      'Get the full lifecycle chain for a significant event: detections, discoveries, and event versions.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({
      id: z.string().max(255),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<EventLifecycleResponse> => {
    const { getEventClient, getDiscoveryClient, getDetectionClient, licensing, uiSettingsClient } =
      await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { hits: initialHits } = await getEventClient().findById(params.path.id);
    if (initialHits.length === 0) {
      return { detections: [], discoveries: [], events: [] };
    }

    const { discovery_slug: slug } = initialHits[0];

    const [{ hits: events }, { hits: discoveries }] = await Promise.all([
      getEventClient().findByDiscoverySlug(slug),
      getDiscoveryClient().findBySlug(slug),
    ]);

    const embedded = collectEmbeddedDetections(discoveries);
    const { hits: allDetectionHits } = await getDetectionClient().findByIds(
      embedded.map((e) => e.detection_id).filter(Boolean)
    );
    const hitsByDetectionId = new Map(
      allDetectionHits.filter(isLifecycleDetection).map((h) => [h.detection_id, h])
    );

    const detections: LifecycleDetection[] = embedded.flatMap(
      ({ detection_id, rule_name, stream_name, change_point_type }) => {
        const hit = hitsByDetectionId.get(detection_id);
        if (!hit) {
          return [];
        }

        return [
          {
            detection_id,
            rule_name: hit.rule_name ?? rule_name,
            stream_name: hit.stream_name ?? stream_name,
            change_point_type,
            kind: hit.kind,
            '@timestamp': hit['@timestamp'],
          },
        ];
      }
    );

    return { detections, discoveries, events };
  },
});

export const internalSigEventsEventsRoutes = {
  ...eventsSearchRoute,
  ...eventsHistoryRoute,
  ...eventsLifecycleRoute,
  ...eventsBulkCreateRoute,
};
