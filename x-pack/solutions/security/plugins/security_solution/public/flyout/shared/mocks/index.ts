/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RiskSeverity } from '../../../../common/search_strategy';

const userRiskScore = {
  '@timestamp': '123456',
  user: {
    name: 'test',
    risk: {
      rule_risks: [],
      calculated_score_norm: 70,
      multipliers: [],
      calculated_level: RiskSeverity.High,
    },
  },
  alertsCount: 0,
  oldestAlertTimestamp: '123456',
};

export const mockRiskScoreState = {
  data: [userRiskScore],
  inspect: {
    dsl: [],
    response: [],
  },
  isInspected: false,
  refetch: () => {},
  totalCount: 0,
  hasEngineBeenInstalled: true,
  isAuthorized: true,
  isDeprecated: false,
  loading: false,
  error: undefined,
};

export const mockEntityRiskScores = {
  base: { ...mockRiskScoreState, data: [] },
  resolution: {
    state: { ...mockRiskScoreState, data: undefined },
    hasResolutionGroup: false,
    resolutionTargetEntityId: undefined,
  },
  refetch: () => {},
};
