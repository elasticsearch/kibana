/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiServicesFixture } from '@kbn/scout';
import type { FailureStore } from '@kbn/streams-schema';

/**
 * Pin a stream's failure store configuration via the ingest API so UI tests can
 * start from a deterministic state (instead of clicking through the flyout).
 *
 * This intentionally lives in Streams UI fixtures (not `kbn-scout`) because it
 * is domain-specific and only used by Streams app tests.
 */
export async function pinFailureStore(
  apiServices: ApiServicesFixture,
  streamName: string,
  failureStore: FailureStore
): Promise<void> {
  const definition = await apiServices.streams.getStreamDefinition(streamName);
  const { updated_at: _updatedAt, ...processing } = definition.stream.ingest.processing;
  await apiServices.streams.updateStream(streamName, {
    ingest: {
      ...definition.stream.ingest,
      processing,
      failure_store: failureStore,
    },
  });
}
