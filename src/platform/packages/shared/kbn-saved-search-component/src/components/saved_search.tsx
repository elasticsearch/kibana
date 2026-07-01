/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { isEqual } from 'lodash';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import { SEARCH_EMBEDDABLE_TYPE, getDefaultSort } from '@kbn/discover-utils';
import {
  type SearchEmbeddableApi,
  type SearchEmbeddablePanelApiState,
} from '@kbn/discover-plugin/public';
import type { SearchEmbeddableState } from '@kbn/discover-plugin/common';
import { css } from '@emotion/react';
import { type SavedSearch, toSavedSearchAttributes } from '@kbn/saved-search-plugin/common';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { SavedSearchComponentProps, SavedSearchTableConfig } from '../types';
import { SavedSearchComponentErrorContent } from './error';

const TIMESTAMP_FIELD = '@timestamp';

export const SavedSearchComponent: React.FC<SavedSearchComponentProps> = (props) => {
  // Creates our *initial* search source and set of attributes.
  // Future changes to these properties will be facilitated by the Parent API from the embeddable.
  const [initialSerializedState, setInitialSerializedState] = useState<SearchEmbeddableState>();

  const [error, setError] = useState<Error | undefined>();

  const {
    dependencies: { dataViews, searchSource: searchSourceService },
    timeRange,
    query,
    filters,
    nonHighlightingFilters,
    index,
    timestampField,
    columns,
    sort,
    grid,
    rowHeight,
    rowsPerPage,
    density,
    height,
  } = props;

  const {
    solutionNavIdOverride,
    enableDocumentViewer: documentViewerEnabled = true,
    enableFilters: filtersEnabled = true,
  } = props.displayOptions ?? {};

  const latestColumnsRef = useRef(columns);
  latestColumnsRef.current = columns;

  useEffect(() => {
    // Ensure we get a stabilised set of initial state incase dependencies change, as
    // the data view creation process is async.
    const abortController = new AbortController();

    async function createInitialSerializedState() {
      try {
        // Ad-hoc data view
        const dataView = await dataViews.create({
          title: index,
          timeFieldName: timestampField ?? TIMESTAMP_FIELD,
        });
        if (!abortController.signal.aborted) {
          // Search source
          const searchSource = searchSourceService.createEmpty();
          searchSource.setField('index', dataView);
          searchSource.setField('query', query);
          searchSource.setField('filter', filters);
          searchSource.setField('nonHighlightingFilters', nonHighlightingFilters);
          const { searchSourceJSON, references } = searchSource.serialize();
          // By-value saved object structure
          const savedSearch: SavedSearch = {
            searchSource,
            kibanaSavedObjectMeta: {
              searchSourceJSON,
            },
            columns: latestColumnsRef.current,
            sort:
              sort ?? getDefaultSort(dataView, undefined, undefined, isOfAggregateQueryType(query)),
            grid,
            rowHeight,
            rowsPerPage,
            density,
            managed: false,
          };
          setInitialSerializedState({
            attributes: {
              ...toSavedSearchAttributes(savedSearch, searchSourceJSON),
              references,
            },
            time_range: timeRange,
            nonPersistedDisplayOptions: {
              solutionNavIdOverride,
              enableDocumentViewer: documentViewerEnabled,
              enableFilters: filtersEnabled,
            },
          });
        }
      } catch (e) {
        setError(e);
      }
    }

    createInitialSerializedState();

    return () => {
      abortController.abort();
    };
    // columns is synced after mount via syncColumns; omitting it here avoids remounting
    // the embeddable when columns change.
  }, [
    sort,
    grid,
    rowHeight,
    rowsPerPage,
    density,
    dataViews,
    documentViewerEnabled,
    filters,
    nonHighlightingFilters,
    filtersEnabled,
    index,
    query,
    searchSourceService,
    solutionNavIdOverride,
    timeRange,
    timestampField,
  ]);

  if (error) {
    return <SavedSearchComponentErrorContent error={error} />;
  }

  return initialSerializedState ? (
    <div
      css={css`
        height: ${height ?? '100%'};
        > [data-test-subj='embeddedSavedSearchDocTable'] {
          height: 100%;
        }
      `}
    >
      <SavedSearchComponentTable {...props} initialSerializedState={initialSerializedState} />
    </div>
  ) : null;
};

const SavedSearchComponentTable: React.FC<
  SavedSearchComponentProps & {
    initialSerializedState: SearchEmbeddableState;
  }
