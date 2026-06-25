/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EuiProvider } from '@elastic/eui';

import { PackQueriesStatusTable, getLensAttributes } from './pack_queries_status_table';
import type { PackQueryFormData } from './queries/use_pack_query_form';
import { usePackQueryLastResults } from './use_pack_query_last_results';
import { usePackQueryErrors } from './use_pack_query_errors';
import { useLogsDataView } from '../common/hooks/use_logs_data_view';
import { useKibana } from '../common/lib/kibana';
import { useSpaceId } from '../common/hooks/use_space_id';
import { ExperimentalFeaturesService } from '../common/experimental_features_service';
import { allowedExperimentalValues } from '../../common/experimental_features';

jest.mock('./use_pack_query_last_results');
jest.mock('./use_pack_query_errors');
jest.mock('../common/hooks/use_logs_data_view');
jest.mock('../common/hooks/use_space_id');
jest.mock('../common/lib/kibana');

const usePackQueryLastResultsMock = usePackQueryLastResults as jest.MockedFunction<
  typeof usePackQueryLastResults
>;
const usePackQueryErrorsMock = usePackQueryErrors as jest.MockedFunction<typeof usePackQueryErrors>;
const useLogsDataViewMock = useLogsDataView as jest.MockedFunction<typeof useLogsDataView>;
const useSpaceIdMock = useSpaceId as jest.MockedFunction<typeof useSpaceId>;
const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;

const renderWithContext = (Element: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <EuiProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>{Element}</QueryClientProvider>
      </IntlProvider>
    </EuiProvider>
  );
};

beforeAll(() => {
  ExperimentalFeaturesService.init({
    experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
  });
});

