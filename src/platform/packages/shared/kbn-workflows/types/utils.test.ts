/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import {
  getBuiltInStepStability,
  isBuiltInStepProperty,
  isBuiltInStepType,
  isDangerousStatus,
  isDynamicConnector,
  isElasticsearchStep,
  isFailedBeforeSteps,
  isForeachStep,
  isHttpMethod,
  isIfStep,
  isInProgressStatus,
  isInternalConnector,
  isKibanaStep,
  isMergeStep,
  isParallelStep,
  isSwitchStep,
  isTerminalStatus,
  isTriggerType,
  isWaitStep,
  isWhileStep,
  transformWorkflowYamlJsontoEsWorkflow,
} from './utils';
import { ConcurrencySlotOccupyingExecutionStatuses, ExecutionStatus } from './v1';
import type { ConnectorContractUnion, WorkflowStepExecutionDto } from './v1';
import type { Step, WorkflowYaml } from '../spec/schema';

describe('types/utils', () => {
  describe('transformWorkflowYamlJsontoEsWorkflow', () => {
    const baseWorkflow: WorkflowYaml = {
      name: 'test-workflow',
      description: 'A test workflow',
      tags: ['tag1', 'tag2'],
      enabled: true,
      steps: [{ name: 'step1', type: 'wait', with: { duration: '1s' } }],
      triggers: [{ type: 'manual' }],
      version: '1',
    };

    it('maps all fields correctly', () => {
      const result = transformWorkflowYamlJsontoEsWorkflow(baseWorkflow);

      expect(result.name).toBe('test-workflow');
      expect(result.description).toBe('A test workflow');
      expect(result.tags).toEqual(['tag1', 'tag2']);
      expect(result.enabled).toBe(true);
      expect(result.valid).toBe(true);
    });

    it('preserves definition as the original reference', () => {
      const result = transformWorkflowYamlJsontoEsWorkflow(baseWorkflow);
      expect(result.definition).toBe(baseWorkflow);
    });

    it('defaults tags to empty array when undefined', () => {
      const { tags: _tags, ...workflowWithoutTags } = baseWorkflow;
      const result = transformWorkflowYamlJsontoEsWorkflow({
        ...workflowWithoutTags,
        tags: undefined,
      } satisfies Omit<WorkflowYaml, 'tags'> & { tags: undefined });
      expect(result.tags).toEqual([]);
    });

    it('passes through explicitly empty tags', () => {
      const result = transformWorkflowYamlJsontoEsWorkflow({ ...baseWorkflow, tags: [] });
      expect(result.tags).toEqual([]);
    });

    it('handles empty string name and description', () => {
      const result = transformWorkflowYamlJsontoEsWorkflow({
        ...baseWorkflow,
        name: '',
        description: '',
      });
      expect(result.name).toBe('');
      expect(result.description).toBe('');
    });
  });

  describe('status checkers', () => {
    const allStatuses = Object.values(ExecutionStatus);

    describe('isInProgressStatus', () => {
      const inProgress = new Set([
        ExecutionStatus.RUNNING,
        ExecutionStatus.PENDING,
        ExecutionStatus.QUEUED,
        ExecutionStatus.WAITING,
        ExecutionStatus.WAITING_FOR_INPUT,
        ExecutionStatus.WAITING_FOR_CHILD,
      ]);

      it.each(allStatuses)('returns %s for status "%s"', (status) => {
        expect(isInProgressStatus(status)).toBe(inProgress.has(status));
      });
    });

    describe('isDangerousStatus', () => {
      const dangerous = new Set([ExecutionStatus.FAILED, ExecutionStatus.CANCELLED]);

      it.each(allStatuses)('returns %s for status "%s"', (status) => {
        expect(isDangerousStatus(status)).toBe(dangerous.has(status));
      });
    });

    describe('ConcurrencySlotOccupyingExecutionStatuses', () => {
      it('includes idle non-terminal waits that still own the execution, but not queued backlog', () => {
        expect(ConcurrencySlotOccupyingExecutionStatuses).toEqual(
          expect.arrayContaining([
            ExecutionStatus.WAITING_FOR_INPUT,
            ExecutionStatus.WAITING_FOR_CHILD,
          ])
        );
        expect(ConcurrencySlotOccupyingExecutionStatuses).not.toContain(ExecutionStatus.QUEUED);
      });
    });

    describe('isTerminalStatus', () => {
      const terminal = new Set([
        ExecutionStatus.COMPLETED,
        ExecutionStatus.FAILED,
        ExecutionStatus.CANCELLED,
        ExecutionStatus.SKIPPED,
        ExecutionStatus.TIMED_OUT,
      ]);

      it.each(allStatuses)('returns %s for status "%s"', (status) => {
        expect(isTerminalStatus(status)).toBe(terminal.has(status));
      });
    });

    it('TIMED_OUT is terminal', () => {
      expect(isTerminalStatus(ExecutionStatus.TIMED_OUT)).toBe(true);
    });

    it('WAITING_FOR_INPUT is not terminal', () => {
      expect(isTerminalStatus(ExecutionStatus.WAITING_FOR_INPUT)).toBe(false);
    });
  });

  describe('isFailedBeforeSteps', () => {
    const nonEmptyStepExecutions = [{} as WorkflowStepExecutionDto];

    it('returns true when FAILED with no step executions', () => {
      expect(isFailedBeforeSteps(ExecutionStatus.FAILED, [])).toBe(true);
    });

    it('returns false when FAILED with step executions', () => {
      expect(isFailedBeforeSteps(ExecutionStatus.FAILED, nonEmptyStepExecutions)).toBe(false);
    });

    it('returns false when COMPLETED with no step executions', () => {
      expect(isFailedBeforeSteps(ExecutionStatus.COMPLETED, [])).toBe(false);
    });

    it('returns false when FAILED with exactly 1 step execution', () => {
      expect(isFailedBeforeSteps(ExecutionStatus.FAILED, nonEmptyStepExecutions)).toBe(false);
    });
  });

  describe('step type guards', () => {
    // Step is a discriminated union — guards only inspect `type`, so we construct
    // a minimal BaseStep-shaped object. The cast is needed because guards accept Step.
    const makeStep = (type: string) => ({ name: 'test-step', type } as unknown as Step);

    it.each([
      ['isWaitStep', isWaitStep, 'wait', 'elasticsearch'],
      ['isElasticsearchStep', isElasticsearchStep, 'elasticsearch', 'kibana'],
      ['isKibanaStep', isKibanaStep, 'kibana', 'elasticsearch'],
      ['isForeachStep', isForeachStep, 'foreach', 'while'],
      ['isWhileStep', isWhileStep, 'while', 'foreach'],
      ['isIfStep', isIfStep, 'if', 'foreach'],
      ['isSwitchStep', isSwitchStep, 'switch', 'if'],
      ['isParallelStep', isParallelStep, 'parallel', 'merge'],
      ['isMergeStep', isMergeStep, 'merge', 'parallel'],
    ] as const)(
      '%s returns true for "%s" and false for "%s"',
      (_name, guard, matchType, nonMatchType) => {
        expect(guard(makeStep(matchType))).toBe(true);
        expect(guard(makeStep(nonMatchType))).toBe(false);
      }
    );

    it('isElasticsearchStep checks exact type, not prefix', () => {
      expect(isElasticsearchStep(makeStep('elasticsearch.search'))).toBe(false);
    });
  });

  describe('string type guards', () => {
    describe('isBuiltInStepType', () => {
      it.each(['if', 'foreach', 'wait', 'while', 'parallel', 'switch', 'merge'])(
        'returns true for "%s"',
        (type) => {
          expect(isBuiltInStepType(type)).toBe(true);
        }
      );

      it.each(['custom.step', '', 'IF'])('returns false for "%s"', (type) => {
        expect(isBuiltInStepType(type)).toBe(false);
      });
    });

    describe('isTriggerType', () => {
      it.each(['alert', 'scheduled', 'manual'])('returns true for "%s"', (type) => {
        expect(isTriggerType(type)).toBe(true);
      });

      it.each(['webhook', '', 'alert_rule'])('returns false for "%s"', (type) => {
        expect(isTriggerType(type)).toBe(false);
      });
    });

    describe('isHttpMethod', () => {
      it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])(
        'returns true for "%s"',
        (method) => {
          expect(isHttpMethod(method)).toBe(true);
        }
      );

      it.each(['CONNECT', 'get', ''])('returns false for "%s" (case-sensitive)', (method) => {
        expect(isHttpMethod(method)).toBe(false);
      });
    });

    describe('isBuiltInStepProperty', () => {
      it.each(['name', 'type', 'with', 'if', 'timeout'])('returns true for "%s"', (prop) => {
        expect(isBuiltInStepProperty(prop)).toBe(true);
      });

      it.each(['custom_prop', ''])('returns false for "%s"', (prop) => {
        expect(isBuiltInStepProperty(prop)).toBe(false);
      });
    });
  });

  describe('connector type guards', () => {
    const internalConnector: ConnectorContractUnion = {
      type: 'elasticsearch.search',
      paramsSchema: z.object({ index: z.string() }),
      outputSchema: z.object({}),
      summary: 'Search',
      description: 'Search ES',
      methods: ['GET'],
      patterns: ['{index}/_search'],
      parameterTypes: { headerParams: [], pathParams: ['index'], urlParams: [], bodyParams: [] },
    };

    const dynamicConnector: ConnectorContractUnion = {
      type: '.http',
      paramsSchema: z.object({}),
      outputSchema: z.object({}),
      summary: 'HTTP',
      description: 'HTTP connector',
      actionTypeId: '.http',
      displayName: 'HTTP',
      instances: [],
    };

    it('isInternalConnector returns true when methods is present', () => {
      expect(isInternalConnector(internalConnector)).toBe(true);
    });

    it('isInternalConnector returns false for dynamic connector', () => {
      expect(isInternalConnector(dynamicConnector)).toBe(false);
    });

    it('isDynamicConnector returns true when actionTypeId is present', () => {
      expect(isDynamicConnector(dynamicConnector)).toBe(true);
    });

    it('isDynamicConnector returns false for internal connector', () => {
      expect(isDynamicConnector(internalConnector)).toBe(false);
    });

    it('both guards return true for an object with both methods and actionTypeId', () => {
      const hybrid = { ...internalConnector, actionTypeId: '.test', instances: [] };
      expect(isInternalConnector(hybrid)).toBe(true);
      expect(isDynamicConnector(hybrid)).toBe(true);
    });
  });

  describe('getBuiltInStepStability', () => {
    it('returns undefined for unknown step type', () => {
      expect(getBuiltInStepStability('nonexistent.step')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(getBuiltInStepStability('')).toBeUndefined();
    });

    it('returns undefined for a known built-in step without stability', () => {
      // 'wait' is a known built-in but has no explicit stability field
      expect(getBuiltInStepStability('wait')).toBeUndefined();
    });
  });
});
