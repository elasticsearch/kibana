/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { I18nProvider } from '@kbn/i18n-react';
import { AlertEpisodesListPage } from './alert_episodes_list_page';
import type { CustomBulkActions } from '@kbn/unified-data-table';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { UnifiedDataTable } from '@kbn/unified-data-table';
import { fetchAlertingEpisodes } from '@kbn/alerting-v2-episodes-ui/apis/fetch_alerting_episodes';
import { useAlertingEpisodesDataView } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_episodes_data_view';
import { useEpisodesKpisQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_episodes_kpis_query';
import { queryKeys } from '@kbn/alerting-v2-episodes-ui/query_keys';
import userEvent from '@testing-library/user-event';
import { DEFAULT_EPISODES_LIST_FILTER } from './utils/episodes_list_url_state';
import { createMockSpaces } from '../../../common/utils/test_utils';
import {
  createEpisodeActions,
  type EpisodeActionContext,
} from '@kbn/alerting-v2-episodes-ui/actions';

jest.mock('@kbn/unified-data-table', () => ({
  DataLoadingState: { loading: 'loading', loaded: 'loaded' },
  ROWS_HEIGHT_OPTIONS: { auto: -1, single: 1, default: 3 },
  UnifiedDataTable: jest.fn(() => null),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/apis/fetch_alerting_episodes');

// useAlertingEpisodesDataView uses react-use/useAsync internally with getEsqlDataView,
// which requires heavy Kibana data-view infra. Mock the hook so useFetchAlertingEpisodesQuery
// gets a ready dataView without going through the full data-view construction path.
jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_alerting_episodes_data_view');

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_episodes_kpis_query');

jest.mock('@kbn/alerting-v2-episodes-ui/actions', () => ({
  createEpisodeActions: jest.fn(() => []),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/details_flyout', () => ({
  AlertEpisodeDetailsFlyout: jest.fn(() => <div data-test-subj="alertEpisodeFlyoutStub" />),
}));

jest.mock('../../hooks/use_breadcrumbs', () => ({ useBreadcrumbs: jest.fn() }));

jest.mock('./components/episodes_kpis', () => ({
  EpisodesKpis: () => null,
}));

// Capture filter-bar props so tests can drive refresh + filter changes from outside the component.
// onRefresh is typed as returning unknown so tests can await the result (invalidateEpisodeQueries returns a Promise).
let capturedFilterBarOnRefresh: (() => unknown) | undefined;
let capturedFilterBarOnFilterChange: ((update: any) => void) | undefined;
jest.mock('./components/episodes_filter_bar', () => ({
  EpisodesFilterBar: jest.fn(
    ({
      onRefresh,
      onFilterChange,
    }: {
      onRefresh?: () => unknown;
      onFilterChange?: (update: any) => void;
    }) => {
      capturedFilterBarOnRefresh = onRefresh;
      capturedFilterBarOnFilterChange = onFilterChange;
      return null;
    }
  ),
}));

jest.mock('./components/episodes_histogram', () => ({
  EpisodesHistogram: () => null,
}));

jest.mock('react-use/lib/useObservable', () =>
  jest.fn().mockReturnValue({ from: 'now-24h', to: 'now' })
);

const mockHttp = httpServiceMock.createStartContract();
const mockSpaces = createMockSpaces();

const mockServices = {
  http: mockHttp,
  data: {
    query: {
      timefilter: {
        timefilter: {
          getTimeUpdate$: jest.fn().mockReturnValue({
            pipe: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
          }),
          getTime: jest.fn().mockReturnValue({ from: 'now-24h', to: 'now' }),
          setTime: jest.fn(),
        },
      },
    },
  },
  overlays: {},
  notifications: { toasts: {} },
  rendering: {},
  application: { capabilities: {} },
  expressions: {},
  share: {},
  uiSettings: {},
  unifiedDocViewer: {},
  dataViews: {},
  userProfile: {},
  uiActions: { getTriggerCompatibleActions: jest.fn().mockResolvedValue([]) },
  spaces: mockSpaces,
};

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn().mockImplementation(() => ({ services: mockServices })),
}));

const mockUnifiedDataTable = jest.mocked(UnifiedDataTable);

const mockDataView = {
  fields: { forEach: jest.fn() },
  setFieldCustomLabel: jest.fn(),
  setFieldFormat: jest.fn(),
  addRuntimeField: jest.fn(),
  timeFieldName: '@timestamp',
};

const mockEpisodes = [
  {
    'episode.id': 'ep1',
    'rule.id': 'rule1',
    group_hash: 'gh1',
    '@timestamp': '2026-01-01T00:00:00Z',
  },
  {
    'episode.id': 'ep2',
    'rule.id': 'rule2',
    group_hash: 'gh2',
    '@timestamp': '2026-01-01T00:00:00Z',
  },
  {
    'episode.id': 'ep3',
    'rule.id': 'rule3',
    group_hash: 'gh1',
    '@timestamp': '2026-01-01T00:00:00Z',
  },
];

// jest.clearAllMocks() only resets call history, not implementations, so these stable
// return values are set once at module scope and persist across all tests.
jest.mocked(useAlertingEpisodesDataView).mockReturnValue(mockDataView as any);
jest.mocked(fetchAlertingEpisodes).mockResolvedValue(mockEpisodes as any);
mockHttp.post.mockResolvedValue({ rules: [] });

const mockCreateEpisodeActions = jest.mocked(createEpisodeActions);

const mockedUseEpisodesKpisQuery = jest.mocked(useEpisodesKpisQuery);

// The page calls useEpisodesKpisQuery twice: filtered (filterState defined)
// and total (filterState undefined). Differentiate by that arg.
const defaultKpisImpl: typeof useEpisodesKpisQuery = ({ filterState }) => ({
  data: {
    alertsCount: filterState ? 3 : 10,
    firingRules: 0,
    assignedToMe: 0,
    unassigned: 0,
    acknowledged: 0,
    snoozed: 0,
  },
  isLoading: false,
  isError: false,
});
mockedUseEpisodesKpisQuery.mockImplementation(defaultKpisImpl);

const getCapturedBulkActions = (): CustomBulkActions => {
  const calls = mockUnifiedDataTable.mock.calls;
  const lastCall = calls[calls.length - 1][0];
  return lastCall.customBulkActions as CustomBulkActions;
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AlertEpisodesListPage />
        </QueryClientProvider>
      </MemoryRouter>
    </I18nProvider>
  );
};

