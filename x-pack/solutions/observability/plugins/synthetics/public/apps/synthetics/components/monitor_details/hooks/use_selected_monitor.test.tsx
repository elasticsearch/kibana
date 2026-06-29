/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useSelectedMonitor } from './use_selected_monitor';
import { useExternalMonitor } from './use_external_monitor';
import { useGetUrlParams } from '../../../hooks';
import { MonitorTypeEnum } from '../../../../../../common/runtime_types';

jest.mock('react-router-dom', () => ({
  useParams: () => ({ monitorId: 'config-1' }),
}));

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: jest.fn(),
}));

jest.mock('../../../../../hooks/use_kibana_space', () => ({
  useKibanaSpace: () => ({ space: { id: 'default' } }),
}));

jest.mock('../../../contexts', () => ({
  useSyntheticsRefreshContext: () => ({ lastRefresh: 0, refreshInterval: 60 }),
}));

jest.mock('../../../state', () => ({
  getMonitorAction: { get: jest.fn((payload) => ({ type: 'MONITOR_GET', payload })) },
  selectEncryptedSyntheticsSavedMonitors: jest.fn(),
  selectMonitorListState: jest.fn(),
  selectorMonitorDetailsState: jest.fn(),
  selectSyntheticsMonitorError: jest.fn(),
}));

jest.mock('../../../hooks', () => ({
  useGetUrlParams: jest.fn(),
}));

jest.mock('./use_external_monitor', () => ({
  useExternalMonitor: jest.fn(),
}));

import { useSelector } from 'react-redux';
import {
  getMonitorAction,
  selectEncryptedSyntheticsSavedMonitors,
  selectMonitorListState,
  selectorMonitorDetailsState,
  selectSyntheticsMonitorError,
} from '../../../state';

const mockUseSelector = useSelector as unknown as jest.Mock;
const mockUseExternalMonitor = useExternalMonitor as jest.MockedFunction<typeof useExternalMonitor>;
const mockUseGetUrlParams = useGetUrlParams as jest.MockedFunction<typeof useGetUrlParams>;

interface SetupOptions {
  remoteName?: string;
  externalMonitor?: ReturnType<typeof useExternalMonitor>['data'];
  externalLoading?: boolean;
  localMonitor?: { config_id: string; name: string } | null;
  localLoading?: boolean;
  monitorListLoading?: boolean;
  localError?: { body?: { statusCode?: number }; getPayload?: unknown } | null;
}

const setupMocks = ({
  remoteName,
  externalMonitor = undefined,
  externalLoading = false,
  localMonitor = { config_id: 'config-1', name: 'Local monitor' },
  localLoading = false,
  monitorListLoading = false,
  localError = null,
}: SetupOptions) => {
  mockUseGetUrlParams.mockReturnValue({
    spaceId: undefined,
    remoteName,
  } as ReturnType<typeof useGetUrlParams>);

  mockUseExternalMonitor.mockReturnValue({
    data: externalMonitor,
    loading: externalLoading,
    error: undefined,
  });

  mockUseSelector.mockImplementation((selector: unknown) => {
    if (selector === selectEncryptedSyntheticsSavedMonitors) {
      return localMonitor ? [localMonitor] : [];
    }
    if (selector === selectMonitorListState) {
      return { loading: monitorListLoading };
    }
    if (selector === selectorMonitorDetailsState) {
      return {
        syntheticsMonitor: localMonitor,
        syntheticsMonitorLoading: localLoading,
        syntheticsMonitorDispatchedAt: 0,
      };
    }
    if (selector === selectSyntheticsMonitorError) {
      return localError;
    }
    return undefined;
  });
};

describe('useSelectedMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('local path (no remoteName in URL)', () => {
    it('returns the local saved monitor and does not probe external pings', () => {
      setupMocks({});

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.monitor).toEqual({ config_id: 'config-1', name: 'Local monitor' });
      expect(mockUseExternalMonitor).toHaveBeenCalledWith({
        configId: 'config-1',
        remoteName: undefined,
        origin: undefined,
      });
    });

    it('propagates the local error from the Redux selector', () => {
      const localError = { body: { statusCode: 500 } };
      setupMocks({ localError });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.error).toBe(localError);
    });
  });

  describe('remote path (remoteName in URL)', () => {
    const remoteMonitor = {
      config_id: 'config-1',
      id: 'config-1',
      name: 'Remote monitor',
      type: MonitorTypeEnum.BROWSER,
      tags: [],
      locations: [],
      remote: { remoteName: 'cluster-a' },
    };

    it('returns the remote monitor from useExternalMonitor instead of the local SO', () => {
      setupMocks({ remoteName: 'cluster-a', externalMonitor: remoteMonitor });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.monitor).toBe(remoteMonitor);
      expect(mockUseExternalMonitor).toHaveBeenCalledWith({
        configId: 'config-1',
        remoteName: 'cluster-a',
        origin: undefined,
      });
    });

    it('does not dispatch a local SO fetch when the URL has a remoteName', () => {
      setupMocks({ remoteName: 'cluster-a', externalMonitor: undefined, localMonitor: null });

      renderHook(() => useSelectedMonitor());

      expect(getMonitorAction.get).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('returns loading=true while useExternalMonitor is loading', () => {
      setupMocks({ remoteName: 'cluster-a', externalLoading: true });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.loading).toBe(true);
    });

    it('never reports isMonitorMissing for remote (the 404 path is local-only)', () => {
      const localError = {
        body: { statusCode: 404 },
        getPayload: () => ({ monitorId: 'config-1' }),
      };
      setupMocks({ remoteName: 'cluster-a', externalMonitor: undefined, localError });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.isMonitorMissing).toBe(false);
    });

    it('reports null error for remote (local HTTP-fetch error shape is suppressed)', () => {
      const localError = { body: { statusCode: 500 } };
      setupMocks({ remoteName: 'cluster-a', externalMonitor: undefined, localError });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.error).toBeNull();
    });
  });

  describe('heartbeat fallback (no saved object, local pings)', () => {
    const heartbeatMonitor = {
      config_id: 'config-1',
      id: 'config-1',
      name: 'Autodiscovered monitor',
      type: MonitorTypeEnum.HTTP,
      tags: [],
      locations: [],
      origin: 'heartbeat' as const,
    };

    const notFound = {
      body: { statusCode: 404 },
      getPayload: { monitorId: 'config-1' },
    };

    it('probes local pings with origin=heartbeat once the local SO 404s', () => {
      setupMocks({ localMonitor: null, localError: notFound });

      renderHook(() => useSelectedMonitor());

      expect(mockUseExternalMonitor).toHaveBeenCalledWith({
        configId: 'config-1',
        remoteName: undefined,
        origin: 'heartbeat',
      });
    });

    it('returns the synthesized heartbeat monitor instead of reporting it missing', () => {
      setupMocks({ localMonitor: null, localError: notFound, externalMonitor: heartbeatMonitor });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.monitor).toBe(heartbeatMonitor);
      expect(result.current.isMonitorMissing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('holds off on isMonitorMissing while the heartbeat probe is loading', () => {
      setupMocks({
        localMonitor: null,
        localError: notFound,
        externalMonitor: undefined,
        externalLoading: true,
      });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.isMonitorMissing).toBe(false);
    });

    it('reports isMonitorMissing only after the heartbeat probe finds no pings', () => {
      setupMocks({
        localMonitor: null,
        localError: notFound,
        externalMonitor: undefined,
        externalLoading: false,
      });

      const { result } = renderHook(() => useSelectedMonitor());

      expect(result.current.isMonitorMissing).toBe(true);
    });
  });
});
