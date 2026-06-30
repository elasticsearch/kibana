/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { FilterStateStore } from '@kbn/es-query';
import { useKibana } from '../../../common/lib/kibana';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { useInvestigateInTimeline } from '../../../common/hooks/timeline/use_investigate_in_timeline';
import { useAnomalySingleMetricViewerUrl } from './use_anomaly_single_metric_viewer_url';
import { useAnomalyTableRowActions } from './use_anomaly_table_row_actions';
import type { TableRow } from '../../components/anomalies/table/types';

jest.mock('../../../common/lib/kibana', () => ({ useKibana: jest.fn() }));
jest.mock('../../../common/components/user_privileges', () => ({
  useUserPrivileges: jest.fn(),
}));
jest.mock('../../../common/hooks/timeline/use_investigate_in_timeline', () => ({
  useInvestigateInTimeline: jest.fn(),
}));
jest.mock('./use_anomaly_single_metric_viewer_url', () => ({
  useAnomalySingleMetricViewerUrl: jest.fn(),
}));

const mockUseKibana = useKibana as jest.Mock;
const mockUseUserPrivileges = useUserPrivileges as jest.Mock;
const mockUseInvestigateInTimeline = useInvestigateInTimeline as jest.Mock;
const mockUseAnomalySingleMetricViewerUrl = useAnomalySingleMetricViewerUrl as jest.Mock;

const mockAnomalySearch = jest.fn();
const mockJobsFn = jest.fn();
const mockGetRedirectUrl = jest.fn();
const mockDataViewsFind = jest.fn();
const mockInvestigateInTimeline = jest.fn();
const mockGetUrl = jest.fn();
const mockClosePopover = jest.fn();

const mockAnomalyRecord = {
  job_id: 'test-job',
  detector_index: 0,
  timestamp: 1700000000000,
  bucket_span: 900,
  influencers: [
    { influencer_field_name: 'host.name', influencer_field_values: ['web-001'] },
    {
      influencer_field_name: 'process.name',
      influencer_field_values: ['cmd.exe', 'powershell.exe'],
    },
  ],
};

const mockJob = {
  datafeed_config: {
    query: { term: { 'event.category': 'process' } },
    indices: ['logs-*'],
  },
};

const mockDataView = {
  id: 'data-view-id-1',
  getIndexPattern: () => 'logs-*',
};

const mockRow: TableRow = {
  id: 'row-1',
  jobId: 'test-job',
  jobDisplayName: 'Test Job',
  recordId: 'record-123',
  mitreTactics: [],
  timestamp: 1700000000000,
  detectorIndex: 0,
  baseline: '',
  anomaly: '',
  anomalyScore: 75,
  description: '',
  anomalyCount: 1,
  keyFields: [],
};

const mockTimeRange = { from: '2023-11-01T00:00:00.000Z', to: '2023-11-30T00:00:00.000Z' };

const defaultArgs = {
  row: mockRow,
  timeRange: mockTimeRange,
  closePopover: mockClosePopover,
};

const EXPECTED_KQL =
  '"host.name":"web-001" AND ("process.name":"cmd.exe" OR "process.name":"powershell.exe")';
const EXPECTED_FROM = new Date(mockAnomalyRecord.timestamp - 3600 * 1000).toISOString();
const EXPECTED_TO = new Date(
  mockAnomalyRecord.timestamp + mockAnomalyRecord.bucket_span * 1000
).toISOString();

const renderActions = () => renderHook(() => useAnomalyTableRowActions(defaultArgs));

beforeEach(() => {
  jest.clearAllMocks();

  mockUseKibana.mockReturnValue({
    services: {
      ml: {
        mlApi: {
          results: { anomalySearch: mockAnomalySearch },
          jobs: { jobs: mockJobsFn },
        },
        locator: { getUrl: jest.fn() },
      },
      share: {
        url: {
          locators: {
            get: (id: string) =>
              id === 'DISCOVER_APP_LOCATOR' ? { getRedirectUrl: mockGetRedirectUrl } : undefined,
          },
        },
      },
      data: {
        dataViews: { find: mockDataViewsFind },
      },
    },
  });

  mockUseUserPrivileges.mockReturnValue({ timelinePrivileges: { read: true } });
  mockUseInvestigateInTimeline.mockReturnValue({
    investigateInTimeline: mockInvestigateInTimeline,
  });
  mockUseAnomalySingleMetricViewerUrl.mockReturnValue(mockGetUrl);

  mockAnomalySearch.mockResolvedValue({
    hits: { hits: [{ _source: mockAnomalyRecord }] },
  });
  mockJobsFn.mockResolvedValue([mockJob]);
  mockDataViewsFind.mockResolvedValue([mockDataView]);
  mockGetRedirectUrl.mockReturnValue('https://kibana/app/discover#/view');
  mockGetUrl.mockResolvedValue('https://kibana/app/ml#/timeseriesexplorer');

  jest.spyOn(window, 'open').mockImplementation(() => null);
});

