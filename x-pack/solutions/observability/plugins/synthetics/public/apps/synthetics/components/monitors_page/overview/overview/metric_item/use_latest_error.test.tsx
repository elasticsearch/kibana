/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import * as observabilitySharedPublic from '@kbn/observability-shared-plugin/public';
import { useLatestError } from './use_latest_error';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../../../common/constants';
import type { OverviewStatusMetaData, Ping } from '../../../../../../../../common/runtime_types';
import {
  getMonitorLastErrorRunAction,
  selectErrorPopoverState,
  selectLastErrorRunMetadata,
} from '../../../../../state';

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useEsSearch: jest.fn().mockReturnValue({ data: undefined, loading: false, error: undefined }),
}));

jest.mock('../../../../../contexts', () => ({
  useSyntheticsRefreshContext: () => ({ lastRefresh: 0 }),
}));

const mockDispatch = jest.fn();
const mockSelectorReturns = new Map<unknown, unknown>();
jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    // Match by selector reference so the test stays decoupled from
    // `createSelector` implementation details (e.g. fn.name).
    useSelector: (selector: unknown) => mockSelectorReturns.get(selector),
  };
});

const useEsSearchMock = observabilitySharedPublic.useEsSearch as jest.Mock;

const baseMonitor = {
  configId: 'cfg-1',
  monitorQueryId: 'cfg-1',
  name: 'My Monitor',
  type: 'http',
  schedule: '1',
  isEnabled: true,
  isStatusAlertEnabled: false,
  tags: [],
  locations: [{ id: 'us-east', label: 'US East', status: 'down' }],
  overallStatus: 'down',
} as unknown as OverviewStatusMetaData;

const remoteMonitor = {
  ...baseMonitor,
  remote: { remoteName: 'remote-a' },
} as unknown as OverviewStatusMetaData;

const setSelectorState = ({
  popoverOpenForCfg = null,
  lastErrorRun = { data: undefined, loading: false },
}: {
  popoverOpenForCfg?: string | null;
  lastErrorRun?: { data?: Ping; loading: boolean };
}) => {
  mockSelectorReturns.set(selectErrorPopoverState, popoverOpenForCfg);
  mockSelectorReturns.set(selectLastErrorRunMetadata, lastErrorRun);
};

describe('useLatestError', () => {
  beforeEach(() => {
    mockSelectorReturns.clear();
    setSelectorState({});
    useEsSearchMock.mockReturnValue({ data: undefined, loading: false, error: undefined });
  });

  afterEach(() => jest.clearAllMocks());

  describe('local monitors', () => {
    it('dispatches getMonitorLastErrorRunAction when the popover is open for this monitor', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });

      renderHook(() =>
        useLatestError({ monitor: baseMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      const dispatched = mockDispatch.mock.calls[0][0];
      expect(dispatched.type).toBe(getMonitorLastErrorRunAction.get.type);
      expect(dispatched.payload).toEqual({ monitorId: 'cfg-1', locationLabel: 'US East' });
    });

    it('does NOT dispatch when the popover is open for a different monitor', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-other-us-east' });

      renderHook(() =>
        useLatestError({ monitor: baseMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does NOT issue a remote CCS request', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });

      renderHook(() =>
        useLatestError({ monitor: baseMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: '' }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('returns the redux-backed latestPing and loading flag', () => {
      const ping = { monitor: { id: 'cfg-1' } } as unknown as Ping;
      setSelectorState({
        popoverOpenForCfg: 'cfg-1-us-east',
        lastErrorRun: { data: ping, loading: false },
      });

      const { result } = renderHook(() =>
        useLatestError({ monitor: baseMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(result.current.latestPing).toBe(ping);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('remote (CCS) monitors', () => {
    it('does NOT dispatch the local SO-backed action', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });

      renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('queries the CCS-prefixed synthetics index pattern when the popover is open', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });

      renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: `remote-a:${SYNTHETICS_INDEX_PATTERN}` }),
        expect.any(Array),
        expect.objectContaining({ name: 'getRemoteMonitorLatestError' })
      );
    });

    it('filters by monitor.id, observer.geo.name, summary existence, and a 30d range; sorts by @timestamp desc', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });

      renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      const params = useEsSearchMock.mock.calls[0][0];
      expect(params.query.bool.filter).toEqual([
        { term: { 'monitor.id': 'cfg-1' } },
        { term: { 'observer.geo.name': 'US East' } },
        { exists: { field: 'summary' } },
        { range: { '@timestamp': { gte: 'now-30d', lte: 'now' } } },
      ]);
      expect(params.sort).toEqual([{ '@timestamp': 'desc' }]);
      expect(params.size).toBe(1);
    });

    it('does NOT issue the CCS request while the popover is closed (index empty)', () => {
      setSelectorState({ popoverOpenForCfg: null });

      renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: '' }),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('returns the latest ping from the remote ES result', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });
      const ping = {
        monitor: { id: 'cfg-1' },
        state: { id: 'state-xyz' },
        url: { full: 'https://example.com' },
        error: { message: 'page.goto: net::ERR_NAME_NOT_RESOLVED' },
      } as unknown as Ping;
      useEsSearchMock.mockReturnValue({
        data: { hits: { hits: [{ _source: ping }] } },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(result.current.latestPing).toBe(ping);
      expect(result.current.loading).toBe(false);
    });

    it('propagates loading=true from useEsSearch when the popover is open', () => {
      setSelectorState({ popoverOpenForCfg: 'cfg-1-us-east' });
      useEsSearchMock.mockReturnValue({ data: undefined, loading: true, error: undefined });

      const { result } = renderHook(() =>
        useLatestError({ monitor: remoteMonitor, configIdByLocation: 'cfg-1-us-east' })
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.latestPing).toBeUndefined();
    });
  });
});
