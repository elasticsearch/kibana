/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Adapted from x-pack/solutions/security/plugins/security_solution/public/detections/components/alerts_table/alerts_grouping.test.tsx
 */
import React from 'react';
import { fireEvent, render, waitFor, within, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Filter } from '@kbn/es-query';

import { AlertsGrouping } from './alerts_grouping';

import { useGetAlertsGroupAggregationsQuery } from '@kbn/alerts-ui-shared';
import useResizeObserver from 'use-resize-observer/polyfilled';
import { groupingSearchResponse } from '../mocks/grouping_query.mock';
import { useAlertsGroupingState } from '../contexts/alerts_grouping_context';
import { I18nProvider } from '@kbn/i18n-react';
import {
  mockRuleTypeIds,
  mockConsumers,
  mockDate,
  mockGroupingProps,
  mockGroupingId,
  mockOptions,
} from '../mocks/grouping_props.mock';

jest.mock('@kbn/alerts-ui-shared/src/common/hooks/use_get_alerts_group_aggregations_query', () => ({
  useGetAlertsGroupAggregationsQuery: jest.fn(),
}));

jest.mock('@kbn/alerts-ui-shared/src/common/hooks/use_alerts_data_view', () => ({
  useAlertsDataView: jest.fn().mockReturnValue({ dataView: { fields: [] } }),
}));

jest.mock('../contexts/alerts_grouping_context', () => {
  const original = jest.requireActual('../contexts/alerts_grouping_context');
  return {
    ...original,
    useAlertsGroupingState: jest.fn(),
  };
});

const mockUseAlertsGroupingState = useAlertsGroupingState as jest.Mock;

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

const mockUseGetAlertsGroupAggregationsQuery = useGetAlertsGroupAggregationsQuery as jest.Mock;

const mockUseResizeObserver: jest.Mock = useResizeObserver as jest.Mock;
jest.mock('use-resize-observer/polyfilled');
mockUseResizeObserver.mockImplementation(() => ({}));

const renderChildComponent = (_groupingFilters: Filter[]) => <p data-test-subj="alerts-table" />;

const getMockStorageState = (groups: string[] = ['none']) =>
  JSON.stringify({
    [mockGroupingId]: {
      activeGroups: groups,
      options: mockOptions,
    },
  });

const mockQueryResponse = {
  loading: false,
  data: {
    aggregations: {
      groupsCount: {
        value: 0,
      },
    },
  },
};

const TestProviders = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

const mockAlertsGroupingState = {
  grouping: {
    options: mockOptions,
    activeGroups: ['kibana.alert.rule.name'],
  },
  updateGrouping: jest.fn(),
};

const expandGroup = (groupElement: HTMLElement) => {
  fireEvent.click(within(groupElement).getByTestId('group-panel-toggle'));
};

const goToPage = (container: HTMLElement, pageNumber: number) => {
  fireEvent.click(within(container).getByTestId(`pagination-button-${pageNumber}`));
};

const setupThreeLevelPagination = async () => {
  fireEvent.click(screen.getByTestId('pagination-button-1'));
  expandGroup(screen.getByTestId('level-0-group-0'));
  await screen.findByTestId('grouping-level-1-pagination');

  goToPage(screen.getByTestId('level-0-group-0'), 1);
  expandGroup(screen.getByTestId('level-1-group-0'));
  await screen.findByTestId('grouping-level-2-pagination');

  goToPage(screen.getByTestId('level-1-group-0'), 1);
  expandGroup(screen.getByTestId('level-2-group-0'));
};