describe('PackQueriesStatusTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useSpaceIdMock.mockReturnValue('default');
    useLogsDataViewMock.mockReturnValue({
      data: { id: 'logs-*', title: 'logs-osquery_manager.result-*' },
      isLoading: false,
    } as unknown as ReturnType<typeof useLogsDataView>);
    useKibanaMock.mockReturnValue({
      services: {
        lens: { canUseEditor: () => true },
        discover: { locator: { getUrl: jest.fn().mockResolvedValue('') } },
        application: { capabilities: { discover_v2: { show: true } } },
      },
    } as unknown as ReturnType<typeof useKibana>);
    usePackQueryErrorsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof usePackQueryErrors>);
  });

  it('passes scheduleId for scheduled queries and only actionId for legacy queries', () => {
    usePackQueryLastResultsMock.mockReturnValue({
      data: {
        lastResultTime: ['2026-05-06T10:00:00.000Z'],
        uniqueAgentsCount: 7,
        docCount: 99,
        executionCount: 12,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePackQueryLastResults>);

    const data: PackQueryFormData[] = [
      {
        id: 'scheduled_query',
        query: 'SELECT 1;',
        interval: 60,
        ecs_mapping: {},
        schedule_id: 'sched-uuid-aaa',
      },
      {
        id: 'legacy_query',
        query: 'SELECT 2;',
        interval: 120,
        ecs_mapping: {},
      },
    ];

    renderWithContext(
      <PackQueriesStatusTable agentIds={['a-1']} data={data} packName="pack-name" />
    );

    // The scheduled row passes both `scheduleId` and an `actionId`. The legacy
    // row passes only `actionId`. Downstream hooks always receive `scheduleId`
    // when available, and the precedence rule there decides which filter wins.
    const calls = usePackQueryLastResultsMock.mock.calls.map(([args]) => args);

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scheduleId: 'sched-uuid-aaa',
          actionId: 'pack_default--pack-name_scheduled_query',
          interval: 60,
        }),
        expect.objectContaining({
          scheduleId: undefined,
          actionId: 'pack_default--pack-name_legacy_query',
          interval: 120,
        }),
      ])
    );
  });

  describe('getLensAttributes', () => {
    const logsDataView = {
      id: 'logs-*',
      title: 'logs-osquery_manager.result-*',
    } as Parameters<typeof getLensAttributes>[0];

    it('uses action_id filter and "Action ..." title when no executionCount is provided', () => {
      // `scheduleId` alone is not enough to switch branches — `executionCount`
      // gates the schedule path so we don't filter on a schedule_id that has
      // no observed docs.
      const attrs = getLensAttributes(logsDataView, 'legacy-action-id', 'some-schedule-uuid');

      expect(attrs.title).toBe('Action legacy-action-id results');
      expect(attrs.state.filters[0].meta.key).toBe('action_id');
      expect(attrs.state.filters[0].query).toEqual({
        match_phrase: { action_id: 'legacy-action-id' },
      });
      // No execution-count filter since we're on the legacy path.
      expect(attrs.state.filters).toHaveLength(1);
    });

    it('switches to schedule_id filter and adds execution-count filter when executionCount is set', () => {
      const attrs = getLensAttributes(logsDataView, 'legacy-action-id', 'sched-uuid-aaa', 7);

      expect(attrs.title).toBe('Schedule sched-uuid-aaa results');
      expect(attrs.state.filters[0].meta.key).toBe('schedule_id');
      expect(attrs.state.filters[0].query).toEqual({
        match_phrase: { schedule_id: 'sched-uuid-aaa' },
      });
      // Second filter scopes to the specific execution count.
      expect(attrs.state.filters[1].meta.key).toBe('osquery_meta.schedule_execution_count');
      expect(attrs.state.filters[1].query).toEqual({
        match_phrase: { 'osquery_meta.schedule_execution_count': 7 },
      });
    });
  });

  it('renders metric values returned by the hook in the columns', () => {
    usePackQueryLastResultsMock.mockReturnValue({
      data: {
        lastResultTime: ['2026-05-06T10:00:00.000Z'],
        uniqueAgentsCount: 5,
        docCount: 150,
        executionCount: 42,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePackQueryLastResults>);

    const data: PackQueryFormData[] = [
      {
        id: 'scheduled_query',
        query: 'SELECT 1;',
        interval: 60,
        ecs_mapping: {},
        schedule_id: 'sched-uuid-aaa',
      },
    ];

    renderWithContext(
      <PackQueriesStatusTable agentIds={['a-1']} data={data} packName="pack-name" />
    );

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  describe('Schedule column (rruleScheduling on)', () => {
    beforeAll(() => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: true },
      });
    });

    afterAll(() => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });
    });

    beforeEach(() => {
      usePackQueryLastResultsMock.mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof usePackQueryLastResults>);
      usePackQueryErrorsMock.mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof usePackQueryErrors>);
    });

    it('renders the "Schedule" column header instead of "Interval (s)"', () => {
      const data: PackQueryFormData[] = [
        { id: 'q1', query: 'SELECT 1;', interval: 3600, ecs_mapping: {} },
      ];

      renderWithContext(
        <PackQueriesStatusTable agentIds={['a-1']} data={data} packName="pack-name" />
      );

      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.queryByText('Interval (s)')).not.toBeInTheDocument();
    });

    it('renders rrule override text for a per-query rrule schedule', () => {
      const data: PackQueryFormData[] = [
        {
          id: 'q1',
          query: 'SELECT 1;',
          interval: 3600,
          ecs_mapping: {},
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=WEEKLY;BYDAY=TU',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      ];

      renderWithContext(
        <PackQueriesStatusTable agentIds={['a-1']} data={data} packName="pack-name" />
      );

      expect(screen.getByText('Every week on Tue')).toBeInTheDocument();
    });

    it('renders the inherited pack schedule for a row without an override', () => {
      const data: PackQueryFormData[] = [
        { id: 'q1', query: 'SELECT 1;', interval: 3600, ecs_mapping: {} },
      ];

      renderWithContext(
        <PackQueriesStatusTable
          agentIds={['a-1']}
          data={data}
          packName="pack-name"
          packSchedule={{
            schedule_type: 'rrule',
            rrule_schedule: {
              rrule: 'FREQ=DAILY',
              start_date: '2024-01-01T00:00:00.000Z',
            },
          }}
        />
      );

      expect(screen.getByText('Daily')).toBeInTheDocument();
    });

    it('falls back to the row interval for an inherited row when packSchedule is undefined', () => {
      // Inherited row (no per-query schedule_type) and no packSchedule prop —
      // exercises the `?? { interval: item.interval }` fallback so the column
      // still shows the query's own interval rather than blank/zero.
      const data: PackQueryFormData[] = [
        { id: 'q1', query: 'SELECT 1;', interval: 3600, ecs_mapping: {} },
      ];

      renderWithContext(
        <PackQueriesStatusTable agentIds={['a-1']} data={data} packName="pack-name" />
      );

      expect(screen.getByText('3600s')).toBeInTheDocument();
    });
  });
});
