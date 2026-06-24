/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { useKibana, useToasts } from '../../../../common/lib/kibana';
import type { SupportedSavedObjectType } from './helpers';
import type { FoundSavedObject, SavedObjectFindResponse } from './types';
import * as i18n from './translations';

const FIND_URL = '/api/kibana/management/saved_objects/_find';

export interface UseFindSavedObjectsArgs {
  /** Restrict the result set to these SO types (e.g. all supported types or a single filter). */
  types: SupportedSavedObjectType[];
  /** Raw query string from the search input; an empty string disables the search clause. */
  query: string;
  /** Zero-based page index, matching `EuiTablePagination`. */
  page: number;
  perPage: number;
}

export interface UseFindSavedObjectsResult {
  items: FoundSavedObject[];
  total: number;
  pageCount: number;
  isLoading: boolean;
}

const EMPTY_RESPONSE: SavedObjectFindResponse = {
  saved_objects: [],
  total: 0,
  page: 1,
  per_page: 0,
};

/**
 * Fetches saved objects from the management `_find` endpoint, sorted by
 * last-updated, with a wildcard-suffix search.
 */
export const useFindSavedObjects = ({
  types,
  query,
  page,
  perPage,
}: UseFindSavedObjectsArgs): UseFindSavedObjectsResult => {
  const {
    services: { http },
  } = useKibana();
  const toasts = useToasts();

  // `types` is rebuilt on every render in the caller; join for a stable cache key.
  const typesKey = useMemo(() => types.join(','), [types]);

  const { data, isLoading } = useQuery<SavedObjectFindResponse, Error>(
    ['cases', 'attach-saved-object', { typesKey, query, page, perPage }],
    () =>
      http.get<SavedObjectFindResponse>(FIND_URL, {
        query: {
          type: types,
          // Suffix wildcard only — mirrors Saved Objects Management
          // (`findObjects` in saved_objects_management/public).
          search: query ? `${query}*` : undefined,
          page: page + 1,
          perPage,
          sortField: 'updated_at',
          sortOrder: 'desc',
        },
      }),
    {
      // `keepPreviousData` + returning `isLoading` (not `isFetching`) means
      // background refetches on query/page changes show the previous results
      // until the new ones arrive — no spinner flash per keystroke.
      keepPreviousData: true,
      onError: (error) => {
        toasts.addError(error, { title: i18n.FETCH_ERROR_TITLE });
      },
    }
  );

  const response = data ?? EMPTY_RESPONSE;
  return {
    items: response.saved_objects,
    total: response.total,
    pageCount: Math.max(1, Math.ceil(response.total / perPage)),
    isLoading,
  };
};
