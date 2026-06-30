/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TestProviders } from '../../../common/mock';
import { EntityType } from '../../../../common/entity_analytics/types';
import { useCalculateEntityRiskScore } from './use_calculate_entity_risk_score';
import { waitFor, renderHook, act } from '@testing-library/react';
import { RiskEngineStatusEnum } from '../../../../common/api/entity_analytics/risk_engine/engine_status_route.gen';

const enabledRiskEngineStatus = {
  risk_engine_status: RiskEngineStatusEnum.ENABLED,
};
const disabledRiskEngineStatus = {
  risk_engine_status: RiskEngineStatusEnum.DISABLED,
};

const mockUseRiskEngineStatus = jest.fn();
jest.mock('./use_risk_engine_status', () => ({
  useRiskEngineStatus: () => mockUseRiskEngineStatus(),
}));

const mockCalculateEntityRiskScore = jest.fn();
const mockCalculateEntityRiskScoreV2 = jest.fn();
jest.mock('../api', () => ({
  useEntityAnalyticsRoutes: () => ({
    calculateEntityRiskScore: mockCalculateEntityRiskScore,
    calculateEntityRiskScoreV2: mockCalculateEntityRiskScoreV2,
  }),
}));

const mockUseUiSetting = jest.fn().mockReturnValue(false);
jest.mock('../../../common/lib/kibana/kibana_react', () => ({
  ...jest.requireActual('../../../common/lib/kibana/kibana_react'),
  useUiSetting: (...args: unknown[]) => mockUseUiSetting(...args),
}));

const mockAddError = jest.fn();
jest.mock('../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: jest.fn().mockReturnValue({
    addError: () => mockAddError(),
  }),
}));

const identifierType = EntityType.user;
const identifier = 'test-user';
const params = {
  identifierType,
  identifier,
  onSuccess: jest.fn(),
};

describe('useRiskScoreData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRiskEngineStatus.mockReturnValue({ data: enabledRiskEngineStatus });
    mockCalculateEntityRiskScore.mockResolvedValue({});
    mockCalculateEntityRiskScoreV2.mockResolvedValue({});
    mockUseUiSetting.mockReturnValue(false);
  });

  it('should call calculateEntityRiskScore API when the callback function is called', async () => {
    const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
      wrapper: TestProviders,
    });

    await act(async () => {
      result.current.calculateEntityRiskScore();

      await waitFor(() =>
        expect(mockCalculateEntityRiskScore).toHaveBeenCalledWith(
          expect.objectContaining({
            identifier_type: identifierType,
            identifier,
          })
        )
      );
    });
  });

  it('should NOT call calculateEntityRiskScore API when risk engine is disabled', async () => {
    mockUseRiskEngineStatus.mockReturnValue({
      data: disabledRiskEngineStatus,
    });
    const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
      wrapper: TestProviders,
    });

    await act(async () => {
      result.current.calculateEntityRiskScore();

      await waitFor(() => expect(mockCalculateEntityRiskScore).not.toHaveBeenCalled());
    });
  });

  it('should display a toast error when the API returns an error', async () => {
    mockCalculateEntityRiskScore.mockRejectedValue({});
    const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
      wrapper: TestProviders,
    });

    await act(async () => {
      result.current.calculateEntityRiskScore();

      await waitFor(() => expect(mockAddError).toHaveBeenCalled());
    });
  });

  describe('when Entity Store V2 is enabled', () => {
    beforeEach(() => {
      mockUseUiSetting.mockReturnValue(true);
    });

    it('calls calculateEntityRiskScoreV2 instead of V1', async () => {
      const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
        wrapper: TestProviders,
      });

      await act(async () => {
        result.current.calculateEntityRiskScore();

        await waitFor(() =>
          expect(mockCalculateEntityRiskScoreV2).toHaveBeenCalledWith(
            expect.objectContaining({
              identifier_type: identifierType,
              identifier,
            })
          )
        );
      });
    });

    it('does NOT call the V1 calculateEntityRiskScore', async () => {
      const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
        wrapper: TestProviders,
      });

      await act(async () => {
        result.current.calculateEntityRiskScore();

        await waitFor(() => expect(mockCalculateEntityRiskScoreV2).toHaveBeenCalled());
        expect(mockCalculateEntityRiskScore).not.toHaveBeenCalled();
      });
    });

    it('displays a toast error when the V2 API returns an error', async () => {
      mockCalculateEntityRiskScoreV2.mockRejectedValue({});
      const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
        wrapper: TestProviders,
      });

      await act(async () => {
        result.current.calculateEntityRiskScore();

        await waitFor(() => expect(mockAddError).toHaveBeenCalled());
      });
    });
  });
});
