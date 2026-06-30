/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantEvent } from '@kbn/significant-events-schema';
import type { EventClient } from '../../../lib/significant_events/events';

export async function searchEventsToolHandler({
  eventClient,
  params,
}: {
  eventClient: EventClient;
  params: {
    query?: string;
    stream_name?: string;
    status?: string[];
    page?: number;
    per_page?: number;
  };
}): Promise<{ events: SignificantEvent[]; page: number; per_page: number; total: number }> {
  const response = await eventClient.findLatestPaginated({
    page: params.page,
    perPage: params.per_page,
    search: params.query,
    stream: params.stream_name ? [params.stream_name] : undefined,
    status: params.status,
  });

  return {
    events: response.hits,
    page: response.page,
    per_page: response.perPage,
    total: response.total,
  };
}