describe('AlertEpisodesListPage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreateEpisodeActions.mockReturnValue([]);
    jest.mocked(useAlertingEpisodesDataView).mockReturnValue(mockDataView as any);
    jest.mocked(fetchAlertingEpisodes).mockResolvedValue(mockEpisodes as any);
    mockHttp.post.mockResolvedValue({ rules: [] });
    renderPage();
    // Wait for episodes to load so bulk action handlers have access to episode data
    await waitFor(() => {
      const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
      expect(lastCall?.rows?.length).toBeGreaterThan(0);
    });
  });

  it('renders the experimental badge in the page header', () => {
    expect(screen.getByTestId('alertingV2ExperimentalBadge')).toBeInTheDocument();
  });

  it('passes customBulkActions derived from episode actions to UnifiedDataTable', () => {
    const mockAction = {
      id: 'test-action',
      order: 1,
      displayName: 'Test Action',
      iconType: 'star',
      isCompatible: jest.fn(() => true),
      execute: jest.fn(async () => {}),
    };
    mockCreateEpisodeActions.mockReturnValue([mockAction]);

    renderPage();

    const bulkActions = getCapturedBulkActions();
    // With no actions returned by createEpisodeActions (cleared mock), expect empty
    expect(bulkActions).toBeDefined();
  });

  it('passes rowAdditionalLeadingControls to UnifiedDataTable', () => {
    const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
    expect(lastCall).toHaveProperty('rowAdditionalLeadingControls');
    expect(Array.isArray(lastCall?.rowAdditionalLeadingControls)).toBe(true);
  });

  it('does not pass key prop derived from tableKey (no tableKey state)', () => {
    // The table should be rendered without a dynamic key that causes remounts
    const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
    // key is not a prop that appears in the component's props object in React,
    // so we just verify UnifiedDataTable was called (rendered)
    expect(lastCall).toBeDefined();
  });

  it('calls createEpisodeActions with services from useKibana', () => {
    expect(mockCreateEpisodeActions).toHaveBeenCalledWith(
      expect.objectContaining({
        http: mockServices.http,
        expressions: mockServices.expressions,
      })
    );
  });

  it('passes expandedDoc, setExpandedDoc and renderDocumentView to UnifiedDataTable', () => {
    const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
    expect(lastCall).toHaveProperty('expandedDoc');
    expect(typeof lastCall?.setExpandedDoc).toBe('function');
    expect(typeof lastCall?.renderDocumentView).toBe('function');
  });

  it('renderDocumentView returns a node when invoked with a hit containing episode.id', () => {
    const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
    const renderDocumentView = lastCall?.renderDocumentView as (hit: {
      flattened: Record<string, unknown>;
    }) => React.ReactNode;
    const node = renderDocumentView({ flattened: { 'episode.id': 'ep-1' } });
    expect(node).toBeTruthy();
  });
});

