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
import {
  DataGridDensity,
  type DataTableColumnsMeta,
  type SortOrder,
  type JsonModeSettings,
  type DocumentsDisplayMode,
} from '@kbn/unified-data-table';
import type { SearchResponseIncompleteWarning } from '@kbn/search-response-warnings/src/types';
import { ESQLVariableType } from '@kbn/esql-types';
import type { FetchContext } from '@kbn/presentation-publishing';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import { createDiscoverServicesMock } from '../../__mocks__/services';
import { DiscoverTestProvider } from '../../__mocks__/test_provider';
import { createContextAwarenessMocks } from '../../context_awareness/__mocks__';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../context_awareness';
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
  documentsDisplayMode: new BehaviorSubject<DocumentsDisplayMode | undefined>(undefined),
  jsonModeSettings: new BehaviorSubject<JsonModeSettings | undefined>(undefined),
  rows: new BehaviorSubject<DataTableRecord[]>([]),
  totalHitCount: new BehaviorSubject<number | undefined>(undefined),
  inspectorAdapters: new BehaviorSubject<Record<string, unknown>>({}),
});

const createSavedSearch = ({
  isEsql,
  columns = ['message'],
  query,
}: {
  isEsql: boolean;
  columns?: string[];
  query?: string;
}): SavedSearch => {
  const searchSource = createSearchSourceMock({ index: dataViewMock });
  if (isEsql) {
    searchSource.setField('query', {
      esql: query ?? 'FROM test | LIMIT 100',
    } as AggregateQuery);
  } else {
    searchSource.setField('query', { query: '*', language: 'kuery' } as Query);
  }
  return {
    id: 'test-saved-search',
    title: 'Test Saved Search',
    searchSource,
    columns,
    sort: [],
    managed: false,
  };
};

const createApi = (savedSearch: SavedSearch, parentApi?: SearchEmbeddableApi['parentApi']) => {
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
    parentApi,
  } as unknown as SearchEmbeddableApi & {
    fetchWarnings$: BehaviorSubject<SearchResponseIncompleteWarning[]>;
    fetchContext$: BehaviorSubject<FetchContext | undefined>;
    query$: BehaviorSubject<AggregateQuery | Query | undefined>;
    savedSearch$: BehaviorSubject<SavedSearch>;
  };
};

