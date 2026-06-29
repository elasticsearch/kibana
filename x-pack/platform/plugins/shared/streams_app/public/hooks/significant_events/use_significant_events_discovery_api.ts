/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useAbortController } from '@kbn/react-hooks';
import { useMemo } from 'react';
import { useKibana } from '../use_kibana';

export const useSignificantEventsDiscoveryApi = () => {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const { signal } = useAbortController();

  return useMemo(
    () => ({
      triggerSignificantEventsDiscovery: () =>
        streamsRepositoryClient.fetch(
          'POST /internal/streams/significant_events/discovery/_execute',
          {
            // No abort signal: aborting a fire-and-track mutation would silently
            // start the server workflow with no client-side tracking.
            params: { body: { action: 'trigger' as const } },
            signal: null,
          }
        ),
      cancelSignificantEventsDiscovery: () =>
        streamsRepositoryClient.fetch(
          'POST /internal/streams/significant_events/discovery/_execute',
          {
            // No abort signal: cancel is fire-and-forget — aborting mid-flight
            // would leave the server/client state diverged.
            params: { body: { action: 'cancel' as const } },
            signal: null,
          }
        ),
      getSignificantEventsDiscoveryStatus: () =>
        streamsRepositoryClient.fetch(
          'GET /internal/streams/significant_events/discovery/_status',
          { params: {}, signal }
        ),
    }),
    [signal, streamsRepositoryClient]
  );
};
