/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, within, waitFor, screen, cleanup } from '@testing-library/react';
import type { Filter } from '@kbn/es-query';
import useResizeObserver from 'use-resize-observer/polyfilled';

import { createMockStore, mockGlobalState, TestProviders } from '../../../common/mock';
import type { AlertsTableComponentProps } from './alerts_grouping';
import { GroupedAlertsTable } from './alerts_grouping';
import { TableId } from '@kbn/securitysolution-data-table';
import type { UseFieldBrowserOptionsProps } from '../../../timelines/components/fields_browser';
import { useKibana as mockUseKibana } from '../../../common/lib/kibana/__mocks__';
import { createTelemetryServiceMock } from '../../../common/lib/telemetry/telemetry_service.mock';
import { useQueryAlerts } from '../../containers/detection_engine/alerts/use_query';
import { getQuery, groupingSearchResponse } from './grouping_settings/mock';
import { AlertsEventTypes } from '../../../common/lib/telemetry';
import type { GroupingAggregation } from '@kbn/grouping';
import { defaultGroupingOptions, defaultGroupStatsAggregations } from './grouping_settings';
import type { DataView } from '@kbn/data-views-plugin/common';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { getMockDataViewWithMatchedIndices } from '../../../data_view_manager/mocks/mock_data_view';
import { parseGroupingQuery } from '@kbn/grouping/src';
import type { AlertsGroupingAggregation } from './grouping_settings/types';

jest.setTimeout(15000);

jest.mock('../../containers/detection_engine/alerts/use_query');
jest.mock('../../../common/utils/normalize_time_range');
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

const mockDate = {
  from: '2020-07-07T08:20:18.966Z',
  to: '2020-07-08T08:20:18.966Z',
};

const mockUseGlobalTime = jest
  .fn()
  .mockReturnValue({ ...mockDate, setQuery: jest.fn(), deleteQuery: jest.fn() });

jest.mock('../../../common/containers/use_global_time', () => {
  return {
    useGlobalTime: (...props: unknown[]) => mockUseGlobalTime(...props),
  };
});

const mockOptions = [
  { label: 'Rule name', key: 'kibana.alert.rule.name' },
  { label: 'User name', key: 'user.name' },
  { label: 'Host name', key: 'host.name' },
  { label: 'Source IP', key: 'source.ip' },
];

jest.mock('../../../common/utils/alerts', () => {
  const actual = jest.requireActual('../../../common/utils/alerts');

  return {
    ...actual,
    getDefaultGroupingOptions: () => mockOptions,
  };
});

const mockDispatch = jest.fn();
jest.mock('react-redux-v7', () => {
  const original = jest.requireActual('react-redux-v7');
  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

const mockUseFieldBrowserOptions = jest.fn();
jest.mock('../../../timelines/components/fields_browser', () => ({
  useFieldBrowserOptions: (props: UseFieldBrowserOptionsProps) => mockUseFieldBrowserOptions(props),
}));

const mockUseResizeObserver: jest.Mock = useResizeObserver as jest.Mock;
jest.mock('use-resize-observer/polyfilled');
mockUseResizeObserver.mockImplementation(() => ({}));
const mockedUseKibana = mockUseKibana();
const mockedTelemetry = createTelemetryServiceMock();
jest.mock('../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../common/lib/kibana');

  return {
    ...original,
    useKibana: () => ({
      ...mockedUseKibana,
      services: {
        ...mockedUseKibana.services,
        telemetry: mockedTelemetry,
        storage: {
          get: jest.fn().mockReturnValue([25, 25, 25]),
          set: jest.fn(),
        },
      },
    }),
  };
});

jest.mock('./timeline_actions/use_add_bulk_to_timeline', () => ({
  useAddBulkToTimelineAction: jest.fn(() => {}),
}));

// Mock InspectButton to reduce rendering overhead
jest.mock('../../../common/components/inspect', () => ({
  InspectButton: () => null,
}));

// Mock useInspectButton hook
jest.mock('../alerts_kpis/common/hooks', () => ({
  useInspectButton: jest.fn(),
}));

// Mock useInvalidFilterQuery hook
jest.mock('../../../common/hooks/use_invalid_filter_query', () => ({
  useInvalidFilterQuery: jest.fn(),
}));

// Mock useBrowserFields to avoid unnecessary field processing
jest.mock('../../../data_view_manager/hooks/use_browser_fields', () => ({
  useBrowserFields: jest.fn().mockReturnValue({}),
}));

// Mock useIsExperimentalFeatureEnabled to avoid state access
jest.mock('../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(false),
}));

// Mock combineQueries to avoid expensive query building
jest.mock('../../../common/lib/kuery', () => ({
  combineQueries: jest.fn().mockReturnValue({ filterQuery: '{}' }),
}));

