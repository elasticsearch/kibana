/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import { EntityType } from '../../../../common/entity_analytics/types';
import { useCalculateEntityRiskScore } from './use_calculate_entity_risk_score';

describe('useCalculateEntityRiskScore', () => {
  it('returns a no-op callback while v2 manual recalculation is unsupported', async () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() =>
      useCalculateEntityRiskScore(EntityType.user, 'test-user', { onSuccess })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      await result.current.calculateEntityRiskScore();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
