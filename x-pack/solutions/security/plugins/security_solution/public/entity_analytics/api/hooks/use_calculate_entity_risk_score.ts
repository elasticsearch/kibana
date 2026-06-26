/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';

import type { EntityType } from '../../../../common/entity_analytics/types';

// Manual entity risk score recalculation is a no-op while we wait for the v2
// equivalent — see https://github.com/elastic/security-team/issues/16756
export const useCalculateEntityRiskScore = (
  _identifierType: EntityType,
  _identifier: string,
  _options: { onSuccess: () => void }
) => {
  const calculateEntityRiskScoreCb = useCallback(async () => {}, []);

  return {
    isLoading: false,
    calculateEntityRiskScore: calculateEntityRiskScoreCb,
    data: undefined,
  };
};
