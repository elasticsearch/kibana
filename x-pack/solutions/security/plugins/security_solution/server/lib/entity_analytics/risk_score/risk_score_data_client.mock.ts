/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RiskScoreDataClient } from './risk_score_data_client';

const createRiskScoreDataClientMock = () =>
  ({
    getWriter: jest.fn().mockResolvedValue({ bulk: jest.fn().mockResolvedValue({ errors: [] }) }),
    init: jest.fn(),
    initLegacyTransforms: jest.fn(),
    tearDown: jest.fn(),
    getRiskInputsIndex: jest.fn(),
    upgradeIfNeeded: jest.fn(),
    getRiskScoreHistory: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<RiskScoreDataClient>);

export const riskScoreDataClientMock = { create: createRiskScoreDataClientMock };
