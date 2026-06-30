/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useAbortController } from '@kbn/react-hooks';
import type { KIsOnboardingStep } from '@kbn/significant-events-schema';
import { useMemo } from 'react';
import { useKibana } from './use_kibana';
import { getLast24HoursTimeRange } from '../util/time_range';

export interface ScheduleOnboardingOptions {
  steps?: KIsOnboardingStep[];
  connectors?: {
    features?: string;
    queries?: string;
  };
}

export function useOnboardingApi() {
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
      scheduleOnboarding: async (streamName: string, options?: ScheduleOnboardingOptions) => {
        const { from, to } = getLast24HoursTimeRange();

        return streamsRepositoryClient.fetch(
          'POST /internal/streams/{streamName}/onboarding/_execute',
          {
            signal,
            params: {
              path: { streamName },
              body: {
                action: 'schedule' as const,
                from,
                to,
                ...(options?.steps !== undefined && { steps: options.steps }),
                ...(options?.connectors !== undefined && { connectors: options.connectors }),
              },
            },
          }
        );
      },
      getOnboardingStatus: async (streamName: string) => {
        return streamsRepositoryClient.fetch(
          'GET /internal/streams/{streamName}/onboarding/_status',
          {
            signal,
            params: {
              path: { streamName },
            },
          }
        );
      },
      getOnboardingStatuses: async (streamNames: string[]) => {
        return streamsRepositoryClient.fetch('POST /internal/streams/onboarding/_bulk_status', {
          signal,
          params: {
            body: { streamNames },
          },
        });
      },
      cancelOnboarding: async (streamName: string) => {
        await streamsRepositoryClient.fetch(
          'POST /internal/streams/{streamName}/onboarding/_execute',
          {
            signal,
            params: {
              path: { streamName },
              body: {
                action: 'cancel' as const,
              },
            },
          }
        );
      },
    }),
    [signal, streamsRepositoryClient]
  );
}
