/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { PublicMethodsOf } from '@kbn/utility-types';
import { FakeLLM } from '@langchain/core/utils/testing';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
import type { RuleMigrationTelemetryClient } from '../rule_migrations_telemetry_client';
import type { BaseLLMParams } from '@langchain/core/language_models/llms';

export const createSiemMigrationTelemetryClientMock = () => {
  // Mock for the object returned by startSiemMigrationTask
  const mockStartRuleTranslationReturn = {
    success: jest.fn(),
    failure: jest.fn(),
  };

  // Mock for the function returned by startSiemMigrationTask
  const mockStartRuleTranslation = jest.fn().mockReturnValue(mockStartRuleTranslationReturn);

  // Mock for startSiemMigrationTask return value
  const mockStartSiemMigrationTaskReturn = {
    startItemTranslation: mockStartRuleTranslation,
    success: jest.fn(),
    failure: jest.fn(),
    aborted: jest.fn(),
  };

  return {
    reportSourceQueryKeywords: jest.fn(),
    reportIntegrationsMatch: jest.fn(),
    reportPrebuiltRulesMatch: jest.fn(),
    startSiemMigrationTask: jest.fn().mockReturnValue(mockStartSiemMigrationTaskReturn),
  } as jest.Mocked<PublicMethodsOf<RuleMigrationTelemetryClient>>;
};

// Factory function for the mock class
export const MockSiemMigrationTelemetryClient = jest
  .fn()
  .mockImplementation(() => createSiemMigrationTelemetryClientMock());

export const createRuleMigrationsTaskClientMock = () => ({
  start: jest.fn().mockResolvedValue({ started: true }),
  stop: jest.fn().mockResolvedValue({ stopped: true }),
  getStats: jest.fn().mockResolvedValue({
    status: 'done',
    items: {
      total: 1,
      finished: 1,
      processing: 0,
      pending: 0,
      failed: 0,
    },
  }),
  getAllStats: jest.fn().mockResolvedValue([]),
});

export const MockRuleMigrationsTaskClient = jest
  .fn()
  .mockImplementation(() => createRuleMigrationsTaskClientMock());

// Rule migrations task service
export const mockStopAll = jest.fn();
export const mockCreateClient = jest.fn(() => createRuleMigrationsTaskClientMock());

export const MockRuleMigrationsTaskService = jest.fn().mockImplementation(() => ({
  createClient: mockCreateClient,
  stopAll: mockStopAll,
}));

export interface NodeResponse {
  nodeId: string;
  response: string;
}

interface SiemMigrationFakeLLMParams extends BaseLLMParams {
  nodeResponses: NodeResponse[];
}

export class SiemMigrationFakeLLM extends FakeLLM {
  private nodeResponses: NodeResponse[];
  private defaultResponse: string;
  private callCount: Map<string, number>;
  private totalCount: number;

  constructor(fields: SiemMigrationFakeLLMParams) {
    super({
      response: 'unexpected node call',
      ...fields,
    });
    this.nodeResponses = fields.nodeResponses;
    this.defaultResponse = 'unexpected node call';
    this.callCount = new Map();
    this.totalCount = 0;
  }

  _llmType(): string {
    return 'fake';
  }

  async _call(prompt: string, _options: this['ParsedCallOptions']): Promise<string> {
    // Get the current runnable config metadata
    const item = AsyncLocalStorageProviderSingleton.getRunnableConfig();
    for (const nodeResponse of this.nodeResponses) {
      if (item.metadata.langgraph_node === nodeResponse.nodeId) {
        const currentCount = this.callCount.get(nodeResponse.nodeId) || 0;
        this.callCount.set(nodeResponse.nodeId, currentCount + 1);
        this.totalCount += 1;
        return nodeResponse.response;
      }
    }
    return this.defaultResponse;
  }

  bindTools(): typeof this {
    return this;
  }

  getNodeCallCount(nodeId: string): number {
    return this.callCount.get(nodeId) || 0;
  }

  getTotalCallCount(): number {
    return this.totalCount;
  }

  resetCallCounts(): void {
    this.callCount.clear();
  }
}