describe('useAnomalyTableRowActions', () => {
  describe('actions list', () => {
    it('includes all three actions when canReadTimeline and ML are available', () => {
      const { result } = renderActions();
      const keys = result.current.actions.map((a) => a.key);
      expect(keys).toEqual(['add-to-timeline', 'view-in-discover', 'view-in-single-metric-viewer']);
    });

    it('excludes add-to-timeline when canReadTimeline is false', () => {
      mockUseUserPrivileges.mockReturnValue({ timelinePrivileges: { read: false } });
      const { result } = renderActions();
      const keys = result.current.actions.map((a) => a.key);
      expect(keys).not.toContain('add-to-timeline');
      expect(keys).toContain('view-in-discover');
    });

    it('excludes view-in-single-metric-viewer when ML locator is unavailable', () => {
      mockUseAnomalySingleMetricViewerUrl.mockReturnValue(undefined);
      const { result } = renderActions();
      const keys = result.current.actions.map((a) => a.key);
      expect(keys).not.toContain('view-in-single-metric-viewer');
      expect(keys).toContain('view-in-discover');
    });
  });

  describe('handleAddToTimeline', () => {
    it('calls investigateInTimeline with KQL from influencers, time range, and datafeed filter', async () => {
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'add-to-timeline')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(mockInvestigateInTimeline).toHaveBeenCalled());
      });

      expect(mockInvestigateInTimeline).toHaveBeenCalledWith({
        query: { language: 'kuery', query: EXPECTED_KQL },
        timeRange: { kind: 'absolute', from: EXPECTED_FROM, to: EXPECTED_TO },
        filters: [
          expect.objectContaining({
            meta: expect.objectContaining({
              alias: mockRow.jobId,
              isMultiIndex: true,
              type: 'custom',
            }),
            query: mockJob.datafeed_config.query,
            $state: { store: FilterStateStore.APP_STATE },
          }),
        ],
      });
    });

    it('passes no filters when datafeed query is a known empty match_all', async () => {
      mockJobsFn.mockResolvedValue([
        { datafeed_config: { query: { match_all: {} }, indices: ['logs-*'] } },
      ]);
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'add-to-timeline')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(mockInvestigateInTimeline).toHaveBeenCalled());
      });

      expect(mockInvestigateInTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ filters: [] })
      );
    });
  });

  describe('handleViewInDiscover', () => {
    it('opens Discover with correct KQL, time range, and datafeed filter including indexPatternId', async () => {
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'view-in-discover')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(window.open).toHaveBeenCalled());
      });

      expect(mockGetRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { language: 'kuery', query: EXPECTED_KQL },
          timeRange: { from: EXPECTED_FROM, to: EXPECTED_TO, mode: 'absolute' },
          filters: [
            expect.objectContaining({
              meta: expect.objectContaining({
                alias: mockRow.jobId,
                index: mockDataView.id,
                type: 'custom',
              }),
              query: mockJob.datafeed_config.query,
            }),
          ],
        })
      );
      expect(window.open).toHaveBeenCalledWith(
        'https://kibana/app/discover#/view',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('passes no filters when datafeed query is a known empty match_all', async () => {
      mockJobsFn.mockResolvedValue([
        { datafeed_config: { query: { match_all: {} }, indices: ['logs-*'] } },
      ]);
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'view-in-discover')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(mockGetRedirectUrl).toHaveBeenCalled());
      });

      expect(mockGetRedirectUrl).toHaveBeenCalledWith(expect.objectContaining({ filters: [] }));
    });
  });

  describe('handleViewInSingleMetricViewer', () => {
    it('calls getUrl with the fetched record and opens the returned URL', async () => {
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'view-in-single-metric-viewer')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(window.open).toHaveBeenCalled());
      });

      expect(mockGetUrl).toHaveBeenCalledWith(mockAnomalyRecord);
      expect(window.open).toHaveBeenCalledWith(
        'https://kibana/app/ml#/timeseriesexplorer',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('caching', () => {
    it('calls anomalySearch only once when multiple actions are clicked', async () => {
      const { result } = renderActions();
      const discoverAction = result.current.actions.find((a) => a.key === 'view-in-discover')!;
      const timelineAction = result.current.actions.find((a) => a.key === 'add-to-timeline')!;
      const smvAction = result.current.actions.find(
        (a) => a.key === 'view-in-single-metric-viewer'
      )!;

      await act(async () => {
        discoverAction.onClick();
        timelineAction.onClick();
        smvAction.onClick();
        await waitFor(() => expect(mockAnomalySearch).toHaveBeenCalledTimes(1));
      });

      expect(mockAnomalySearch).toHaveBeenCalledTimes(1);
    });

    it('calls jobs.jobs only once when both discover and timeline actions are clicked', async () => {
      const { result } = renderActions();
      const discoverAction = result.current.actions.find((a) => a.key === 'view-in-discover')!;
      const timelineAction = result.current.actions.find((a) => a.key === 'add-to-timeline')!;

      await act(async () => {
        discoverAction.onClick();
        timelineAction.onClick();
        await waitFor(() => expect(mockJobsFn).toHaveBeenCalledTimes(1));
      });

      expect(mockJobsFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry after fetch failure', () => {
    it('retries anomalySearch after a failed fetch', async () => {
      mockAnomalySearch.mockRejectedValueOnce(new Error('network error'));
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'view-in-single-metric-viewer')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(mockAnomalySearch).toHaveBeenCalledTimes(1));
      });
      expect(window.open).not.toHaveBeenCalled();

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(window.open).toHaveBeenCalled());
      });
      expect(mockAnomalySearch).toHaveBeenCalledTimes(2);
    });

    it('retries jobs.jobs after a failed fetch', async () => {
      mockJobsFn.mockRejectedValueOnce(new Error('network error'));
      const { result } = renderActions();
      const action = result.current.actions.find((a) => a.key === 'view-in-discover')!;

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
      });
      expect(mockJobsFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        action.onClick();
        await waitFor(() => expect(window.open).toHaveBeenCalledTimes(2));
      });
      expect(mockJobsFn).toHaveBeenCalledTimes(2);
    });
  });
});
