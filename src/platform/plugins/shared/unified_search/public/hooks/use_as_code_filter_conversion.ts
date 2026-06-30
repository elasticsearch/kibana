/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apm } from '@elastic/apm-rum';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import fastIsEqual from 'fast-deep-equal';
import type { AsCodeFilter } from '@kbn/as-code-filters-schema';
import { fromStoredFilter, toStoredFilters } from '@kbn/as-code-filters-transforms';
import type { Logger } from '@kbn/logging';
import type { Filter } from '@kbn/es-query';
import { isFilterPinned } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import type { ToastsStart } from '@kbn/core/public';

interface UseAsCodeFilterConversionParams {
  asCodeFilterMode?: boolean;
  filters?: Filter[] | AsCodeFilter[];
  onFiltersUpdated?: (filters: Filter[]) => void;
  logger?: Logger;
  toasts?: ToastsStart;
}

interface UseAsCodeFilterConversionResult {
  filters?: Filter[];
  onFiltersUpdated?: (filters: Filter[]) => void;
}

const TOAST_DEBOUNCE_MS = 1000;
const TOAST_TITLE = i18n.translate('unifiedSearch.searchBar.asCodeFilterConversionErrorTitle', {
  defaultMessage: 'Some filters could not be converted',
});
const TOAST_MESSAGE = i18n.translate('unifiedSearch.searchBar.asCodeFilterConversionErrorMessage', {
  defaultMessage: 'Some filters are unsupported in this mode and were skipped.',
});

/**
 * Converts SearchBar filters at the wrapper boundary when `asCodeFilterMode` is enabled.
 *
 * Inbound:
 * - converts `AsCodeFilter[]` to internal `Filter[]`
 * - preserves pinned filters from the previous internal state so wrapper-only consumers do not lose them
 * - also supports prop updates that arrive as `Filter[]` (for example saved-query/filterManager paths in StatefulSearchBar)
 *
 * Outbound:
 * - accepts internal `Filter[]` from SearchBarUI
 * - splits pinned vs app filters
 * - converts only app filters to `AsCodeFilter[]`
 * - re-tracks pinned filters locally for future inbound merges
 *
 * Conversion failures are logged, surfaced to the user via a debounced toast, and reported to APM.
 */
export const useAsCodeFilterConversion = ({
  asCodeFilterMode,
  filters,
  onFiltersUpdated,
  logger,
  toasts,
}: UseAsCodeFilterConversionParams): UseAsCodeFilterConversionResult => {
  const pinnedFiltersRef = useRef<Filter[]>([]);
  const lastToastRef = useRef(0);
  const lastConvertedFiltersRef = useRef<Filter[] | undefined>(undefined);

  const notifyConversionFailure = useCallback(() => {
    const now = Date.now();
    if (!toasts || now - lastToastRef.current < TOAST_DEBOUNCE_MS) {
      return;
    }

    lastToastRef.current = now;
    toasts.addDanger({
      title: TOAST_TITLE,
      text: TOAST_MESSAGE,
    });
  }, [toasts]);

  const captureFailure = useCallback(
    (error: Error, direction: 'inbound' | 'outbound') => {
      logger?.warn(
        `Failed ${direction} as-code filter conversion in unified search search bar: ${error.message}`
      );
      apm.captureError(error, {
        labels: {
          component: 'unifiedSearchAsCodeFilters',
          direction,
        },
      });
    },
    [logger]
  );

  const convertedFilters = useMemo(() => {
    if (!asCodeFilterMode) {
      return filters as Filter[] | undefined;
    }

    const incomingFilters = filters ?? [];
    const pinnedFilters = (incomingFilters as Filter[]).filter(isFilterPinned);

    if (pinnedFilters.length > 0) {
      pinnedFiltersRef.current = pinnedFilters;
      return incomingFilters as Filter[];
    }

    try {
      const storedFilters = toStoredFilters(incomingFilters as AsCodeFilter[], logger) ?? [];
      const mergedFilters = [...pinnedFiltersRef.current, ...storedFilters];

      if (fastIsEqual(lastConvertedFiltersRef.current, mergedFilters)) {
        return lastConvertedFiltersRef.current;
      }

      lastConvertedFiltersRef.current = mergedFilters;
      return mergedFilters;
    } catch (error) {
      const conversionError =
        error instanceof Error
          ? error
          : new Error('Failed inbound as-code filter conversion in unified search search bar');
      notifyConversionFailure();
      captureFailure(conversionError, 'inbound');
      return pinnedFiltersRef.current;
    }
  }, [asCodeFilterMode, captureFailure, filters, logger, notifyConversionFailure]);

  useEffect(() => {
    if (!asCodeFilterMode) {
      pinnedFiltersRef.current = ((filters as Filter[] | undefined) ?? []).filter(isFilterPinned);
      return;
    }

    const nextFilters = (convertedFilters ?? []).filter(isFilterPinned);
    pinnedFiltersRef.current = nextFilters;
  }, [asCodeFilterMode, convertedFilters, filters]);

  const wrappedOnFiltersUpdated = useCallback(
    (nextFilters: Filter[]) => {
      if (!onFiltersUpdated) {
        return;
      }

      if (!asCodeFilterMode) {
        onFiltersUpdated(nextFilters);
        return;
      }

      const pinnedFilters = nextFilters.filter(isFilterPinned);
      pinnedFiltersRef.current = pinnedFilters;

      const appFilters = nextFilters.filter((filter) => !isFilterPinned(filter));
      const asCodeFilters: AsCodeFilter[] = [];

      appFilters.forEach((filter, index) => {
        try {
          const convertedFilter = fromStoredFilter(filter, logger);
          if (!convertedFilter) {
            throw new Error(
              `Unsupported filter conversion at index ${index} with type ${
                filter.meta?.type ?? 'unknown'
              }`
            );
          }
          asCodeFilters.push(convertedFilter);
        } catch (error) {
          const conversionError =
            error instanceof Error
              ? error
              : new Error(
                  `Unsupported filter conversion at index ${index} with type ${
                    filter.meta?.type ?? 'unknown'
                  }`
                );
          notifyConversionFailure();
          captureFailure(conversionError, 'outbound');
        }
      });

      onFiltersUpdated(asCodeFilters as unknown as Filter[]);
    },
    [asCodeFilterMode, captureFailure, logger, notifyConversionFailure, onFiltersUpdated]
  );

  return {
    filters: convertedFilters,
    onFiltersUpdated: asCodeFilterMode ? wrappedOnFiltersUpdated : onFiltersUpdated,
  };
};
