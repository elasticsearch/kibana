/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EntityType } from '../../../../common/entity_analytics/types';
import { useCalculateEntityRiskScore } from './use_calculate_entity_risk_score';

const mockCalculateEntityRiskScoreV2 = jest.fn();
jest.mock('../api', () => ({
  useEntityAnalyticsRoutes: () => ({
    calculateEntityRiskScoreV2: mockCalculateEntityRiskScoreV2,
  }),
}));

const mockAddError = jest.fn();
jest.mock('../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: jest.fn().mockReturnValue({
    addError: () => mockAddError(),
  }),
}));

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const identifierType = EntityType.user;
const identifier = 'test-user';
const params = {
  identifierType,
  identifier,
  onSuccess: jest.fn(),
};

describe('useCalculateEntityRiskScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateEntityRiskScoreV2.mockResolvedValue({});
  });

  it('calls calculateEntityRiskScoreV2 when the callback is invoked', async () => {
    const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.calculateEntityRiskScore();
    });

    await waitFor(() =>
      expect(mockCalculateEntityRiskScoreV2).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier_type: identifierType,
          identifier,
        })
      )
    );
  });

  it('displays a toast error when the API returns an error', async () => {
    mockCalculateEntityRiskScoreV2.mockRejectedValue({});
    const { result } = renderHook(() => useCalculateEntityRiskScore(params), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.calculateEntityRiskScore();
    });

    await waitFor(() => expect(mockAddError).toHaveBeenCalled());
  });

  it('forwards entityId to the V2 API call', async () => {
    const entityId = 'test-euid';
    const { result } = renderHook(() => useCalculateEntityRiskScore({ ...params, entityId }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.calculateEntityRiskScore();
    });

    await waitFor(() =>
      expect(mockCalculateEntityRiskScoreV2).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier_type: identifierType,
          identifier,
          entity_id: entityId,
        })
      )
    );
  });
});