describe('AlertsGrouping', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseGetAlertsGroupAggregationsQuery.mockImplementation(() => ({
      loading: false,
      data: groupingSearchResponse,
    }));
    mockUseAlertsGroupingState.mockReturnValue(mockAlertsGroupingState);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty grouping table when group is selected without data', () => {
    mockUseGetAlertsGroupAggregationsQuery.mockReturnValue(mockQueryResponse);
    window.localStorage.setItem(
      `grouping-table-${mockGroupingId}`,
      getMockStorageState(['kibana.alert.rule.name'])
    );

    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );
    expect(screen.queryByTestId('alerts-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-results-panel')).toBeInTheDocument();
  });

  it('renders grouping table in first accordion level when single group is selected', async () => {
    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    await userEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );
    expect(
      within(screen.getByTestId('level-0-group-0')).getByTestId('alerts-table')
    ).toBeInTheDocument();
  });

  it('Query gets passed correctly', () => {
    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );
    expect(mockUseGetAlertsGroupAggregationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: {
          aggregations: {},
          ruleTypeIds: mockRuleTypeIds,
          consumers: mockConsumers,
          groupByField: 'kibana.alert.rule.name',
          filters: [
            {
              bool: {
                filter: [],
                must: [],
                must_not: [],
                should: [],
              },
            },
            {
              range: {
                'kibana.alert.time_range': {
                  gte: mockDate.from,
                  lte: mockDate.to,
                },
              },
            },
          ],
          pageIndex: 0,
          pageSize: 25,
        },
      })
    );
  });

  it('renders grouping table in second accordion level when 2 groups are selected', async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'user.name'],
      },
    });
    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );
    await userEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );
    expect(
      within(screen.getByTestId('level-0-group-0')).queryByTestId('alerts-table')
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(screen.getByTestId('level-1-group-0')).getByTestId('group-panel-toggle')
    );
    expect(
      within(screen.getByTestId('level-1-group-0')).getByTestId('alerts-table')
    ).toBeInTheDocument();
  });

  it('resets all levels pagination when selected group changes', async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'host.name', 'user.name'],
      },
    });
    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    fireEvent.click(screen.getByTestId('pagination-button-1'));
    fireEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );

    fireEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('pagination-button-1')
    );
    fireEvent.click(
      within(screen.getByTestId('level-1-group-0')).getByTestId('group-panel-toggle')
    );

    fireEvent.click(
      within(screen.getByTestId('level-1-group-0')).getByTestId('pagination-button-1')
    );

    [
      screen.getByTestId('grouping-level-0-pagination'),
      screen.getByTestId('grouping-level-1-pagination'),
      screen.getByTestId('grouping-level-2-pagination'),
    ].forEach((pagination) => {
      expect(
        within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
      ).toEqual(null);
      expect(
        within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
      ).toEqual('page');
    });

    fireEvent.click(screen.getAllByTestId('group-selector-dropdown')[0]);
    fireEvent.click(screen.getAllByTestId('panel-user.name')[0]);

    [
      screen.getByTestId('grouping-level-0-pagination'),
      screen.getByTestId('grouping-level-1-pagination'),
      // level 2 has been removed with the group selection change
    ].forEach((pagination) => {
      expect(
        within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
      ).toEqual('page');
      expect(
        within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
      ).toEqual(null);
    });
  });

  it('resets all levels pagination when global query updates', async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'host.name', 'user.name'],
      },
    });

    const { rerender } = render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    fireEvent.click(screen.getByTestId('pagination-button-1'));
    fireEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );
    fireEvent.click(
      within(screen.getByTestId('level-0-group-0')).getByTestId('pagination-button-1')
    );
    fireEvent.click(
      within(screen.getByTestId('level-1-group-0')).getByTestId('group-panel-toggle')
    );
    fireEvent.click(
      within(screen.getByTestId('level-1-group-0')).getByTestId('pagination-button-1')
    );

    rerender(
      <TestProviders>
        <AlertsGrouping
          {...{ ...mockGroupingProps, globalQuery: { query: 'updated', language: 'language' } }}
        >
          {renderChildComponent}
        </AlertsGrouping>
      </TestProviders>
    );

    await waitFor(() => {
      [
        screen.getByTestId('grouping-level-0-pagination'),
        screen.getByTestId('grouping-level-1-pagination'),
        screen.getByTestId('grouping-level-2-pagination'),
      ].forEach((pagination) => {
        expect(
          within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
        ).toEqual('page');
        expect(
          within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
        ).toEqual(null);
      });
    });
  });

  it('resets only most inner group pagination when its parent groups open/close', async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'host.name', 'user.name'],
      },
    });

    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    await setupThreeLevelPagination();

    expandGroup(await screen.findByTestId('level-1-group-1'));

    await waitFor(() => {
      [
        screen.getByTestId('grouping-level-0-pagination'),
        screen.getByTestId('grouping-level-1-pagination'),
      ].forEach((pagination) => {
        expect(
          within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
        ).toEqual(null);
        expect(
          within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
        ).toEqual('page');
      });

      expect(
        within(screen.getByTestId('grouping-level-2-pagination'))
          .getByTestId('pagination-button-0')
          .getAttribute('aria-current')
      ).toEqual('page');
      expect(
        within(screen.getByTestId('grouping-level-2-pagination'))
          .getByTestId('pagination-button-1')
          .getAttribute('aria-current')
      ).toEqual(null);
    });
  });

  it(`resets innermost level's current page when that level's page size updates`, async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'host.name', 'user.name'],
      },
    });

    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    fireEvent.click(await screen.findByTestId('pagination-button-1'));
    fireEvent.click(
      within(await screen.findByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );
    fireEvent.click(
      within(await screen.findByTestId('level-0-group-0')).getByTestId('pagination-button-1')
    );
    fireEvent.click(
      within(await screen.findByTestId('level-1-group-0')).getByTestId('group-panel-toggle')
    );

    fireEvent.click(
      within(await screen.findByTestId('level-1-group-0')).getByTestId('pagination-button-1')
    );
    fireEvent.click(
      within(await screen.findByTestId('grouping-level-2')).getByTestId(
        'tablePaginationPopoverButton'
      )
    );
    fireEvent.click(await screen.findByTestId('tablePagination-100-rows'));

    [
      await screen.findByTestId('grouping-level-0-pagination'),
      await screen.findByTestId('grouping-level-1-pagination'),
      await screen.findByTestId('grouping-level-2-pagination'),
    ].forEach((pagination, i) => {
      if (i !== 2) {
        expect(
          within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
        ).toEqual(null);
        expect(
          within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
        ).toEqual('page');
      } else {
        expect(
          within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
        ).toEqual('page');
        expect(within(pagination).queryByTestId('pagination-button-1')).not.toBeInTheDocument();
      }
    });
  });

  it(`resets outermost level's current page when that level's page size updates`, async () => {
    mockUseAlertsGroupingState.mockReturnValue({
      ...mockAlertsGroupingState,
      grouping: {
        ...mockAlertsGroupingState.grouping,
        activeGroups: ['kibana.alert.rule.name', 'host.name', 'user.name'],
      },
    });

    render(
      <TestProviders>
        <AlertsGrouping {...mockGroupingProps}>{renderChildComponent}</AlertsGrouping>
      </TestProviders>
    );

    fireEvent.click(screen.getByTestId('pagination-button-1'));
    fireEvent.click(
      within(await screen.findByTestId('level-0-group-0')).getByTestId('group-panel-toggle')
    );

    fireEvent.click(
      within(await screen.findByTestId('level-0-group-0')).getByTestId('pagination-button-1')
    );
    fireEvent.click(
      within(await screen.findByTestId('level-1-group-0')).getByTestId('group-panel-toggle')
    );

    fireEvent.click(
      within(await screen.findByTestId('level-1-group-0')).getByTestId('pagination-button-1')
    );
    const tablePaginations = await screen.findAllByTestId('tablePaginationPopoverButton');
    fireEvent.click(tablePaginations[tablePaginations.length - 1]);
    fireEvent.click(await screen.findByTestId('tablePagination-100-rows'));

    await waitFor(() => {
      [
        screen.getByTestId('grouping-level-0-pagination'),
        screen.getByTestId('grouping-level-1-pagination'),
        screen.getByTestId('grouping-level-2-pagination'),
      ].forEach((pagination, i) => {
        if (i !== 0) {
          expect(
            within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
          ).toEqual(null);
          expect(
            within(pagination).getByTestId('pagination-button-1').getAttribute('aria-current')
          ).toEqual('page');
        } else {
          expect(
            within(pagination).getByTestId('pagination-button-0').getAttribute('aria-current')
          ).toEqual('page');
          expect(within(pagination).queryByTestId('pagination-button-1')).not.toBeInTheDocument();
        }
      });
    });
  });
});