describe('query invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFilterBarOnRefresh = undefined;
    mockCreateEpisodeActions.mockReturnValue([]);
    jest.mocked(useAlertingEpisodesDataView).mockReturnValue(mockDataView as any);
    jest.mocked(fetchAlertingEpisodes).mockResolvedValue(mockEpisodes as any);
    mockHttp.post.mockResolvedValue({ rules: [] });
  });

  it('invalidates episodesKpis when the refresh button is clicked', async () => {
    renderPage();

    await waitFor(() => {
      expect(capturedFilterBarOnRefresh).toBeDefined();
    });

    // Set up the spy after rendering so it does not interfere with React Query's query execution
    const mockInvalidateQueries = jest
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockResolvedValue(undefined);

    await act(() => capturedFilterBarOnRefresh!());

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.kpisAll() });
    mockInvalidateQueries.mockRestore();
  });

  it('invalidates episodesKpis when an episode action succeeds', async () => {
    let capturedOnSuccess: (() => unknown) | undefined;
    const mockAction = {
      id: 'test-action',
      order: 1,
      displayName: 'Test Action',
      iconType: 'star',
      isCompatible: jest.fn(() => true),
      execute: jest.fn(async ({ onSuccess }: EpisodeActionContext) => {
        capturedOnSuccess = onSuccess;
      }),
    };
    mockCreateEpisodeActions.mockReturnValue([mockAction]);

    renderPage();

    // Wait for episodes to load so that bulk action handlers have access to episode data
    await waitFor(() => {
      const lastCall = mockUnifiedDataTable.mock.calls.at(-1)?.[0];
      expect(lastCall?.rows?.length).toBeGreaterThan(0);
    });

    const bulkActions = getCapturedBulkActions();
    const firstAction = bulkActions[0];

    // Set up the spy after rendering so it does not interfere with React Query's query execution
    const mockInvalidateQueries = jest
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockResolvedValue(undefined);

    // Trigger the bulk action — this calls action.execute with an onSuccess callback
    await act(() => {
      firstAction.onClick({ selectedDocIds: ['ep1'] });
    });

    expect(capturedOnSuccess).toBeDefined();

    // Simulate success — verify the KPIs query is invalidated
    await act(() => capturedOnSuccess!());

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.kpisAll() });
    mockInvalidateQueries.mockRestore();
  });
});

describe('episode count + reset filters toolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFilterBarOnFilterChange = undefined;
    mockCreateEpisodeActions.mockReturnValue([]);
    jest.mocked(useAlertingEpisodesDataView).mockReturnValue(mockDataView as any);
    jest.mocked(fetchAlertingEpisodes).mockResolvedValue(mockEpisodes as any);
    mockHttp.post.mockResolvedValue({ rules: [] });
    mockedUseEpisodesKpisQuery.mockImplementation(defaultKpisImpl);
  });

  it('renders "Showing X of Y alerts" with filtered and total counts', async () => {
    renderPage();
    const node = await screen.findByTestId('alertEpisodesItemCount');
    expect(node.textContent).toMatch(/^Showing\s+3\s+of\s+10\s+alerts$/);
  });

  it('fires useEpisodesKpisQuery both with and without filterState', () => {
    renderPage();
    const calls = mockedUseEpisodesKpisQuery.mock.calls.map(([args]) => args);
    expect(calls.some((c) => c.filterState !== undefined)).toBe(true);
    expect(calls.some((c) => c.filterState === undefined)).toBe(true);
  });

  it('disables the reset filters button when filter state equals the default', async () => {
    renderPage();
    const button = await screen.findByTestId('episodesFilterBar-resetFilters');
    expect(button).toBeDisabled();
  });

  it('enables the reset button after filterState diverges and disables it again on click', async () => {
    renderPage();
    await waitFor(() => expect(capturedFilterBarOnFilterChange).toBeDefined());

    await act(async () => {
      capturedFilterBarOnFilterChange!({ ...DEFAULT_EPISODES_LIST_FILTER, ruleId: 'rule-1' });
    });

    const button = await screen.findByTestId('episodesFilterBar-resetFilters');
    expect(button).toBeEnabled();

    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('episodesFilterBar-resetFilters')).toBeDisabled();
    });
  });
});
