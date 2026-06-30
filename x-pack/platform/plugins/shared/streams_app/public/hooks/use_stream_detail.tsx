/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import { EuiFlexGroup, EuiLoadingSpinner } from '@elastic/eui';
import { getSegments, Streams } from '@kbn/streams-schema';
import { STREAMS_UI_PRIVILEGES } from '@kbn/streams-plugin/public';
import { getAncestorsAndSelf } from '@kbn/streams-schema';
import { isHttpFetchError } from '@kbn/server-route-repository-client';
import { useStreamsAppFetch } from './use_streams_app_fetch';
import { useStreamsAppBreadcrumbs } from './use_streams_app_breadcrumbs';
import { useStreamsAppParams } from './use_streams_app_params';
import { useKibana } from './use_kibana';
import { StreamNotFoundPrompt } from '../components/stream_not_found_prompt';

export interface StreamDetailContextProviderProps {
  name: string;
  streamsRepositoryClient: StreamsRepositoryClient;
}

export interface StreamDetailContextValue {
  definition: Streams.all.GetResponse;
  loading: boolean;
  refresh: () => void;
}

const StreamDetailContext = React.createContext<StreamDetailContextValue | undefined>(undefined);

/**
 * Handles a strict (DeepStrict) Zod schema validation failure for a stream
 * API response in a production-resilient way.
 *
 * - In development, throws immediately so schema drift surfaces in tests / local dev.
 * - In production, runs a non-strict `safeParse` to build a descriptive message,
 *   then schedules a deferred throw so APM and the global error handler capture it
 *   while execution continues normally (page stays usable).
 *
 * The deferred-throw pattern is required because:
 *   • A direct `throw` aborts execution and leaves the page blank.
 *   • `console.error` is not captured by our APM instrumentation.
 *   • `setTimeout(() => { throw … }, 0)` lets execution continue normally while
 *     still triggering the global `error` listener that APM hooks into.
 */
const handleStrictSchemaFailure = (
  value: unknown,
  nonStrictSchema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  errorMessage: string
): void => {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(errorMessage);
  }

  const nonStrictResult = nonStrictSchema.safeParse(value);

  const reason = nonStrictResult.success
    ? 'The response passed non-strict validation but failed strict (DeepStrict) validation — the API response contains extra or unknown fields.'
    : String(nonStrictResult.error);

  setTimeout(() => {
    throw new Error(`${errorMessage} ${reason}`);
  }, 0);
};

export function StreamDetailContextProvider({
  name,
  streamsRepositoryClient,
  children,
}: React.PropsWithChildren<StreamDetailContextProviderProps>) {
  const {
    core: {
      application: {
        capabilities: {
          streams: { [STREAMS_UI_PRIVILEGES.manage]: canManage },
        },
      },
    },
  } = useKibana();
  const canManageInUi = typeof canManage === 'boolean' ? canManage : false;
  const {
    value: definition,
    loading,
    refresh,
    error,
  } = useStreamsAppFetch(
    async ({ signal }) => {
      return streamsRepositoryClient
        .fetch('GET /api/streams/{name} 2023-10-31', {
          signal,
          params: {
            path: {
              name,
            },
          },
        })
        .then((response): Streams.all.GetResponse => {
          if (Streams.ingest.all.GetResponse.is(response)) {
            // Replicated streams (via CCR) can still have Kibana-side metadata edited
            // (description, dashboards, rules) but not ingest-level settings.
            const isReplicated = response.replicated === true;
            return {
              ...response,
              privileges: {
                ...response.privileges,
                // restrict the manage privilege by the Elasticsearch-level data-stream specific privilege and the Kibana-level UI privilege
                // the UI should only enable manage features if the user has privileges on both levels for the current stream
                manage: response.privileges.manage && canManageInUi,
                lifecycle: response.privileges.lifecycle && !isReplicated,
                simulate: response.privileges.simulate && !isReplicated,
              },
            };
          }

          if (Streams.QueryStream.GetResponse.is(response)) {
            return response;
          }

          // Both strict (DeepStrict) type guards failed — delegate to shared handler.
          handleStrictSchemaFailure(
            response,
            Streams.all.GetResponse.right,
            `[Streams] Stream detail schema validation failed for stream "${name}".`
          );
          return response as Streams.all.GetResponse;
        });
    },
    [streamsRepositoryClient, name, canManageInUi],
    {
      shouldSuppressFetchErrorToast: (err: Error) =>
        isHttpFetchError(err) && err.body?.statusCode === 404,
    }
  );

  const {
    path: { key },
  } = useStreamsAppParams('/{key}', true);

  useStreamsAppBreadcrumbs(() => {
    if (!definition || !Streams.WiredStream.Definition.is(definition.stream)) {
      return [{ title: key, path: `/{key}`, params: { path: { key } } }];
    }
    // Build breadcrumbs for each segment in the hierarchy for wired streams
    const ids = getAncestorsAndSelf(key);

    // Helper to get the display name for a stream ID in the breadcrumb
    const getBreadcrumbTitle = (id: string): string => {
      const segments = getSegments(id);
      return segments[segments.length - 1];
    };

    return ids.map((id) => ({
      title: getBreadcrumbTitle(id),
      path: `/{key}`,
      params: { path: { key: id } },
    }));
  }, [key, definition]);

  const context = React.useMemo(
    // useMemo cannot be used conditionally after the definition narrowing, the assertion is to narrow correctly the context value
    () => ({ definition, loading, refresh } as StreamDetailContextValue),
    [definition, loading, refresh]
  );

  // Display loading spinner for first data-fetching only to have SWR-like behaviour
  if (!definition && loading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center">
        <EuiLoadingSpinner size="xxl" />
      </EuiFlexGroup>
    );
  }

  if (!definition && error && isHttpFetchError(error) && error.body?.statusCode === 404) {
    return <StreamNotFoundPrompt streamName={name} />;
  }

  if (!definition) {
    return null;
  }

  return <StreamDetailContext.Provider value={context}>{children}</StreamDetailContext.Provider>;
}

export function useStreamDetail() {
  const ctx = React.useContext(StreamDetailContext);
  if (!ctx) {
    throw new Error('useStreamDetail must be used within a StreamDetailContextProvider');
  }
  return ctx;
}

export function useStreamDetailAsIngestStream() {
  const ctx = useStreamDetail();
  if (
    !Streams.WiredStream.GetResponse.is(ctx.definition) &&
    !Streams.ClassicStream.GetResponse.is(ctx.definition)
  ) {
    // Both strict (DeepStrict) type guards failed — delegate to shared handler.
    handleStrictSchemaFailure(
      ctx.definition,
      Streams.ingest.all.GetResponse.right,
      `[Streams] useStreamDetailAsIngestStream: definition for stream "${ctx.definition.stream.name}" failed strict schema validation.`
    );
  }
  return ctx as {
    definition: Streams.ingest.all.GetResponse;
    loading: boolean;
    refresh: () => void;
  };
}
