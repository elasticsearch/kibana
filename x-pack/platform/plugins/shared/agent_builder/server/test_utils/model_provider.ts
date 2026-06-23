/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelProvider } from '@kbn/agent-builder-server';
import type { ModelProviderFactoryFn } from '../services/execution/runner/model_provider';
import type { ChangeReturnType } from './common';

export type ModelProviderMock = jest.Mocked<ModelProvider>;
export type ModelProviderFactoryMock = jest.MockedFn<
  ChangeReturnType<ModelProviderFactoryFn, ModelProviderMock>
>;

export const createModelProviderMock = (): ModelProviderMock => {
  const chatModel = { getConnector: jest.fn().mockReturnValue({ connectorId: 'mock-connector' }) };
  return {
    getDefaultModel: jest.fn().mockResolvedValue({ chatModel }),
    selectModel: jest.fn(),
    getModelById: jest.fn(),
    getUsageStats: jest.fn().mockReturnValue({ calls: [] }),
  };
};

export const createModelProviderFactoryMock = (): ModelProviderFactoryMock => {
  return jest.fn().mockImplementation(() => createModelProviderMock());
};