// Mock PopoverItems to simplify rendering
jest.mock('../../../common/components/popover_items', () => ({
  PopoverItems: () => null,
}));

const renderChildComponent = (groupingFilters: Filter[]) => <p data-test-subj="alerts-table" />;

const dataView: DataView = getMockDataViewWithMatchedIndices(['test']);

// Simplified renderers for faster test execution
const simpleGroupTitleRenderer = () => <span data-test-subj="group-title" />;
const simpleGroupStatsRenderer = () => [];

const testProps: AlertsTableComponentProps = {
  ...mockDate,
  // Use simplified renderers instead of complex default ones for faster rendering
  accordionButtonContent: simpleGroupTitleRenderer,
  accordionExtraActionGroupStats: {
    aggregations: defaultGroupStatsAggregations,
    renderer: simpleGroupStatsRenderer,
  },
  dataView,
  defaultFilters: [],
  defaultGroupingOptions,
  globalFilters: [],
  globalQuery: {
    query: 'query',
    language: 'language',
  },
  loading: false,
  renderChildComponent,
  tableId: TableId.test,
};

const mockUseQueryAlerts = useQueryAlerts as jest.Mock;
const mockQueryResponse = {
  loading: false,
  data: {},
  setQuery: () => {},
  response: '',
  request: '',
  refetch: () => {},
};

const getMockStorageState = (groups: string[] = ['none']) =>
  JSON.stringify({
    [testProps.tableId]: {
      activeGroups: groups,
      options: mockOptions,
    },
  });

// Helper functions for common test operations
const expandGroup = (groupElement: HTMLElement) => {
  fireEvent.click(within(groupElement).getByTestId('group-panel-toggle'));
};

const goToPage = (container: HTMLElement, pageNumber: number) => {
  fireEvent.click(within(container).getByTestId(`pagination-button-${pageNumber}`));
};

const assertPageActive = (pagination: HTMLElement, pageNumber: number) => {
  expect(
    within(pagination).getByTestId(`pagination-button-${pageNumber}`).getAttribute('aria-current')
  ).toEqual('page');
};

const assertPageNotActive = (pagination: HTMLElement, pageNumber: number) => {
  expect(
    within(pagination).getByTestId(`pagination-button-${pageNumber}`).getAttribute('aria-current')
  ).toEqual(null);
};

/**
 * Helper to set up 2 levels of grouping with pagination on page 2 for each level
 */
const setupTwoLevelPagination = async (getByTestId: (id: string) => HTMLElement) => {
  // Navigate to page 2 at level 0
  fireEvent.click(getByTestId('pagination-button-1'));

  // Expand level 0 group
  expandGroup(getByTestId('level-0-group-0'));
  await screen.findByTestId('grouping-level-1-pagination');

  // Navigate to page 2 at level 1
  goToPage(getByTestId('level-0-group-0'), 1);
};

