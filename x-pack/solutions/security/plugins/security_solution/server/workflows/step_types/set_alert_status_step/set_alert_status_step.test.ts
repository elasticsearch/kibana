/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setAlertStatusStepDefinition } from './set_alert_status_step';
import { ExecutionError } from '@kbn/workflows/server';
import { KibanaApiCallError } from '@kbn/workflows-extensions/server';
import { DETECTION_ENGINE_SIGNALS_STATUS_URL } from '../../../../common/constants';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';

const createMockContext = (input: Record<string, unknown>) => {
  return {
    input,
    config: {},
    rawInput: input,
    contextManager: {
      getContext: jest.fn(),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn(),
      getFakeRequest: jest.fn(),
      callKibanaApi: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'test-step',
    stepType: 'security.setAlertStatus',
  } as unknown as StepHandlerContext<unknown, unknown>;
};

describe('setAlertStatusStepDefinition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handler', () => {
    it('should call Kibana API successfully with single alert ID and close_reason', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        status: 'closed',
        close_reason: 'false_positive',
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      const result = await setAlertStatusStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body: {
          signal_ids: ['alert-1'],
          status: 'closed',
          reason: 'false_positive',
        },
      });
      expect(result).toEqual({
        output: {
          success: true,
          message: 'Successfully updated status to closed for 1 alert(s)',
        },
      });
    });

    it('should call Kibana API successfully with multiple alert IDs', async () => {
      const mockContext = createMockContext({
        alert_ids: ['alert-1', 'alert-2'],
        status: 'acknowledged',
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      const result = await setAlertStatusStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body: {
          signal_ids: ['alert-1', 'alert-2'],
          status: 'acknowledged',
        },
      });
      expect(result).toEqual({
        output: {
          success: true,
          message: 'Successfully updated status to acknowledged for 2 alert(s)',
        },
      });
    });

    it('persists only status (not the raw body/headers) when callKibanaApi throws on a non-2xx', async () => {
      const mockContext = createMockContext({ alert_ids: 'alert-1', status: 'open' });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
        new KibanaApiCallError({
          status: 500,
          headers: { 'x-leaky-header': 'header-value' },
          body: { sensitive: 'partial-success-payload', items: [{ id: 'alert-1' }] },
          message: 'HTTP 500: bulk action partially failed',
        })
      );

      const error = await setAlertStatusStepDefinition
        .handler(mockContext)
        .then(() => undefined)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ExecutionError);
      const serialized = (error as ExecutionError).toSerializableObject();
      expect(serialized.type).toBe('ApiError');
      expect(serialized.details).toEqual({ status: 500 });
      expect(JSON.stringify(serialized.details)).not.toContain('partial-success-payload');
      expect(JSON.stringify(serialized.details)).not.toContain('x-leaky-header');
    });

    it('should throw ExecutionError if API call throws a generic error', async () => {
      const mockContext = createMockContext({ alert_ids: 'alert-1', status: 'open' });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await expect(setAlertStatusStepDefinition.handler(mockContext)).rejects.toThrow(
        ExecutionError
      );
    });
  });
});