describe('SearchEmbeddableGridComponent', () => {
  const services = createDiscoverServicesMock();
  const rows = esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = async ({
    isEsql,
    columns,
    query,
    columnsMeta,
    autoApplyDiscoverColumnDefaults,
    profileColumns,
    parentApi,
    showKeyboardShortcuts,
    showSortSelector,
  }: {
    isEsql: boolean;
    columns?: string[];
    query?: string;
    columnsMeta?: DataTableColumnsMeta;
    autoApplyDiscoverColumnDefaults?: boolean;
    profileColumns?: Array<{ name: string; width?: number }>;
    parentApi?: SearchEmbeddableApi['parentApi'];
    showKeyboardShortcuts?: boolean;
    showSortSelector?: boolean;
  }) => {
    const savedSearch = createSavedSearch({ isEsql, columns, query });
    const api = createApi(savedSearch, parentApi);
    const stateManager = createStateManager();
    stateManager.columns.next(savedSearch.columns);
    const docViewerRef = React.createRef<DocViewerApi>();
    stateManager.rows.next(rows);
    stateManager.totalHitCount.next(rows.length);
    if (columnsMeta) {
      stateManager.columnsMeta.next(columnsMeta);
    }

    const { dataSourceProfileProviderMock, profilesManagerMock, scopedEbtManagerMock } =
      createContextAwarenessMocks();
    if (profileColumns) {
      dataSourceProfileProviderMock.profile.getDefaultAppState = jest.fn(() => () => ({
        columns: profileColumns,
      }));
    }
    const scopedProfilesManager = profilesManagerMock.createScopedProfilesManager({
      scopedEbtManager: scopedEbtManagerMock,
      toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    });
    await scopedProfilesManager.resolveDataSourceProfile({
      dataView: dataViewMock,
      query: savedSearch.searchSource.getField('query'),
    });

    render(
      <DiscoverTestProvider services={services} scopedProfilesManager={scopedProfilesManager}>
        <SearchEmbeddableGridComponent
          api={api}
          dataView={dataViewMock}
          stateManager={stateManager}
          enableDocumentViewer={true}
          autoApplyDiscoverColumnDefaults={autoApplyDiscoverColumnDefaults}
          showKeyboardShortcuts={showKeyboardShortcuts}
          showSortSelector={showSortSelector}
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

    return { api, stateManager };
  };

  describe('onUpdateSampleSize', () => {
    it('should pass onUpdateSampleSize as undefined when in ES|QL mode', async () => {
      await renderComponent({ isEsql: true });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      expect(lastCallProps?.onUpdateSampleSize).toBeUndefined();
    });

    it('should pass onUpdateSampleSize as a function when not in ES|QL mode', async () => {
      await renderComponent({ isEsql: false });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      expect(lastCallProps?.onUpdateSampleSize).toBeDefined();
      expect(typeof lastCallProps?.onUpdateSampleSize).toBe('function');
    });
  });

  describe('onUpdateDataGridDensity', () => {
    it('updates density from the Display control', async () => {
      const { stateManager } = await renderComponent({ isEsql: false });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      const onUpdateDataGridDensity = lastCallProps?.onUpdateDataGridDensity as (
        density: DataGridDensity | undefined
      ) => void;

      expect(stateManager.density.getValue()).toBeUndefined();
      onUpdateDataGridDensity(DataGridDensity.COMPACT);
      expect(stateManager.density.getValue()).toBe(DataGridDensity.COMPACT);
    });
  });

  describe('onResize', () => {
    it('should update the embeddable grid state', async () => {
      const { stateManager } = await renderComponent({ isEsql: false });

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

  describe('autoApplyDiscoverColumnDefaults', () => {
    const categorizeQuery =
      'FROM kibana_sample_data_logs | STATS Count = COUNT(*), Sparkline = SPARKLINE(COUNT(*), @timestamp) BY Pattern = CATEGORIZE(message)';
    const categorizeColumnsMeta: DataTableColumnsMeta = {
      Count: { type: 'number' },
      Sparkline: { type: 'number' },
      Pattern: { type: 'string' },
    };

    it('applies profile columns when opted in and stored columns are empty', async () => {
      const { stateManager } = await renderComponent({
        isEsql: true,
        columns: [],
        query: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
        autoApplyDiscoverColumnDefaults: true,
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
      });

      await waitFor(() => {
        const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
        expect(lastCallProps?.columns).toEqual(['Count', 'Sparkline', 'Pattern']);
        expect(lastCallProps?.settings).toEqual({
          columns: {
            Count: { width: 150 },
            Sparkline: { width: 150 },
          },
        });
      });
      expect(stateManager.columns.getValue()).toEqual([]);
    });

    it('persists a user resize without writing other profile widths', async () => {
      const { stateManager } = await renderComponent({
        isEsql: true,
        columns: [],
        query: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
        autoApplyDiscoverColumnDefaults: true,
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
      });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.onResize).toBeDefined();
      });

      const onResize = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]
        ?.onResize as (params: { columnId: string; width: number | undefined }) => void;

      onResize({ columnId: 'Count', width: 220 });
      expect(stateManager.grid.getValue()).toEqual({ columns: { Count: { width: 220 } } });
      expect(stateManager.columns.getValue()).toEqual([]);

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.settings).toEqual({
          columns: {
            Count: { width: 220 },
            Sparkline: { width: 150 },
          },
        });
      });
    });

    it('does not persist profile widths when the user adds a column', async () => {
      const { api, stateManager } = await renderComponent({
        isEsql: true,
        columns: [],
        query: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
        autoApplyDiscoverColumnDefaults: true,
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
      });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.onAddColumn).toBeDefined();
      });

      const onAddColumn = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.onAddColumn as (
        columnName: string
      ) => void;
      onAddColumn('message');

      expect(stateManager.columns.getValue()).toEqual(['Count', 'Sparkline', 'Pattern', 'message']);
      expect(stateManager.grid.getValue()).toBeUndefined();

      api.savedSearch$.next({
        ...api.savedSearch$.getValue(),
        columns: stateManager.columns.getValue(),
      });

      await waitFor(() => {
        const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
        expect(lastCallProps?.columns).toEqual(['Count', 'Sparkline', 'Pattern', 'message']);
        expect(lastCallProps?.settings).toEqual({
          columns: {
            Count: { width: 150 },
            Sparkline: { width: 150 },
          },
        });
      });
    });

    it('recomputes display columns from query and result metadata, then keeps explicit columns', async () => {
      const { api, stateManager } = await renderComponent({
        isEsql: true,
        columns: [],
        query: categorizeQuery,
        columnsMeta: categorizeColumnsMeta,
        autoApplyDiscoverColumnDefaults: true,
        profileColumns: [
          { name: 'Count', width: 150 },
          { name: 'Sparkline', width: 150 },
          { name: 'Pattern' },
        ],
      });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.columns).toEqual([
          'Count',
          'Sparkline',
          'Pattern',
        ]);
      });

      const statsQuery = { esql: 'FROM logs | STATS count = COUNT(*) BY status' } as AggregateQuery;
      const statsSavedSearch = createSavedSearch({
        isEsql: true,
        columns: [],
        query: statsQuery.esql,
      });
      const statsColumnsMeta: DataTableColumnsMeta = {
        count: { type: 'number' },
        status: { type: 'string' },
      };

      api.query$.next(statsQuery);
      api.savedSearch$.next(statsSavedSearch);
      stateManager.columnsMeta.next(statsColumnsMeta);

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.columns).toEqual([
          'count',
          'status',
        ]);
      });

      api.savedSearch$.next({ ...statsSavedSearch, columns: ['status'] });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.columns).toEqual(['status']);
      });
    });

    it('still applies variable-driven column replacement', async () => {
      await renderComponent({
        isEsql: true,
        columns: ['oldField'],
        query: 'FROM logs | KEEP oldField',
        columnsMeta: {
          timestamp: { type: 'date' },
          variableColumn: { type: 'string' },
        },
        autoApplyDiscoverColumnDefaults: true,
        parentApi: {
          esqlVariables$: new BehaviorSubject([
            { key: 'field', value: 'variableColumn', type: ESQLVariableType.FIELDS },
          ]),
        } as SearchEmbeddableApi['parentApi'],
      });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0]?.columns).toEqual([
          'variableColumn',
        ]);
      });
    });
  });

  describe('toolbar chrome overrides', () => {
    it('forwards keyboard shortcut and sort selector flags', async () => {
      await renderComponent({
        isEsql: false,
        showKeyboardShortcuts: false,
        showSortSelector: false,
      });

      await waitFor(() => {
        expect(mockDiscoverGridEmbeddableProps).toHaveBeenCalled();
      });

      const lastCallProps = mockDiscoverGridEmbeddableProps.mock.calls.at(-1)?.[0];
      expect(lastCallProps?.showKeyboardShortcuts).toBe(false);
      expect(lastCallProps?.showSortSelector).toBe(false);
    });
  });
});
