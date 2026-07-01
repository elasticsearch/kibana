/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConcurrencySettings, WorkflowContext } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { ConcurrencyManager } from './concurrency_manager';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

describe('ConcurrencyManager', () => {
  let concurrencyManager: ConcurrencyManager;
  let mockContext: WorkflowContext;
  let mockWorkflowTaskManager: jest.Mocked<WorkflowTaskManager>;
  let mockWorkflowExecutionRepository: jest.Mocked<WorkflowExecutionRepository>;

  beforeEach(() => {
    mockWorkflowTaskManager = {
      forceRunIdleTasks: jest.fn().mockResolvedValue(undefined),
      scheduleResumeTask: jest.fn(),
    } as unknown as jest.Mocked<WorkflowTaskManager>;

    mockWorkflowExecutionRepository = {
      getRunningExecutionsByConcurrencyGroup: jest.fn(),
      countExecutionsByConcurrencyGroupAndStatuses: jest.fn(),
      bulkUpdateWorkflowExecutions: jest.fn().mockResolvedValue(undefined),
      updateWorkflowExecution: jest.fn(),
    } as unknown as jest.Mocked<WorkflowExecutionRepository>;

    concurrencyManager = new ConcurrencyManager(
      mockWorkflowTaskManager,
      mockWorkflowExecutionRepository
    );

    mockContext = {
      execution: {
        id: 'test-execution-id',
        isTestRun: false,
        startedAt: new Date(),
        url: 'http://localhost:5601',
      },
      workflow: {
        id: 'test-workflow-id',
        name: 'Test Workflow',
        enabled: true,
        spaceId: 'default',
      },
      kibanaUrl: 'http://localhost:5601',
      consts: {},
      event: {
        alerts: [],
        rule: {
          id: 'test-rule-id',
          name: 'Test Rule',
          tags: [],
          consumer: 'test',
          producer: 'test',
          ruleTypeId: 'test',
        },
        spaceId: 'default',
        params: {},
      },
      inputs: {
        serverName: 'mamba',
        hostName: 'server-1',
      },
      now: new Date(),
    };
  });

  describe('evaluateConcurrencyKey', () => {
    describe('static string keys', () => {
      it('should return static string as-is', () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('server-1');
      });

      it('should return static string with special characters', () => {
        const settings: ConcurrencySettings = {
          key: 'server-1.prod.us-east-1',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('server-1.prod.us-east-1');
      });

      it('should handle static string with spaces', () => {
        const settings: ConcurrencySettings = {
          key: 'server 1',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('server 1');
      });
    });

    describe('template expression evaluation', () => {
      it('should evaluate template expression with inputs', () => {
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverName }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('mamba');
      });

      it('should evaluate template expression with event', () => {
        const settings: ConcurrencySettings = {
          key: '{{ event.rule.id }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('test-rule-id');
      });

      it('should evaluate nested template expression with event context', () => {
        const contextWithNested = {
          ...mockContext,
          event: {
            ...mockContext.event!,
            params: {
              host: {
                name: 'server-1',
              },
            },
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ event.params.host.name }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithNested);
        expect(result).toBe('server-1');
      });

      it('should evaluate template expression with workflow context', () => {
        const settings: ConcurrencySettings = {
          key: '{{ workflow.id }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBe('test-workflow-id');
      });
    });

    describe('null/undefined handling', () => {
      it('should return null when concurrency settings are undefined', () => {
        const result = concurrencyManager.evaluateConcurrencyKey(undefined, mockContext);
        expect(result).toBeNull();
      });

      it('should return null when key is undefined', () => {
        const settings: ConcurrencySettings = {};
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBeNull();
      });

      it('should return null when key is empty string', () => {
        const settings: ConcurrencySettings = {
          key: '',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBeNull();
      });

      it('should return null when template evaluates to null', () => {
        const contextWithNull: WorkflowContext = {
          ...mockContext,
          inputs: {
            serverName: null as any,
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverName }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithNull);
        expect(result).toBeNull();
      });

      it('should return null when template evaluates to undefined', () => {
        const contextWithUndefined: WorkflowContext = {
          ...mockContext,
          inputs: {
            serverName: undefined as any,
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverName }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithUndefined);
        expect(result).toBeNull();
      });

      it('should return null when template evaluates to empty string', () => {
        const contextWithEmpty = {
          ...mockContext,
          inputs: {
            serverName: '',
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverName }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithEmpty);
        expect(result).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should return null when template expression references non-existent field', () => {
        const settings: ConcurrencySettings = {
          key: '{{ inputs.nonexistent.field }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBeNull();
      });

      it('should return null when template syntax is malformed', () => {
        const settings: ConcurrencySettings = {
          key: '{{ invalid syntax }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should return null for key with only whitespace', () => {
        const settings: ConcurrencySettings = {
          key: '   ',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, mockContext);
        expect(result).toBeNull(); // Whitespace is trimmed, empty string returns null
      });

      it('should handle numeric template result', () => {
        const contextWithNumber = {
          ...mockContext,
          inputs: {
            serverId: 123,
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverId }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithNumber);
        expect(result).toBe('123');
      });

      it('should handle boolean template result', () => {
        const contextWithBoolean = {
          ...mockContext,
          inputs: {
            isProduction: true,
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.isProduction }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithBoolean);
        expect(result).toBe('true');
      });

      it('should preserve whitespace in template result', () => {
        const contextWithSpaces = {
          ...mockContext,
          inputs: {
            serverName: '  mamba  ',
          },
        };
        const settings: ConcurrencySettings = {
          key: '{{ inputs.serverName }}',
        };
        const result = concurrencyManager.evaluateConcurrencyKey(settings, contextWithSpaces);
        expect(result).toBe('  mamba  ');
      });
    });
  });

  describe('checkConcurrency', () => {
    it('should allow execution when no concurrency settings', async () => {
      const result = await concurrencyManager.checkConcurrency(
        undefined,
        null,
        'exec-1',
        'default'
      );
      expect(result).toBe(true);
      expect(
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup
      ).not.toHaveBeenCalled();
    });

    it('should allow execution when no concurrency group key', async () => {
      const settings: ConcurrencySettings = {
        key: 'test-key',
        strategy: 'cancel-in-progress',
        max: 2,
      };
      const result = await concurrencyManager.checkConcurrency(settings, null, 'exec-1', 'default');
      expect(result).toBe(true);
      expect(
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup
      ).not.toHaveBeenCalled();
    });

    it('should allow execution when within concurrency limit', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'cancel-in-progress',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-2',
        'default'
      );

      expect(result).toBe(true);
      expect(
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup
      ).toHaveBeenCalledWith('server-1', 'default', 'exec-2');
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
    });

    it('should cancel oldest execution when limit is exceeded', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'cancel-in-progress',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
        'exec-2',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-3',
        'default'
      );

      expect(result).toBe(true);
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledWith([
        {
          id: 'exec-1',
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
          cancellationReason: 'Cancelled due to concurrency limit (max: 2)',
          cancelledAt: expect.any(String),
          cancelledBy: 'system',
        },
      ]);
      expect(mockWorkflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith('exec-1');
    });

    it('should cancel multiple oldest executions when needed', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'cancel-in-progress',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
        'exec-2',
        'exec-3',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-4',
        'default'
      );

      expect(result).toBe(true);
      // Should cancel 2 executions (3 active - 2 max + 1 new = 2 to cancel)
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledWith([
        {
          id: 'exec-1',
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
          cancellationReason: 'Cancelled due to concurrency limit (max: 2)',
          cancelledAt: expect.any(String),
          cancelledBy: 'system',
        },
        {
          id: 'exec-2',
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
          cancellationReason: 'Cancelled due to concurrency limit (max: 2)',
          cancelledAt: expect.any(String),
          cancelledBy: 'system',
        },
      ]);
      expect(mockWorkflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith('exec-1');
      expect(mockWorkflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith('exec-2');
    });

    it('should use default max concurrency of 1 when not specified', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'cancel-in-progress',
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-2',
        'default'
      );

      expect(result).toBe(true);
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledWith([
        {
          id: 'exec-1',
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
          cancellationReason: 'Cancelled due to concurrency limit (max: 1)',
          cancelledAt: expect.any(String),
          cancelledBy: 'system',
        },
      ]);
    });

    it('should skip cancel-in-progress for other strategies', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        max: 1,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-2',
        'default'
      );

      expect(result).toBe(true);
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
    });

    it('should drop new execution when limit is exceeded with drop strategy', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'drop',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
        'exec-2',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-3',
        'default'
      );

      expect(result).toBe(false); // Execution should be dropped
      expect(mockWorkflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith({
        id: 'exec-3',
        status: ExecutionStatus.SKIPPED,
        cancelRequested: true,
        cancellationReason: 'Dropped due to concurrency limit (max: 2)',
        cancelledAt: expect.any(String),
        cancelledBy: 'system',
      });
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
      expect(mockWorkflowTaskManager.forceRunIdleTasks).not.toHaveBeenCalled();
    });

    it('should allow execution when within limit with drop strategy', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'drop',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-2',
        'default'
      );

      expect(result).toBe(true); // Execution should proceed
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
    });

    it('should drop execution when exactly at limit with drop strategy', async () => {
      const settings: ConcurrencySettings = {
        key: 'server-1',
        strategy: 'drop',
        max: 2,
      };
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
        'exec-2',
      ]);

      const result = await concurrencyManager.checkConcurrency(
        settings,
        'server-1',
        'exec-3',
        'default'
      );

      expect(result).toBe(false); // Execution should be dropped (at limit, new one exceeds)
      expect(mockWorkflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith({
        id: 'exec-3',
        status: ExecutionStatus.SKIPPED,
        cancelRequested: true,
        cancellationReason: 'Dropped due to concurrency limit (max: 2)',
        cancelledAt: expect.any(String),
        cancelledBy: 'system',
      });
      expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
    });

    it('should create different concurrency groups for different input values', async () => {
      const settings: ConcurrencySettings = {
        key: '{{ inputs.mamba }}',
        strategy: 'drop',
        max: 2,
      };

      // First execution with input value "group1"
      const context1: WorkflowContext = {
        ...mockContext,
        inputs: {
          mamba: 'group1',
        },
      };
      const key1 = concurrencyManager.evaluateConcurrencyKey(settings, context1);
      expect(key1).toBe('group1');

      // Second execution with input value "group2"
      const context2: WorkflowContext = {
        ...mockContext,
        inputs: {
          mamba: 'group2',
        },
      };
      const key2 = concurrencyManager.evaluateConcurrencyKey(settings, context2);
      expect(key2).toBe('group2');

      // Third execution with input value "group3"
      const context3: WorkflowContext = {
        ...mockContext,
        inputs: {
          mamba: 'group3',
        },
      };
      const key3 = concurrencyManager.evaluateConcurrencyKey(settings, context3);
      expect(key3).toBe('group3');

      // Verify that executions with different keys don't interfere with each other
      // Each group should have its own concurrency limit
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-1',
      ]); // Only one execution in group1

      const result1 = await concurrencyManager.checkConcurrency(
        settings,
        key1!,
        'exec-2',
        'default'
      );
      expect(result1).toBe(true); // Should proceed (within limit for group1)

      // group2 should be independent
      mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
        'exec-3',
      ]); // Only one execution in group2

      const result2 = await concurrencyManager.checkConcurrency(
        settings,
        key2!,
        'exec-4',
        'default'
      );
      expect(result2).toBe(true); // Should proceed (within limit for group2)
    });

    describe('queue strategy', () => {
      it('allows execution when concurrency slots below max', async () => {
        const settings: ConcurrencySettings = { key: 'g1', strategy: 'queue', max: 2 };
        mockWorkflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses.mockResolvedValueOnce(
          1
        );
        const result = await concurrencyManager.checkConcurrency(
          settings,
          'g1',
          'exec-new',
          'default'
        );
        expect(result).toBe(true);
        expect(
          mockWorkflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses
        ).toHaveBeenCalled();
        expect(mockWorkflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
      });

      it('queues new execution when all concurrency slots are taken', async () => {
        const settings: ConcurrencySettings = { key: 'g1', strategy: 'queue', max: 1 };
        mockWorkflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(3);

        const result = await concurrencyManager.checkConcurrency(
          settings,
          'g1',
          'exec-new',
          'default'
        );

        expect(result).toBe(false);
        expect(mockWorkflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith({
          id: 'exec-new',
          status: ExecutionStatus.QUEUED,
        });
      });

      it('marks SKIPPED when queue backlog is full (explicit queue-size)', async () => {
        const settings: ConcurrencySettings = {
          key: 'g1',
          strategy: 'queue',
          max: 1,
          'queue-size': 2,
        };
        mockWorkflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2);

        const result = await concurrencyManager.checkConcurrency(
          settings,
          'g1',
          'exec-new',
          'default'
        );

        expect(result).toBe(false);
        expect(mockWorkflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith({
          id: 'exec-new',
          status: ExecutionStatus.SKIPPED,
          cancelRequested: true,
          cancellationReason: 'Queue full (queue-size: 2)',
          cancelledAt: expect.any(String),
          cancelledBy: 'system',
        });
      });
    });

    describe('error handling', () => {
      it('should throw error when getRunningExecutionsByConcurrencyGroup fails', async () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
          strategy: 'cancel-in-progress',
          max: 2,
        };
        const repositoryError = new Error('Elasticsearch connection failed');
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockRejectedValue(
          repositoryError
        );

        await expect(
          concurrencyManager.checkConcurrency(settings, 'server-1', 'exec-1', 'default')
        ).rejects.toThrow('Elasticsearch connection failed');

        expect(
          mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup
        ).toHaveBeenCalledWith('server-1', 'default', 'exec-1');
        expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).not.toHaveBeenCalled();
        expect(mockWorkflowTaskManager.forceRunIdleTasks).not.toHaveBeenCalled();
      });

      it('should throw error when bulkUpdateWorkflowExecutions fails', async () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
          strategy: 'cancel-in-progress',
          max: 2,
        };
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
          'exec-1',
          'exec-2',
        ]);
        const bulkUpdateError = new Error('Bulk update failed: index read-only');
        mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions.mockRejectedValue(
          bulkUpdateError
        );

        await expect(
          concurrencyManager.checkConcurrency(settings, 'server-1', 'exec-3', 'default')
        ).rejects.toThrow('Bulk update failed: index read-only');

        expect(
          mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup
        ).toHaveBeenCalledWith('server-1', 'default', 'exec-3');
        expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledTimes(
          1
        );
        // forceRunIdleTasks should not be called if bulk update fails
        expect(mockWorkflowTaskManager.forceRunIdleTasks).not.toHaveBeenCalled();
      });

      it('should throw error when forceRunIdleTasks fails for some executions', async () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
          strategy: 'cancel-in-progress',
          max: 1,
        };
        // Set up scenario where we need to cancel one execution
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
          'exec-1',
        ]);
        mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions.mockResolvedValue(undefined);
        // When cancelling exec-1, forceRunIdleTasks fails
        const taskManagerError = new Error('Task manager unavailable');
        mockWorkflowTaskManager.forceRunIdleTasks.mockRejectedValue(taskManagerError);

        await expect(
          concurrencyManager.checkConcurrency(settings, 'server-1', 'exec-2', 'default')
        ).rejects.toThrow('Task manager unavailable');

        expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledTimes(
          1
        );
        // Verify that forceRunIdleTasks was called and the error is propagated
        expect(mockWorkflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith('exec-1');
      });

      it('should throw error when forceRunIdleTasks fails for all executions', async () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
          strategy: 'cancel-in-progress',
          max: 2,
        };
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockResolvedValue([
          'exec-1',
          'exec-2',
        ]);
        mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions.mockResolvedValue(undefined);
        const taskManagerError = new Error('Task manager service down');
        // Promise.all will reject when any promise rejects
        // The map function creates promises for all executions
        mockWorkflowTaskManager.forceRunIdleTasks.mockImplementation(() => {
          return new Promise((_, reject) => {
            // Make the promise async to ensure map completes
            process.nextTick(() => {
              reject(taskManagerError);
            });
          });
        });

        await expect(
          concurrencyManager.checkConcurrency(settings, 'server-1', 'exec-3', 'default')
        ).rejects.toThrow('Task manager service down');

        expect(mockWorkflowExecutionRepository.bulkUpdateWorkflowExecutions).toHaveBeenCalledTimes(
          1
        );
        // Verify that forceRunIdleTasks was called
        // The exact number may vary in test environment due to Promise.all rejection timing
        // but the key behavior is that errors are properly propagated
        expect(mockWorkflowTaskManager.forceRunIdleTasks).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions from getRunningExecutionsByConcurrencyGroup', async () => {
        const settings: ConcurrencySettings = {
          key: 'server-1',
          strategy: 'cancel-in-progress',
          max: 2,
        };
        // Simulate a non-Error exception (e.g., string thrown)
        mockWorkflowExecutionRepository.getRunningExecutionsByConcurrencyGroup.mockRejectedValue(
          'Unexpected string error'
        );

        await expect(
          concurrencyManager.checkConcurrency(settings, 'server-1', 'exec-1', 'default')
        ).rejects.toBe('Unexpected string error');
      });
    });
  });
});