describe('GroupedAlertsTable', () => {
  let store = createMockStore();

  beforeEach(() => {
    jest.clearAllMocks();
    store = createMockStore({
      ...mockGlobalState,
      groups: {
        [testProps.tableId]: { options: mockOptions, activeGroups: ['kibana.alert.rule.name'] },
      },
    });

    jest.mocked(useDataView).mockReturnValue({
      status: 'ready',
      dataView,
    });

    mockUseQueryAlerts.mockImplementation((i) => {
      if (i.skip) {
        return mockQueryResponse;
      }
      return {
        ...mockQueryResponse,
        data: groupingSearchResponse,
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('calls the proper initial dispatch actions for groups', async () => {
    const { getByTestId, queryByTestId } = render(
      <TestProviders store={createMockStore()}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(queryByTestId('empty-results-panel')).not.toBeInTheDocument();
      expect(queryByTestId('group-selector-dropdown')).not.toBeInTheDocument();
      expect(getByTestId('alerts-table')).toBeInTheDocument();
    });

    expect(mockDispatch).toHaveBeenCalledTimes(4);
    expect(mockDispatch.mock.calls[0][0].payload).toEqual({
      settings: undefined,
      tableId: testProps.tableId,
    });
    expect(mockDispatch.mock.calls[1][0].payload).toEqual({
      options: defaultGroupingOptions,
      tableId: testProps.tableId,
    });
    expect(mockDispatch.mock.calls[2][0].payload).toEqual({
      activeGroups: ['none'],
      tableId: testProps.tableId,
    });
    expect(mockDispatch.mock.calls[3][0].payload).toEqual({
      activeGroups: ['none'],
      tableId: testProps.tableId,
    });
  });

  it('renders empty grouping table when group is selected without data', async () => {
    mockUseQueryAlerts.mockReturnValue(mockQueryResponse);
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name']));

    const { queryByTestId } = render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    await screen.findByTestId('empty-results-panel');
    expect(queryByTestId('alerts-table')).not.toBeInTheDocument();
  });

  it('renders grouping table in first accordion level when single group is selected', async () => {
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name']));

    const { getByTestId } = render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    expandGroup(getByTestId('level-0-group-0'));

    expect(
      await within(getByTestId('level-0-group-0')).findByTestId('alerts-table')
    ).toBeInTheDocument();
  });

  it('Query gets passed correctly', async () => {
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name']));

    render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(mockUseQueryAlerts).toHaveBeenLastCalledWith({
        fetchMethod: expect.any(Function),
        indexName: 'test',
        query: getQuery('kibana.alert.rule.name', 'SuperUniqueValue-test-uuid', mockDate),
        queryName: 'securitySolutionUI fetchAlerts grouping',
        skip: false,
      });
    });
  });

  it('renders grouping table in second accordion level when 2 groups are selected', async () => {
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name', 'host.name']));
    store = createMockStore({
      ...mockGlobalState,
      groups: {
        [testProps.tableId]: {
          options: mockOptions,
          activeGroups: ['kibana.alert.rule.name', 'host.name'],
        },
      },
    });

    const { getByTestId } = render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    expandGroup(getByTestId('level-0-group-0'));
    await screen.findByTestId('level-1-group-0');

    expect(
      within(getByTestId('level-0-group-0')).queryByTestId('alerts-table')
    ).not.toBeInTheDocument();

    expandGroup(getByTestId('level-1-group-0'));

    expect(
      await within(getByTestId('level-1-group-0')).findByTestId('alerts-table')
    ).toBeInTheDocument();
  });

  describe('pagination reset on group change', () => {
    beforeEach(() => {
      jest
        .spyOn(window.localStorage, 'getItem')
        .mockReturnValue(getMockStorageState(['kibana.alert.rule.name', 'host.name']));
      store = createMockStore({
        ...mockGlobalState,
        groups: {
          [testProps.tableId]: {
            options: mockOptions,
            activeGroups: ['kibana.alert.rule.name', 'host.name'],
          },
        },
      });
    });

    it('resets all levels pagination when selected group changes', async () => {
      const { getByTestId, getAllByTestId } = render(
        <TestProviders store={store}>
          <GroupedAlertsTable {...testProps} />
        </TestProviders>
      );

      await setupTwoLevelPagination(getByTestId);

      // Verify both levels are on page 2
      [
        getByTestId('grouping-level-0-pagination'),
        getByTestId('grouping-level-1-pagination'),
      ].forEach((pagination) => {
        assertPageNotActive(pagination, 0);
        assertPageActive(pagination, 1);
      });

      // Change group selection
      fireEvent.click(getAllByTestId('group-selector-dropdown')[0]);
      fireEvent.click(getAllByTestId('panel-user.name')[0]);

      // Verify pagination is reset to page 1
      await waitFor(() => {
        assertPageActive(getByTestId('grouping-level-0-pagination'), 0);
        assertPageNotActive(getByTestId('grouping-level-0-pagination'), 1);
      });
    });

    it('resets all levels pagination when global query updates', async () => {
      const { getByTestId, rerender } = render(
        <TestProviders store={store}>
          <GroupedAlertsTable {...testProps} />
        </TestProviders>
      );

      await setupTwoLevelPagination(getByTestId);

      // Update global query
      rerender(
        <TestProviders store={store}>
          <GroupedAlertsTable
            {...{ ...testProps, globalQuery: { query: 'updated', language: 'language' } }}
          />
        </TestProviders>
      );

      // Verify all pagination reset
      await waitFor(() => {
        [
          getByTestId('grouping-level-0-pagination'),
          getByTestId('grouping-level-1-pagination'),
        ].forEach((pagination) => {
          assertPageActive(pagination, 0);
          assertPageNotActive(pagination, 1);
        });
      });
    });

    it('resets inner group pagination when parent group changes', async () => {
      const { getByTestId } = render(
        <TestProviders store={store}>
          <GroupedAlertsTable {...testProps} />
        </TestProviders>
      );

      await setupTwoLevelPagination(getByTestId);

      // Open different level 0 group
      expandGroup(getByTestId('level-0-group-1'));

      // Verify level 0 pagination unchanged, level 1 reset
      await waitFor(() => {
        assertPageNotActive(getByTestId('grouping-level-0-pagination'), 0);
        assertPageActive(getByTestId('grouping-level-0-pagination'), 1);

        assertPageActive(getByTestId('grouping-level-1-pagination'), 0);
        assertPageNotActive(getByTestId('grouping-level-1-pagination'), 1);
      });
    });
  });

  describe('pagination reset on page size change', () => {
    beforeEach(() => {
      jest
        .spyOn(window.localStorage, 'getItem')
        .mockReturnValue(getMockStorageState(['kibana.alert.rule.name', 'host.name']));
      store = createMockStore({
        ...mockGlobalState,
        groups: {
          [testProps.tableId]: {
            options: mockOptions,
            activeGroups: ['kibana.alert.rule.name', 'host.name'],
          },
        },
      });
    });

    it(`resets level's current page when that level's page size updates`, async () => {
      const { getByTestId } = render(
        <TestProviders store={store}>
          <GroupedAlertsTable {...testProps} />
        </TestProviders>
      );

      await setupTwoLevelPagination(getByTestId);

      // Change inner level page size
      fireEvent.click(
        within(getByTestId('grouping-level-1')).getByTestId('tablePaginationPopoverButton')
      );
      fireEvent.click(getByTestId('tablePagination-100-rows'));

      // Verify level 0 pagination unchanged, level 1 reset
      await waitFor(() => {
        assertPageNotActive(getByTestId('grouping-level-0-pagination'), 0);
        assertPageActive(getByTestId('grouping-level-0-pagination'), 1);

        const level1Pagination = getByTestId('grouping-level-1-pagination');
        assertPageActive(level1Pagination, 0);
        expect(
          within(level1Pagination).queryByTestId('pagination-button-1')
        ).not.toBeInTheDocument();
      });
    });

    it(`resets outer level's current page when that level's page size updates`, async () => {
      const { getByTestId, getAllByTestId } = render(
        <TestProviders store={store}>
          <GroupedAlertsTable {...testProps} />
        </TestProviders>
      );

      await setupTwoLevelPagination(getByTestId);

      // Change outer level page size
      const tablePaginations = getAllByTestId('tablePaginationPopoverButton');
      fireEvent.click(tablePaginations[tablePaginations.length - 1]);
      fireEvent.click(getByTestId('tablePagination-100-rows'));

      // Verify level 0 reset, level 1 unchanged
      await waitFor(() => {
        const level0Pagination = getByTestId('grouping-level-0-pagination');
        assertPageActive(level0Pagination, 0);
        expect(
          within(level0Pagination).queryByTestId('pagination-button-1')
        ).not.toBeInTheDocument();

        assertPageNotActive(getByTestId('grouping-level-1-pagination'), 0);
        assertPageActive(getByTestId('grouping-level-1-pagination'), 1);
      });
    });
  });

  it('sends telemetry data when selected group changes', async () => {
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name']));
    store = createMockStore({
      ...mockGlobalState,
      groups: {
        [testProps.tableId]: {
          options: mockOptions,
          activeGroups: ['kibana.alert.rule.name'],
        },
      },
    });

    const { getByTestId } = render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} />
      </TestProviders>
    );

    // Change to user.name
    fireEvent.click(getByTestId('group-selector-dropdown'));
    fireEvent.click(getByTestId('panel-user.name'));

    await waitFor(() => {
      expect(mockedTelemetry.reportEvent).toHaveBeenCalledWith(
        AlertsEventTypes.AlertsGroupingChanged,
        {
          groupByField: 'user.name',
          tableId: testProps.tableId,
        }
      );
    });

    // Change to host.name
    fireEvent.click(getByTestId('group-selector-dropdown'));
    fireEvent.click(getByTestId('panel-host.name'));

    await waitFor(() => {
      expect(mockedTelemetry.reportEvent).toHaveBeenCalledWith(
        AlertsEventTypes.AlertsGroupingChanged,
        {
          groupByField: 'host.name',
          tableId: testProps.tableId,
        }
      );
    });
  });

  it('updates group settings on mount', () => {
    const settings = {
      hideNoneOption: true,
      hideCustomFieldOption: true,
      hideOptionsTitle: true,
      popoverButtonLabel: 'Custom Label',
    };

    render(
      <TestProviders store={createMockStore()}>
        <GroupedAlertsTable {...testProps} settings={settings} />
      </TestProviders>
    );

    expect(mockDispatch).toHaveBeenCalledTimes(3);
    expect(mockDispatch.mock.calls[0][0].payload).toEqual({
      settings,
      tableId: testProps.tableId,
    });
  });

  it('calls onAggregationsChange when aggregations are updated', async () => {
    const onAggregationsChange = jest.fn();
    jest
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue(getMockStorageState(['kibana.alert.rule.name']));

    render(
      <TestProviders store={store}>
        <GroupedAlertsTable {...testProps} onAggregationsChange={onAggregationsChange} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(onAggregationsChange).toHaveBeenCalledWith(
        parseGroupingQuery(
          'kibana.alert.rule.name',
          'SuperUniqueValue-test-uuid',
          groupingSearchResponse.aggregations as GroupingAggregation<AlertsGroupingAggregation>
        ),
        0
      );
    });
  });
});
