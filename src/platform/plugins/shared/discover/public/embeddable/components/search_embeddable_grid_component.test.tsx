/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { render, waitFor } from '@testing-library/react';
import { dataViewMock, esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import type { AggregateQuery, Query } from '@kbn/es-query';
import type { SavedSearch, DiscoverGridSettings, VIEW_MODE } from '@kbn/saved-search-plugin/common';
import type { DataTableColumnsMeta, SortOrder, DataGridDensity } from '@kbn/unified-data-table';
import type { SearchResponseIncompleteWarning } from '@kbn/search-response-warnings/src/types';
import type { FetchContext } from '@kbn/presentation-publishing';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import { createDiscoverServicesMock } from '../../__mocks__/services';
import { DiscoverTestProvider } from '../../__mocks__/test_provider';
import type { SearchEmbeddableApi, SearchEmbeddableStateManager } from '../types';
import { SearchEmbeddableGridComponent } from './search_embeddable_grid_component';

const mockDiscoverGridEmbeddableProps = jest.fn();

jest.mock('./saved_search_grid', () => ({
  DiscoverGridEmbeddable: (props: Record<string, unknown>) => {
    mockDiscoverGridEmbeddableProps(props);
    return <div data-test-subj="mockedDiscoverGridEmbeddable" />;
  },
}));

const createStateManager = (): SearchEmbeddableStateManager => ({
  columns: new BehaviorSubject<string[] | undefined>(['message']),
  columnsMeta: new BehaviorSubject<DataTableColumnsMeta | undefined>(undefined),
  grid: new BehaviorSubject<DiscoverGridSettings | undefined>(undefined),
  rowHeight: new BehaviorSubject<number | undefined>(undefined),
  headerRowHeight: new BehaviorSubject<number | undefined>(undefined),
  rowsPerPage: new BehaviorSubject<number | undefined>(undefined),
  sampleSize: new BehaviorSubject<number | undefined>(100),
  sort: new BehaviorSubject<SortOrder[] | undefined>(undefined),
  viewMode: new BehaviorSubject<VIEW_MODE | undefined>(undefined),
  density: new BehaviorSubject<DataGridDensity | undefined>(undefined),
  rows: new BehaviorSubject<DataTableRecord[]>([]),
  totalHitCount: new BehaviorSubject<number | undefined>(undefined),
  inspectorAdapters: new BehaviorSubject<Record<string, unknown>>({}),
});

const createSavedSearch = (isEsql: boolean): SavedSearch => {
  const searchSource = createSearchSourceMock({ index: dataViewMock });
  if (isEsql) {
    searchSource.setField('query', { esql: 'FROM test | LIMIT 100' } as AggregateQuery);
  } else {
    searchSource.setField('query', { query: '*', language: 'kuery' } as Query);
  }
  return {
    id: 'test-saved-search',
    title: 'Test Saved Search',
    searchSource,
    columns: ['message'],
    sort: [],
    managed: false,
  };
};

const createApi = (savedSearch: SavedSearch) => {
  return {
    dataLoading$: new BehaviorSubject<boolean | undefined>(false),
    savedSearch$: new BehaviorSubject(savedSearch),
    savedObjectId$: new BehaviorSubject<string | undefined>(undefined),
    fetchWarnings$: new BehaviorSubject<SearchResponseIncompleteWarning[]>([]),
    query$: new BehaviorSubject(savedSearch.searchSource.getField('query')),
    filters$: new BehaviorSubject([]),
    fetchContext$: new BehaviorSubject<FetchContext | undefined>(undefined),
    title$: new BehaviorSubject<string | undefined>('Test'),
    description$: new BehaviorSubject<string | undefined>(undefined),
    defaultTitle$: new BehaviorSubject<string | undefined>('Test'),
    defaultDescription$: new BehaviorSubject<string | undefined>(undefined),
  } as unknown as SearchEmbeddableApi & {
    fetchWarnings$: BehaviorSubject<SearchResponseIncompleteWarning[]>;
    fetchContext$: BehaviorSubject<FetchContext | undefined>;
  };
};

describe('SearchEmbeddableGridComponent', () => {
  const services = createDiscoverServicesMock();
  const rows = esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = ({ isEsql }: { isEsql: boolean }) => {
    const savedSearch = createSavedSearch(isEsql);
    const api = createApi(savedSearch);
    const stateManager = createStateManager();
    const docViewerRef = React.createRef<DocViewerApi>();
    stateManager.rows.next(rows);
    stateManager.totalHitCount.next(rows.length);

    render(
      <DiscoverTestProvider services={services}>
        <SearchEmbeddableGridComponent
          api={api}
          dataView={dataViewMock}
          stateManager={stateManager}
          enableDocumentViewer={true}
          inlineEditing={{
            isActive: false,
            hasPendingChanges: false,
            onApply: jest.fn(),
            onCancel: jest.fn(),
          }}
          docViewerRef={docViewerRef}
          expandedDoc={undefined}
          initialDocViewerTabId={undefined}
        />
      </DiscoverTestProvider>
    );

    return { stateManager };
  };

  describe('onUpdateSampleSize', () => {
    it('should pass onUpdateSampleSize as undefined when in ES|QL mode', async () => {
      renderComponent({ isEsql: true });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      expect(lastCallProps?.onUpdateSampleSize).toBeUndefined();
    });

    it('should pass onUpdateSampleSize as a function when not in ES|QL mode', async () => {
      renderComponent({ isEsql: false });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      expect(lastCallProps?.onUpdateSampleSize).toBeDefined();
      expect(typeof lastCallProps?.onUpdateSampleSize).toBe('function');
    });
  });

  describe('onResize', () => {
    it('should update the embeddable grid state', async () => {
      const { stateManager } = renderComponent({ isEsql: false });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      const onResize = lastCallProps?.onResize as (params: {
        columnId: string;
        width: number | undefined;
      }) => void;

      onResize({ columnId: '_source', width: 250 });
      expect(stateManager.grid.getValue()).toEqual({ columns: { _source: { width: 250 } } });

      onResize({ columnId: '_source', width: undefined });
      expect(stateManager.grid.getValue()).toEqual({ columns: { _source: {} } });
    });
  });
});
