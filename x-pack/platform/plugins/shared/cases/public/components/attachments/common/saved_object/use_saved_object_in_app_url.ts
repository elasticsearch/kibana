/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { useKibana } from '../../../../common/lib/kibana';
import { useSavedObjectInAppUrlsContext } from './saved_object_in_app_urls_context';
import type { SupportedSavedObjectType } from './helpers';

interface BulkGetMetaResponseItem {
  id: string;
  type: string;
  meta?: { inAppUrl?: { path?: string; uiCapabilitiesPath?: string } };
}

const BULK_GET_URL = '/api/kibana/management/saved_objects/_bulk_get';
const EMPTY_MAP: Record<string, string | undefined> = Object.freeze({});

const stableIdsKey = (ids: string[]) => ids.slice().sort().join(',');

/**
 * Low-level fetcher: one `bulk_get` per `(soType, set-of-ids)`. Returns a
 * map keyed by id. Used directly by `SavedObjectInAppUrlsProvider` to
 * pre-resolve URLs for the entire case in one shot, and as the fallback for
 * the public `useSavedObjectInAppUrls`/`useSavedObjectInAppUrl` hooks when
 * no provider is mounted above them.
 */
export const useSavedObjectInAppUrlsQuery = (
  soType: string,
  ids: string[]
): Record<string, string | undefined> => {
  const {
    services: { http },
  } = useKibana();

  // Stable key avoids refetching when the same id set arrives in a different
  // order on subsequent renders.
  const idsKey = useMemo(() => stableIdsKey(ids), [ids]);

  const { data } = useQuery<Record<string, string | undefined>>(
    ['cases', 'saved-object-in-app-url', soType, idsKey],
    async () => {
      if (ids.length === 0) {
        return EMPTY_MAP;
      }
      try {
        const resp = await http.post<BulkGetMetaResponseItem[]>(BULK_GET_URL, {
          body: JSON.stringify(ids.map((id) => ({ type: soType, id }))),
        });
        const next: Record<string, string | undefined> = {};
        for (const item of resp ?? []) {
          next[item.id] = item.meta?.inAppUrl?.path
            ? http.basePath.prepend(item.meta.inAppUrl.path)
            : undefined;
        }
        return next;
      } catch {
        // Leave entries unresolved; rows render as plain text.
        return EMPTY_MAP;
      }
    },
    {
      // Resolved URLs don't change while the case page is open; avoid noisy
      // refetches on window focus / reconnect.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      keepPreviousData: true,
    }
  );

  return data ?? EMPTY_MAP;
};

/**
 * Resolves in-app URLs for a batch of saved objects of the same type. When a
 * `SavedObjectInAppUrlsProvider` is mounted above (the normal case inside
 * `CaseViewPage`), reads from the case-wide pre-resolved map and avoids any
 * request. Otherwise falls back to its own `bulk_get`.
 */
export const useSavedObjectInAppUrls = (
  soType: string,
  ids: string[]
): Record<string, string | undefined> => {
  const ctx = useSavedObjectInAppUrlsContext();
  const ctxMap = ctx?.[soType as SupportedSavedObjectType];
  // Rules of hooks: always invoke the query, but pass `[]` (no network) when
  // the context already has resolved URLs for this soType.
  const fallbackMap = useSavedObjectInAppUrlsQuery(soType, ctxMap ? [] : ids);
  return ctxMap ?? fallbackMap;
};

/** Convenience wrapper for the single-id case. */
export const useSavedObjectInAppUrl = (
  soType: string,
  id: string | undefined
): string | undefined => {
  const ids = useMemo(() => (id ? [id] : []), [id]);
  const map = useSavedObjectInAppUrls(soType, ids);
  return id ? map[id] : undefined;
};
