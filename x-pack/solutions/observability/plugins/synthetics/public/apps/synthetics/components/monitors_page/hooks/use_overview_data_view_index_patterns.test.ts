/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import {
  buildOverviewSyntheticsIndices,
  useOverviewDataViewIndexPatterns,
} from './use_overview_data_view_index_patterns';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';

const mockSettingsContext = jest.fn();
jest.mock('../../../contexts', () => ({
  useSyntheticsSettingsContext: () => mockSettingsContext(),
}));

const mockUseFetcher = jest.fn();
jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useFetcher: () => mockUseFetcher(),
}));

// Avoid pulling the real settings module (and its API/context deps) into the test.
jest.mock('../../settings/remote_clusters/hooks/use_get_ccs_settings', () => ({
  DEFAULT_CCS_SETTINGS: { useAllRemoteClusters: false, selectedRemoteClusters: [], spaces: [] },
  fetchCCSSettings: jest.fn(),
}));

describe('buildOverviewSyntheticsIndices', () => {
  it('returns the local pattern when CCS is disabled, regardless of settings', () => {
    expect(
      buildOverviewSyntheticsIndices({
        isCCSEnabled: false,
        useAllRemoteClusters: true,
        selectedRemoteClusters: ['remote-a'],
      })
    ).toEqual(SYNTHETICS_INDEX_PATTERN);
  });

  it('returns the local pattern when CCS is enabled but no remotes are selected', () => {
    expect(
      buildOverviewSyntheticsIndices({
        isCCSEnabled: true,
        useAllRemoteClusters: false,
        selectedRemoteClusters: [],
      })
    ).toEqual(SYNTHETICS_INDEX_PATTERN);
  });

  it('includes the wildcard remote pattern when "use all remote clusters" is on', () => {
    expect(
      buildOverviewSyntheticsIndices({
        isCCSEnabled: true,
        useAllRemoteClusters: true,
        selectedRemoteClusters: [],
      })
    ).toEqual(`${SYNTHETICS_INDEX_PATTERN},*:${SYNTHETICS_INDEX_PATTERN}`);
  });

  it('prefixes each selected cluster when specific clusters are selected', () => {
    expect(
      buildOverviewSyntheticsIndices({
        isCCSEnabled: true,
        useAllRemoteClusters: false,
        selectedRemoteClusters: ['remote-a', 'remote-b'],
      })
    ).toEqual(
      `${SYNTHETICS_INDEX_PATTERN},remote-a:${SYNTHETICS_INDEX_PATTERN},remote-b:${SYNTHETICS_INDEX_PATTERN}`
    );
  });
});

describe('useOverviewDataViewIndexPatterns', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the local synthetics pattern and is not loading when CCS is disabled', () => {
    mockSettingsContext.mockReturnValue({ isCCSEnabled: false });
    mockUseFetcher.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useOverviewDataViewIndexPatterns());

    expect(result.current).toEqual({
      dataTypesIndexPatterns: { synthetics: SYNTHETICS_INDEX_PATTERN },
      loading: false,
    });
  });

  it('reports loading while CCS settings are in flight', () => {
    mockSettingsContext.mockReturnValue({ isCCSEnabled: true });
    mockUseFetcher.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useOverviewDataViewIndexPatterns());

    expect(result.current.loading).toBe(true);
  });

  it('spans all remote clusters when "use all remote clusters" is enabled', () => {
    mockSettingsContext.mockReturnValue({ isCCSEnabled: true });
    mockUseFetcher.mockReturnValue({
      data: { useAllRemoteClusters: true, selectedRemoteClusters: [] },
    });

    const { result } = renderHook(() => useOverviewDataViewIndexPatterns());

    expect(result.current).toEqual({
      dataTypesIndexPatterns: {
        synthetics: `${SYNTHETICS_INDEX_PATTERN},*:${SYNTHETICS_INDEX_PATTERN}`,
      },
      loading: false,
    });
  });

  it('spans the selected remote clusters when specific clusters are configured', () => {
    mockSettingsContext.mockReturnValue({ isCCSEnabled: true });
    mockUseFetcher.mockReturnValue({
      data: { useAllRemoteClusters: false, selectedRemoteClusters: ['remote-a'] },
    });

    const { result } = renderHook(() => useOverviewDataViewIndexPatterns());

    expect(result.current).toEqual({
      dataTypesIndexPatterns: {
        synthetics: `${SYNTHETICS_INDEX_PATTERN},remote-a:${SYNTHETICS_INDEX_PATTERN}`,
      },
      loading: false,
    });
  });

  it('returns a referentially stable dataTypesIndexPatterns across renders for the same settings', () => {
    mockSettingsContext.mockReturnValue({ isCCSEnabled: true });
    mockUseFetcher.mockReturnValue({
      data: { useAllRemoteClusters: true, selectedRemoteClusters: [] },
    });

    const { result, rerender } = renderHook(() => useOverviewDataViewIndexPatterns());
    const first = result.current.dataTypesIndexPatterns;
    rerender();

    expect(result.current.dataTypesIndexPatterns).toBe(first);
  });
});
