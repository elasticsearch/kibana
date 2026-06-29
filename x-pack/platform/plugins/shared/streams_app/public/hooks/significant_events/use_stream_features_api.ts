/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useAbortController } from '@kbn/react-hooks';
import type { FeaturesIdentificationTaskResult } from '@kbn/streams-plugin/server/routes/internal/significant_events/features/route';
import { useKibana } from '../use_kibana';
import { getLast24HoursTimeRange } from '../../util/time_range';

interface StreamFeaturesApi {
  /** @deprecated Use GET /internal/streams/{name}/onboarding/_status instead */
  getFeaturesIdentificationStatus: () => Promise<FeaturesIdentificationTaskResult>;
  /** @deprecated Use POST /internal/streams/{name}/onboarding/_execute instead */
  scheduleFeaturesIdentificationTask: () => Promise<void>;
  /** @deprecated Use POST /internal/streams/{name}/onboarding/_execute with action: 'cancel' instead */
  cancelFeaturesIdentificationTask: () => Promise<void>;
  deleteFeature: (id: string) => Promise<void>;
  deleteFeaturesInBulk: (uuids: string[]) => Promise<void>;
  excludeFeaturesInBulk: (uuids: string[]) => Promise<void>;
  restoreFeaturesInBulk: (uuids: string[]) => Promise<void>;
}

export function useStreamFeaturesApi(streamName: string): StreamFeaturesApi {
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
      getFeaturesIdentificationStatus: async () => {
        return streamsRepositoryClient.fetch('GET /internal/streams/{name}/features/_status', {
          signal,
          params: {
            path: { name: streamName },
          },
        });
      },
      scheduleFeaturesIdentificationTask: async () => {
        const { from, to } = getLast24HoursTimeRange();
        await streamsRepositoryClient.fetch('POST /internal/streams/{name}/features/_task', {
          signal,
          params: {
            path: { name: streamName },
            body: {
              action: 'schedule',
              to,
              from,
            },
          },
        });
      },
      cancelFeaturesIdentificationTask: async () => {
        await streamsRepositoryClient.fetch('POST /internal/streams/{name}/features/_task', {
          signal,
          params: {
            path: { name: streamName },
            body: {
              action: 'cancel',
            },
          },
        });
      },
      deleteFeature: async (id: string) => {
        await streamsRepositoryClient.fetch('DELETE /internal/streams/{name}/features/{id}', {
          signal,
          params: {
            path: { name: streamName, id },
          },
        });
      },
      deleteFeaturesInBulk: async (ids: string[]) => {
        await streamsRepositoryClient.fetch('POST /internal/streams/{name}/features/_bulk', {
          signal,
          params: {
            path: { name: streamName },
            body: {
              operations: ids.map((id) => ({ delete: { id } })),
            },
          },
        });
      },
      excludeFeaturesInBulk: async (ids: string[]) => {
        await streamsRepositoryClient.fetch('POST /internal/streams/{name}/features/_bulk', {
          signal,
          params: {
            path: { name: streamName },
            body: {
              operations: ids.map((id) => ({ exclude: { id } })),
            },
          },
        });
      },
      restoreFeaturesInBulk: async (ids: string[]) => {
        await streamsRepositoryClient.fetch('POST /internal/streams/{name}/features/_bulk', {
          signal,
          params: {
            path: { name: streamName },
            body: {
              operations: ids.map((id) => ({ restore: { id } })),
            },
          },
        });
      },
    }),
    [streamsRepositoryClient, signal, streamName]
  );
}