> = (props) => {
  const {
    dependencies: { dataViews },
    initialSerializedState,
    filters,
    nonHighlightingFilters,
    query,
    timeRange,
    timestampField,
    index,
    columns,
    onTableConfigChange,
    resolveColumnsOnChange,
  } = props;
  const embeddableApi = useRef<SearchEmbeddableApi | undefined>(undefined);
  const [isEmbeddableApiAvailable, setIsEmbeddableApiAvailable] = useState(false);

  const { executionContext } = props;
  const parentApi = useMemo(() => {
    return {
      ...(executionContext ? { executionContext } : {}),
      getSerializedStateForChild: () => {
        return initialSerializedState;
      },
    };
  }, [initialSerializedState, executionContext]);

  useEffect(
    function syncIndex() {
      if (!embeddableApi.current) return;

      const abortController = new AbortController();

      async function updateDataView() {
        // Ad-hoc data view
        const dataView = await dataViews.create({
          title: index,
          timeFieldName: timestampField ?? TIMESTAMP_FIELD,
        });
        if (!abortController.signal.aborted) {
          embeddableApi.current?.setDataViews([dataView]);
        }
      }

      updateDataView();

      return () => {
        abortController.abort();
      };
    },
    [dataViews, index, timestampField]
  );

  useEffect(
    function syncFilters() {
      if (!embeddableApi.current) return;
      embeddableApi.current.setFilters(filters);
    },
    [filters]
  );

  useEffect(
    function syncQuery() {
      if (!embeddableApi.current) return;
      embeddableApi.current.setQuery(query);
    },
    [query]
  );

  useEffect(
    function syncNonHighlightingFilters() {
      if (!embeddableApi.current) return;

      const applyNonHighlightingFilters = (savedSearch: SavedSearch) => {
        savedSearch.searchSource.setField('nonHighlightingFilters', nonHighlightingFilters);
      };

      applyNonHighlightingFilters(embeddableApi.current.savedSearch$.getValue());
      const subscription = embeddableApi.current.savedSearch$.subscribe(
        applyNonHighlightingFilters
      );

      return () => {
        subscription.unsubscribe();
      };
    },
    [nonHighlightingFilters, isEmbeddableApiAvailable]
  );

  useEffect(
    function syncTimeRange() {
      if (!embeddableApi.current) return;
      embeddableApi.current.setTimeRange(timeRange);
    },
    [timeRange]
  );

  useEffect(
    function syncColumns() {
      if (!embeddableApi.current) return;
      embeddableApi.current.setColumns(columns);
    },
    [columns, isEmbeddableApiAvailable]
  );

  useEffect(
    function reconcileColumnsOnEmbeddableChange() {
      if (!embeddableApi.current || !resolveColumnsOnChange) return;

      const subscription = embeddableApi.current.savedSearch$
        .pipe(
          map((savedSearch) => savedSearch.columns),
          distinctUntilChanged((prev, curr) => isEqual(prev, curr))
        )
        .subscribe((emittedColumns) => {
          const resolvedColumns = resolveColumnsOnChange(emittedColumns);

          if (resolvedColumns && !isEqual(resolvedColumns, emittedColumns)) {
            embeddableApi.current?.setColumns(resolvedColumns);
          }
        });

      return () => {
        subscription.unsubscribe();
      };
    },
    [resolveColumnsOnChange, isEmbeddableApiAvailable]
  );

  // Subscribe to table config changes and notify parent via callback
  useEffect(
    function notifyTableConfigChanges() {
      if (!embeddableApi.current || !onTableConfigChange) return;

      const subscription = embeddableApi.current.savedSearch$
        .pipe(
          // Debounce to avoid too many updates during rapid changes
          debounceTime(300),
          // Map to our table config structure
          map(
            (savedSearch): SavedSearchTableConfig => ({
              columns: savedSearch.columns,
              sort: savedSearch.sort,
              grid: savedSearch.grid,
              rowHeight: savedSearch.rowHeight,
              rowsPerPage: savedSearch.rowsPerPage,
              density: savedSearch.density,
            })
          ),
          // Only emit when config actually changes
          distinctUntilChanged((prev, curr) => isEqual(prev, curr))
        )
        .subscribe((config) => {
          onTableConfigChange(config);
        });

      return () => {
        subscription.unsubscribe();
      };
    },
    [onTableConfigChange, isEmbeddableApiAvailable]
  );

  return (
    <EmbeddableRenderer<SearchEmbeddablePanelApiState, SearchEmbeddableApi>
      maybeId={undefined}
      type={SEARCH_EMBEDDABLE_TYPE}
      getParentApi={() => parentApi}
      onApiAvailable={(api) => {
        embeddableApi.current = api;
        setIsEmbeddableApiAvailable(true);
      }}
      hidePanelChrome
    />
  );
};
