/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

import { UnifiedResultsTable } from './unified_results_table';
import { useActionResults } from '../action_results/use_action_results';
import { useAllResults } from './use_all_results';
import { useOsqueryDataView } from './use_osquery_data_view';
import { useResultsFiltering } from './use_results_filtering';

const mockSearchBar = jest.fn((_props: unknown) => null);

jest.mock('../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      appName: 'osquery',
      application: {
        getUrlForApp: jest.fn().mockReturnValue('/fleet/agents/agent-1'),
        capabilities: { osquery: { read: true, write: true, runSavedQueries: true } },
      },
      theme: { theme$: { subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })) } },
      uiSettings: { get: jest.fn().mockReturnValue(false) },
      notifications: {
        toasts: { addWarning: jest.fn(), addSuccess: jest.fn(), addError: jest.fn() },
      },
      data: {
        fieldFormats: {},
        dataViews: { create: jest.fn().mockResolvedValue({}) },
      },
      analytics: {},
      i18n: {},
      uiActions: { getTriggerCompatibleActions: jest.fn().mockResolvedValue([]) },
      unifiedSearch: {
        ui: {
          SearchBar: (props: unknown) => mockSearchBar(props),
        },
      },
      chrome: {},
    },
  }),
}));

jest.mock('../common/use_persisted_page_size', () => ({
  usePersistedPageSize: () => [20, jest.fn()],
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
  RESULTS_PAGE_SIZE_STORAGE_KEY: 'osquery:resultsPageSize',
}));

jest.mock('../action_results/use_action_results');

jest.mock('./use_all_results');

jest.mock('./use_osquery_data_view');

jest.mock('./use_results_filtering');

jest.mock('@kbn/fleet-plugin/public', () => ({
  pagePathGetters: {
    agent_details: ({ agentId }: { agentId: string }) => ['', `/fleet/agents/${agentId}`],
  },
}));

jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn(),
}));

