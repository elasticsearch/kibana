/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RuleMigrationTaskRunner } from './rule_migrations_task_runner';
import type { AuthenticatedUser, KibanaRequest } from '@kbn/core/server';
import type { SiemMigrationsClientDependencies } from '../../common/types';
import { createRuleMigrationsDataClientMock } from '../data/__mocks__/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { inferenceMock } from '@kbn/inference-plugin/server/mocks';

jest.mock('./rule_migrations_telemetry_client');

const mockRetrieverInitialize = jest.fn().mockResolvedValue(undefined);
const mockGetResources = jest.fn().mockResolvedValue({});
jest.mock('./retrievers', () => ({
  ...jest.requireActual('./retrievers'),
  RuleMigrationsRetriever: jest.fn().mockImplementation(() => ({
    initialize: mockRetrieverInitialize,
    resources: {
      getResources: mockGetResources,
    },
  })),
}));

const mockCreateModel = jest.fn(() => ({ model: 'test-model', bindTools: jest.fn() }));
const mockGetModelName = jest.fn(() => 'test-model');
jest.mock('../../common/task/util/actions_client_chat', () => ({
  ...jest.requireActual('../../common/task/util/actions_client_chat'),
  ActionsClientChat: jest
    .fn()
    .mockImplementation(() => ({ createModel: mockCreateModel, getModelName: mockGetModelName })),
}));

const mockInvoke = jest.fn().mockResolvedValue({});
const mockGetRuleMigrationAgent = jest.fn(() => ({ invoke: mockInvoke }));
const mockInvokeV2 = jest.fn().mockResolvedValue({});
const mockGetRuleMigrationAgentV2 = jest.fn(() => ({ invoke: mockInvokeV2 }));
jest.mock('./agent', () => ({
  ...jest.requireActual('./agent'),
  getRuleMigrationAgent: () => mockGetRuleMigrationAgent(),
  getRuleMigrationAgentV2: () => mockGetRuleMigrationAgentV2(),
}));

// Mock dependencies
const mockLogger = loggerMock.create();
const inferenceService = inferenceMock.createStartContract();

const mockDependencies: jest.Mocked<SiemMigrationsClientDependencies> = {
  rulesClient: {},
  savedObjectsClient: {},
  inferenceService,
  actionsClient: {},
  telemetry: {},
  experimentalFeatures: { ruleMigrationGraphv2: false },
} as unknown as SiemMigrationsClientDependencies;

const mockRequest = {} as unknown as KibanaRequest;
const mockUser = {} as unknown as AuthenticatedUser;

jest.useFakeTimers();
jest.spyOn(global, 'setTimeout');
const mockTimeout = setTimeout as unknown as jest.Mock;
mockTimeout.mockImplementation((cb) => {
  // never actually wait, we'll check the calls manually
  cb();
});

