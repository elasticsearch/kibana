/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { DASHBOARD_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { useDashboardArtifacts } from './use_dashboard_artifacts';

const mockResolveDashboardsByIds = jest.fn();
jest.mock('@kbn/alerting-v2-rule-form', () => ({
  resolveDashboardsByIds: (...args: unknown[]) => mockResolveDashboardsByIds(...args),
}));

const mockDashboard = {} as DashboardStart;

const dashboardArtifacts = [
  { id: 'artifact-1', type: DASHBOARD_ARTIFACT_TYPE, value: 'dash-1' },
  { id: 'artifact-2', type: 'runbook', value: 'runbook-content' },
];

describe('useDashboardArtifacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveDashboardsByIds.mockResolvedValue({
      resolved: [{ id: 'dash-1', title: 'Ops Dashboard' }],
      missing: [],
    });
  });

  it('skips re-fetch when dashboard ids have not changed', async () => {
    const { rerender } = renderHook(
      ({ artifacts }) => useDashboardArtifacts(artifacts, mockDashboard),
      { initialProps: { artifacts: dashboardArtifacts } }
    );

    await waitFor(() => {
      expect(mockResolveDashboardsByIds).toHaveBeenCalledTimes(1);
    });

    rerender({
      artifacts: [
        { id: 'artifact-1', type: DASHBOARD_ARTIFACT_TYPE, value: 'dash-1' },
        { id: 'artifact-2', type: 'runbook', value: 'updated-runbook' },
      ],
    });

    await waitFor(() => {
      expect(mockResolveDashboardsByIds).toHaveBeenCalledTimes(1);
    });
  });

  it('abandons inflight fetch on unmount', async () => {
    let resolveFetch: (value: {
      resolved: Array<{ id: string; title: string }>;
      missing: [];
    }) => void = () => {};
    mockResolveDashboardsByIds.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { unmount } = renderHook(() => useDashboardArtifacts(dashboardArtifacts, mockDashboard));

    unmount();

    resolveFetch({
      resolved: [{ id: 'dash-1', title: 'Ops Dashboard' }],
      missing: [],
    });

    await Promise.resolve();
  });

  it('resets to empty when dashboard ids become empty', async () => {
    const { result, rerender } = renderHook(
      ({ artifacts }) => useDashboardArtifacts(artifacts, mockDashboard),
      { initialProps: { artifacts: dashboardArtifacts } }
    );

    await waitFor(() => {
      expect(result.current.resolved).toEqual([{ id: 'dash-1', title: 'Ops Dashboard' }]);
    });

    rerender({ artifacts: [{ id: 'artifact-2', type: 'runbook', value: 'runbook-content' }] });

    await waitFor(() => {
      expect(result.current.resolved).toEqual([]);
      expect(result.current.missing).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });
    expect(mockResolveDashboardsByIds).toHaveBeenCalledTimes(1);
  });

  it('collapses duplicate dashboard artifact ids to the last artifact id', async () => {
    const duplicateArtifacts = [
      { id: 'artifact-first', type: DASHBOARD_ARTIFACT_TYPE, value: 'dash-1' },
      { id: 'artifact-last', type: DASHBOARD_ARTIFACT_TYPE, value: 'dash-1' },
    ];

    const { result } = renderHook(() => useDashboardArtifacts(duplicateArtifacts, mockDashboard));

    await waitFor(() => {
      expect(result.current.artifactIdByDashboardId.get('dash-1')).toBe('artifact-last');
    });
  });

  it('does not resolve dashboards when the dashboard service is unavailable', () => {
    const { result } = renderHook(() => useDashboardArtifacts(dashboardArtifacts, undefined));

    expect(mockResolveDashboardsByIds).not.toHaveBeenCalled();
    expect(result.current.resolved).toEqual([]);
    expect(result.current.missing).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