jest.mock('@kbn/cell-actions', () => ({
  CellActionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSetFilters = jest.fn();
const mockClearFilters = jest.fn();

jest.mock('./export_filters_context', () => ({
  useExportFiltersContext: () => ({
    getFilters: jest.fn(),
    setFilters: mockSetFilters,
    clearFilters: mockClearFilters,
    subscribe: jest.fn(() => () => undefined),
  }),
}));

let capturedOnInitialStateChange: ((state: Partial<{ isCompareActive: boolean }>) => void) | null =
  null;

jest.mock('./results_flyout', () => ({
  OsqueryResultsFlyout: () => null,
}));

jest.mock('./cell_renderers', () => ({
  getOsqueryCellRenderers: jest.fn().mockReturnValue({}),
}));

jest.mock('./transform_results', () => ({
  transformEdgesToRecords: jest.fn().mockReturnValue([]),
}));

const useActionResultsMock = useActionResults as jest.MockedFunction<typeof useActionResults>;
const useAllResultsMock = useAllResults as jest.MockedFunction<typeof useAllResults>;
const useOsqueryDataViewMock = useOsqueryDataView as jest.MockedFunction<typeof useOsqueryDataView>;
const useResultsFilteringMock = useResultsFiltering as jest.MockedFunction<
  typeof useResultsFiltering
>;

const mockDataView = {
  id: 'mock-data-view',
  title: 'logs-osquery_manager.results-*',
  getFieldByName: jest.fn().mockReturnValue(null),
  addRuntimeField: jest.fn(),
  toSpec: jest.fn().mockReturnValue({ fields: {} }),
  fields: { getByName: jest.fn() },
} as unknown as ReturnType<typeof useOsqueryDataView>['dataView'];

const setupMocks = ({
  rows = [],
  total = 0,
}: {
  rows?: unknown[];
  total?: number;
} = {}) => {
  capturedOnInitialStateChange = null;

  useActionResultsMock.mockReturnValue({
    data: {
      aggregations: { totalResponded: 1, totalRowCount: total },
    },
  } as never);

  useAllResultsMock.mockReturnValue({
    data: {
      edges: rows,
      total,
      columns: [],
    },
    isLoading: false,
  } as never);

  useOsqueryDataViewMock.mockReturnValue({
    dataView: mockDataView,
    isLoading: false,
  } as never);

  useResultsFilteringMock.mockReturnValue({
    query: { query: '', language: 'kuery' },
    filters: [],
    userKuery: '',
    activeFilters: [],
    filtersForSuggestions: [],
    handleQuerySubmit: jest.fn(),
    handleFiltersUpdated: jest.fn(),
    handleFilter: jest.fn(),
  } as never);
};

import { transformEdgesToRecords } from './transform_results';
const transformEdgesToRecordsMock = transformEdgesToRecords as jest.MockedFunction<
  typeof transformEdgesToRecords
>;

const defaultProps = {
  actionId: 'test-action-id',
  agentIds: ['agent-1'],
};

let capturedUnifiedDataTableProps: Record<string, unknown> = {};

// Mock that also captures props for assertions
jest.mock('@kbn/unified-data-table', () => ({
  UnifiedDataTable: (props: Record<string, unknown>) => {
    capturedUnifiedDataTableProps = props;
    capturedOnInitialStateChange =
      (
        props as {
          onInitialStateChange?: (state: Partial<{ isCompareActive: boolean }>) => void;
        }
      ).onInitialStateChange ?? null;

    return <div data-test-subj="mockUnifiedDataTable" />;
  },
  DataLoadingState: { loading: 'loading', loaded: 'loaded' },
  DataGridDensity: { EXPANDED: 'expanded', COMPACT: 'compact' },
}));

describe('UnifiedResultsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnInitialStateChange = null;
    capturedUnifiedDataTableProps = {};
    transformEdgesToRecordsMock.mockReturnValue([]);
  });

  describe('EuiTablePagination visibility', () => {
    it('should show pagination when results are present and comparison mode is inactive', () => {
      const mockRows = [{ id: 'row-1', raw: {}, flattened: {} }] as never;
      transformEdgesToRecordsMock.mockReturnValue(mockRows);
      setupMocks({ rows: [{}], total: 50 });
      useAllResultsMock.mockReturnValue({
        data: { edges: [{}], total: 50, columns: [] },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(screen.getByTestId('pagination-button-0')).toBeInTheDocument();
    });

    it('should hide pagination when comparison mode is active', () => {
      const mockRows = [{ id: 'row-1', raw: {}, flattened: {} }] as never;
      transformEdgesToRecordsMock.mockReturnValue(mockRows);
      setupMocks({ rows: [{}], total: 50 });
      useAllResultsMock.mockReturnValue({
        data: { edges: [{}], total: 50, columns: [] },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      act(() => {
        capturedOnInitialStateChange?.({ isCompareActive: true });
      });

      expect(screen.queryByTestId('pagination-button-0')).not.toBeInTheDocument();
    });

    it('should show pagination again after exiting comparison mode', () => {
      const mockRows = [{ id: 'row-1', raw: {}, flattened: {} }] as never;
      transformEdgesToRecordsMock.mockReturnValue(mockRows);
      setupMocks({ rows: [{}], total: 50 });
      useAllResultsMock.mockReturnValue({
        data: { edges: [{}], total: 50, columns: [] },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      act(() => {
        capturedOnInitialStateChange?.({ isCompareActive: true });
      });

      expect(screen.queryByTestId('pagination-button-0')).not.toBeInTheDocument();

      act(() => {
        capturedOnInitialStateChange?.({ isCompareActive: false });
      });

      expect(screen.getByTestId('pagination-button-0')).toBeInTheDocument();
    });
  });

  describe('ECS-mapped column visibility', () => {
    it('should pass visible columns derived from result data to UnifiedDataTable', () => {
      const mockRows = [{ id: 'row-1', raw: {}, flattened: {} }] as never;
      transformEdgesToRecordsMock.mockReturnValue(mockRows);
      setupMocks({ rows: [{}], total: 1 });
      useAllResultsMock.mockReturnValue({
        data: {
          edges: [{}],
          total: 1,
          columns: ['osquery.days.number', 'osquery.hostname', 'agent.id'],
        },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      // UnifiedDataTable should receive columns prop
      expect(capturedUnifiedDataTableProps).toHaveProperty('columns');
      const columns = capturedUnifiedDataTableProps.columns as string[];
      expect(columns).toContain('osquery.days.number');
      expect(columns).toContain('osquery.hostname');
    });

    it('should render the UnifiedDataTable component', () => {
      const mockRows = [{ id: 'row-1', raw: {}, flattened: {} }] as never;
      transformEdgesToRecordsMock.mockReturnValue(mockRows);
      setupMocks({ rows: [{}], total: 1 });
      useAllResultsMock.mockReturnValue({
        data: { edges: [{}], total: 1, columns: ['osquery.uptime'] },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(screen.getByTestId('mockUnifiedDataTable')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should render results panel when no results', () => {
      setupMocks({ rows: [], total: 0 });
      useAllResultsMock.mockReturnValue({
        data: { edges: [], total: 0, columns: [] },
        isLoading: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(screen.getAllByTestId('osqueryResultsPanel').length).toBeGreaterThan(0);
    });
  });

  describe('export filters publishing', () => {
    // `useActionResults` seeds React Query with
    // `initialData.aggregations.totalRowCount = 0`, so the publisher must rely
    // on `isFetched && !isError` to distinguish "loaded, zero rows" from the
    // initial-loading and error states. See the comment in
    // `unified_results_table.tsx` next to `unfilteredTotal`.
    const initialDataAggregations = { totalResponded: 0, totalRowCount: 0 };

    it('keeps total undefined while the initial fetch is still in flight', () => {
      setupMocks({ rows: [], total: 0 });
      useActionResultsMock.mockReturnValue({
        data: { aggregations: initialDataAggregations },
        isFetched: false,
        isError: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(mockSetFilters).toHaveBeenLastCalledWith(
        'test-action-id',
        expect.objectContaining({ total: undefined })
      );
    });

    it('keeps total undefined when the initial fetch errored, even though `isFetched` is true', () => {
      setupMocks({ rows: [], total: 0 });
      useActionResultsMock.mockReturnValue({
        data: { aggregations: initialDataAggregations },
        isFetched: true,
        isError: true,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(mockSetFilters).toHaveBeenLastCalledWith(
        'test-action-id',
        expect.objectContaining({ total: undefined })
      );
    });

    it('publishes total: 0 only when the fetch confirms zero rows', () => {
      setupMocks({ rows: [], total: 0 });
      useActionResultsMock.mockReturnValue({
        data: { aggregations: { totalResponded: 1, totalRowCount: 0 } },
        isFetched: true,
        isError: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(mockSetFilters).toHaveBeenLastCalledWith(
        'test-action-id',
        expect.objectContaining({ total: 0 })
      );
    });

    it('publishes the actual row count when the fetch succeeds with results', () => {
      setupMocks({ rows: [], total: 7 });
      useActionResultsMock.mockReturnValue({
        data: { aggregations: { totalResponded: 1, totalRowCount: 7 } },
        isFetched: true,
        isError: false,
      } as never);

      render(<UnifiedResultsTable {...defaultProps} />);

      expect(mockSetFilters).toHaveBeenLastCalledWith(
        'test-action-id',
        expect.objectContaining({ total: 7 })
      );
    });

    it('does NOT call clearFilters when the component unmounts (tab-switch-style unmount)', () => {
      setupMocks({ rows: [], total: 5 });
      useActionResultsMock.mockReturnValue({
        data: { aggregations: { totalResponded: 1, totalRowCount: 5 } },
        isFetched: true,
        isError: false,
      } as never);

      const { unmount } = render(<UnifiedResultsTable {...defaultProps} />);

      mockClearFilters.mockClear();
      unmount();

      expect(mockClearFilters).not.toHaveBeenCalled();
    });
  });
});