describe('RuleMigrationTaskRunner', () => {
  let taskRunner: RuleMigrationTaskRunner;
  let abortController: AbortController;
  let mockRuleMigrationsDataClient: ReturnType<typeof createRuleMigrationsDataClientMock>;

  beforeEach(() => {
    mockRetrieverInitialize.mockResolvedValue(undefined); // Reset the mock
    mockGetResources.mockResolvedValue({}); // Reset the mock
    mockInvoke.mockResolvedValue({}); // Reset the mock
    mockRuleMigrationsDataClient = createRuleMigrationsDataClientMock();
    jest.clearAllMocks();

    abortController = new AbortController();
    taskRunner = new RuleMigrationTaskRunner(
      'test-migration-id',
      'splunk',
      mockRequest,
      mockUser,
      abortController,
      mockRuleMigrationsDataClient,
      mockLogger,
      mockDependencies
    );
  });

  describe('setup', () => {
    it('should create the agent and tools', async () => {
      await expect(taskRunner.setup('test-connector-id')).resolves.toBeUndefined();
      // @ts-expect-error (checking private properties)
      expect(taskRunner.task).toBeDefined();
      // @ts-expect-error (checking private properties)
      expect(taskRunner.retriever).toBeDefined();
      // @ts-expect-error (checking private properties)
      expect(taskRunner.telemetry).toBeDefined();
    });

    it('should throw if an error occurs', async () => {
      const errorMessage = 'Test error';
      mockCreateModel.mockImplementationOnce(() => {
        throw new Error(errorMessage);
      });

      await expect(taskRunner.setup('test-connector-id')).rejects.toThrow(errorMessage);
    });

    it('uses the v1 agent when ruleMigrationGraphv2 is disabled', async () => {
      await taskRunner.setup('test-connector-id');
      expect(mockGetRuleMigrationAgent).toHaveBeenCalledTimes(1);
      expect(mockGetRuleMigrationAgentV2).not.toHaveBeenCalled();
    });

    it('uses the v2 agent when ruleMigrationGraphv2 is enabled', async () => {
      const taskRunnerV2 = new RuleMigrationTaskRunner(
        'test-migration-id',
        'splunk',
        mockRequest,
        mockUser,
        abortController,
        mockRuleMigrationsDataClient,
        mockLogger,
        {
          ...mockDependencies,
          experimentalFeatures: { ruleMigrationGraphv2: true },
        } as unknown as SiemMigrationsClientDependencies
      );

      await taskRunnerV2.setup('test-connector-id');
      expect(mockGetRuleMigrationAgentV2).toHaveBeenCalledTimes(1);
      expect(mockGetRuleMigrationAgent).not.toHaveBeenCalled();
    });
  });

  describe('prepareTaskInput', () => {
    it('should enrich relevant lookup resources with runtime mapping fields', async () => {
      const migrationRule = {
        id: 'rule-1',
        original_rule: { vendor: 'splunk' },
      };
      mockGetResources.mockResolvedValue({
        macro: [{ type: 'macro', name: 'macro1', content: 'search index=main' }],
        lookup: [
          { type: 'lookup', name: 'threat_intel_ip', content: 'lookup_default_threat_intel_ip' },
        ],
      });
      mockRuleMigrationsDataClient.resources.getMapping.mockResolvedValue({
        lookup_default_threat_intel_ip: {
          mappings: {
            runtime: {
              ip: { type: 'ip' },
              threat_category: { type: 'keyword' },
            },
          },
        },
      });

      await expect(
        // @ts-expect-error checking protected method
        taskRunner.prepareTaskInput(migrationRule)
      ).resolves.toEqual({
        id: 'rule-1',
        original_rule: { vendor: 'splunk' },
        resources: {
          macro: [{ type: 'macro', name: 'macro1', content: 'search index=main' }],
          lookup: [
            {
              type: 'lookup',
              name: 'threat_intel_ip',
              content: 'lookup_default_threat_intel_ip',
              fields: [
                { path: 'ip', type: 'ip' },
                { path: 'threat_category', type: 'keyword' },
              ],
            },
          ],
        },
      });
      expect(mockGetResources).toHaveBeenCalledWith(migrationRule.original_rule);
      expect(mockRuleMigrationsDataClient.resources.getMapping).toHaveBeenCalledWith({
        index: ['lookup_default_threat_intel_ip'],
        allow_no_indices: true,
        ignore_unavailable: true,
      });
    });

    it('should not fetch resources for unsupported vendors', async () => {
      const migrationRule = {
        id: 'rule-1',
        original_rule: { vendor: 'elastic' },
      };

      await expect(
        // @ts-expect-error checking protected method
        taskRunner.prepareTaskInput(migrationRule)
      ).resolves.toEqual({
        id: 'rule-1',
        original_rule: { vendor: 'elastic' },
        resources: {},
      });
      expect(mockGetResources).not.toHaveBeenCalled();
      expect(mockRuleMigrationsDataClient.resources.getMapping).not.toHaveBeenCalled();
    });
  });
});
