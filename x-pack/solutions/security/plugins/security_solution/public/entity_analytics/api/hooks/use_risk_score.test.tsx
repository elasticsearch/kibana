/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, renderHook } from '@testing-library/react';
import { useRiskScore } from './use_risk_score';
import { TestProviders } from '../../../common/mock';
import { useSearchStrategy } from '../../../common/containers/use_search_strategy';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useAppToastsMock } from '../../../common/hooks/use_app_toasts.mock';
import { EntityType } from '../../../../common/search_strategy';
import { useRiskEngineStatus } from './use_risk_engine_status';
import { useLicense } from '../../../common/hooks/use_license';
import type { RiskEngineStatusResponse } from '../../../../common/api/entity_analytics';
import { EntityRiskQueries } from '../../../../common/api/search_strategy';
jest.mock('../../../common/hooks/use_license');

jest.mock('../../../helper_hooks', () => ({
  useHasSecurityCapability: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../common/containers/use_search_strategy', () => ({
  useSearchStrategy: jest.fn(),
}));

jest.mock('../../../common/hooks/use_space_id', () => ({
  useSpaceId: jest.fn().mockReturnValue('default'),
}));

jest.mock('../../../common/hooks/use_app_toasts');
jest.mock('./use_risk_engine_status', () => ({
  useRiskEngineStatus: jest.fn(),
}));

const mockUseLicense = useLicense as jest.Mock;
const mockUseSearchStrategy = useSearchStrategy as jest.Mock;
const mockUseRiskEngineStatus = useRiskEngineStatus as jest.Mock;
const mockSearch = jest.fn();

let appToastsMock: jest.Mocked<ReturnType<typeof useAppToastsMock.create>>;

const defaultRisk = {
  data: undefined,
  error: undefined,
  inspect: {},
  isInspected: false,
  isAuthorized: true,
  hasEngineBeenInstalled: false,
  totalCount: 0,
};

const defaultSearchResponse = {
  loading: false,
  result: {
    data: undefined,
    totalCount: 0,
  },
  search: mockSearch,
  refetch: () => {},
  inspect: {},
  error: undefined,
};

const makeLicenseInvalid = () => {
  mockUseLicense.mockClear();
  mockUseLicense.mockReturnValue({
    isPlatinumPlus: () => false,
  });
};

const mockRiskEngineStatus = (status: RiskEngineStatusResponse['risk_engine_status']) => {
  mockUseRiskEngineStatus.mockClear();
  mockUseRiskEngineStatus.mockReturnValue({
    data: {
      risk_engine_status: status,
      risk_engine_task_status: { status: 'idle', runAt: '2021-09-29T15:00:00Z' },
    } as RiskEngineStatusResponse,
    isLoading: false,
    isFetching: false,
  });
};
describe.each([EntityType.host, EntityType.user])('useRiskScore entityType: %s', (riskEntity) => {
  beforeEach(() => {
    jest.clearAllMocks();
    appToastsMock = useAppToastsMock.create();
    (useAppToasts as jest.Mock).mockReturnValue(appToastsMock);
    mockUseSearchStrategy.mockReturnValue(defaultSearchResponse);
    mockUseLicense.mockReturnValue({
      isPlatinumPlus: () => true,
    });
  });

  test('does not search if license is not valid', () => {
    makeLicenseInvalid();
    mockRiskEngineStatus('ENABLED');

    const { result } = renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      loading: false,
      ...defaultRisk,
      hasEngineBeenInstalled: true,
      isAuthorized: false,
      refetch: result.current.refetch,
    });
  });
  test('does not search if engine is not installed', () => {
    mockRiskEngineStatus('NOT_INSTALLED');
    const { result } = renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      loading: false,
      ...defaultRisk,
      refetch: result.current.refetch,
    });
  });

  test('handle index not found error', () => {
    mockRiskEngineStatus('ENABLED');
    mockUseSearchStrategy.mockReturnValue({
      ...defaultSearchResponse,
      error: {
        attributes: {
          caused_by: {
            type: 'index_not_found_exception',
          },
        },
      },
    });
    const { result } = renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    expect(result.current).toEqual({
      loading: false,
      ...defaultRisk,
      hasEngineBeenInstalled: true,
      refetch: result.current.refetch,
      error: {
        attributes: {
          caused_by: {
            type: 'index_not_found_exception',
          },
        },
      },
    });
  });

  test('show error toast', () => {
    mockRiskEngineStatus('ENABLED');
    const error = new Error();
    mockUseSearchStrategy.mockReturnValue({
      ...defaultSearchResponse,
      error,
    });
    renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    expect(appToastsMock.addError).toHaveBeenCalledWith(error, {
      title: 'Failed to run search on risk score',
    });
  });

  test('runs search if engine is enabled', () => {
    mockRiskEngineStatus('ENABLED');
    renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith({
      defaultIndex: [`risk-score.risk-score-latest-default`],
      factoryQueryType: EntityRiskQueries.list,
      riskScoreEntity: riskEntity,
      includeAlertsCount: false,
    });
  });

  test('returns result', async () => {
    mockRiskEngineStatus('ENABLED');

    mockUseSearchStrategy.mockReturnValue({
      ...defaultSearchResponse,
      result: {
        data: [],
        totalCount: 0,
      },
    });
    const { result } = renderHook(() => useRiskScore({ riskEntity }), {
      wrapper: TestProviders,
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        loading: false,
        ...defaultRisk,
        hasEngineBeenInstalled: true,
        data: [],
        refetch: result.current.refetch,
      });
    });
  });
});
