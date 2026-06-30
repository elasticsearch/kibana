/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useAbortController } from '@kbn/react-hooks';
import { useMemo } from 'react';
import { useKibana } from '../use_kibana';

export interface PromoteResult {
  promoted: number;
  skipped_stats: number;
}

interface QueriesApi {
  promote: ({ queryIds }: { queryIds: string[] }) => Promise<PromoteResult>;
  demote: ({ queryIds }: { queryIds: string[] }) => Promise<{ demoted: number }>;
  removeQuery: ({ queryId, streamName }: { queryId: string; streamName: string }) => Promise<void>;
  deleteQueriesInBulk: ({
    queryIds,
    streamName,
  }: {
    queryIds: string[];
    streamName: string;
  }) => Promise<void>;
  abort: () => void;
}

export function useQueriesApi(): QueriesApi {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const { signal, abort, refresh } = useAbortController();

  return useMemo(
    () => ({
      promote: async ({ queryIds }: { queryIds: string[] }) => {
        const params = { body: { queryIds } };
        return streamsRepositoryClient.fetch('POST /internal/streams/queries/_promote', {
          params,
          signal: null,
        });
      },
      demote: async ({ queryIds }: { queryIds: string[] }) => {
        const params = { body: { queryIds } };
        return streamsRepositoryClient.fetch('POST /internal/streams/queries/_demote', {
          params,
          signal: null,
        });
      },
      removeQuery: async ({ queryId }: { queryId: string; streamName: string }) => {
        await streamsRepositoryClient.fetch('POST /internal/streams/queries/_bulk_delete', {
          signal,
          params: {
            body: {
              queryIds: [queryId],
            },
          },
        });
      },
      deleteQueriesInBulk: async ({ queryIds }: { queryIds: string[]; streamName: string }) => {
        await streamsRepositoryClient.fetch('POST /internal/streams/queries/_bulk_delete', {
          signal: null,
          params: {
            body: {
              queryIds,
            },
          },
        });
      },
      abort: () => {
        abort();
        refresh();
      },
    }),
    [abort, refresh, signal, streamsRepositoryClient]
  );
}
