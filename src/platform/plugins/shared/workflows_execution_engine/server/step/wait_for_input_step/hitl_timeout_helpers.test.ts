/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import {
  computeHitlWaitDeadlineMs,
  getHitlIdleDeadlineMsForStep,
  hasHitlWaitExpired,
} from './hitl_timeout_helpers';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';

describe('hitl_timeout_helpers', () => {
  describe('computeHitlWaitDeadlineMs', () => {
    it('returns undefined when startedAt is missing', () => {
      expect(computeHitlWaitDeadlineMs(undefined, '30s')).toBeUndefined();
    });

    it('returns startedAt plus parsed timeout', () => {
      expect(computeHitlWaitDeadlineMs('2025-06-01T12:00:00.000Z', '30s')).toBe(
        new Date('2025-06-01T12:00:30.000Z').getTime()
      );
    });
  });

  describe('hasHitlWaitExpired', () => {
    it('returns false when startedAt is missing', () => {
      expect(hasHitlWaitExpired(undefined, '30s', Date.parse('2025-06-01T12:01:00.000Z'))).toBe(
        false
      );
    });

    it('returns false before the deadline', () => {
      expect(
        hasHitlWaitExpired(
          '2025-06-01T12:00:00.000Z',
          '30s',
          Date.parse('2025-06-01T12:00:29.999Z')
        )
      ).toBe(false);
    });

    it('returns true at or after the deadline', () => {
      expect(
        hasHitlWaitExpired(
          '2025-06-01T12:00:00.000Z',
          '30s',
          Date.parse('2025-06-01T12:00:30.000Z')
        )
      ).toBe(true);
    });
  });

  describe('getHitlIdleDeadlineMsForStep', () => {
    it('returns undefined for non-HITL nodes', () => {
      const stepExecutionRuntime = {
        node: { stepType: 'console' },
        stepExecution: { startedAt: '2025-06-01T12:00:00.000Z' },
      } as unknown as StepExecutionRuntime;

      expect(getHitlIdleDeadlineMsForStep(stepExecutionRuntime)).toBeUndefined();
    });

    it('returns waitForInput deadline using the default timeout', () => {
      const stepExecutionRuntime = {
        node: {
          type: 'waitForInput',
          stepType: 'waitForInput',
          configuration: {},
        },
        stepExecution: {
          status: ExecutionStatus.WAITING_FOR_INPUT,
          startedAt: '2025-06-01T12:00:00.000Z',
        },
      } as unknown as StepExecutionRuntime;

      expect(getHitlIdleDeadlineMsForStep(stepExecutionRuntime)).toBe(
        new Date('2025-06-01T12:00:00.000Z').getTime() + 72 * 60 * 60 * 1000
      );
    });
  });
});
