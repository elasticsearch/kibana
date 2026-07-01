/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setAlertTagsStepDefinition } from './set_alert_tags_step';
import { ExecutionError } from '@kbn/workflows/server';
import { KibanaApiCallError } from '@kbn/workflows-extensions/server';
import { DETECTION_ENGINE_ALERT_TAGS_URL } from '../../../../common/constants';
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
    stepType: 'security.setAlertTags',
  } as unknown as StepHandlerContext<unknown, unknown>;
};

describe('setAlertTagsStepDefinition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handler', () => {
    it('should call Kibana API to add tags to a single alert', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_add: ['triaged'],
        tags_to_remove: [],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      const result = await setAlertTagsStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: {
          ids: ['alert-1'],
          tags: {
            tags_to_add: ['triaged'],
            tags_to_remove: [],
          },
        },
      });
      expect(result).toEqual({
        output: {
          success: true,
          message: 'Successfully added 1 tag(s) on 1 alert(s)',
        },
      });
    });

    it('should call Kibana API to remove tags from multiple alerts', async () => {
      const mockContext = createMockContext({
        alert_ids: ['alert-1', 'alert-2'],
        tags_to_add: [],
        tags_to_remove: ['needs-review'],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      const result = await setAlertTagsStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: {
          ids: ['alert-1', 'alert-2'],
          tags: {
            tags_to_add: [],
            tags_to_remove: ['needs-review'],
          },
        },
      });
      expect(result).toEqual({
        output: {
          success: true,
          message: 'Successfully removed 1 tag(s) on 2 alert(s)',
        },
      });
    });

    it('should call Kibana API to add and remove tags in the same call', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_add: ['escalated'],
        tags_to_remove: ['needs-review'],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      const result = await setAlertTagsStepDefinition.handler(mockContext);

      expect(result).toEqual({
        output: {
          success: true,
          message: 'Successfully added 1 tag(s) and removed 1 tag(s) on 1 alert(s)',
        },
      });
    });

    it('defaults tags_to_remove to [] when the workflow omits it', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_add: ['triaged'],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      await setAlertTagsStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: {
          ids: ['alert-1'],
          tags: { tags_to_add: ['triaged'], tags_to_remove: [] },
        },
      });
    });

    it('defaults tags_to_add to [] when the workflow omits it', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_remove: ['needs-review'],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: {},
      });

      await setAlertTagsStepDefinition.handler(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: {
          ids: ['alert-1'],
          tags: { tags_to_add: [], tags_to_remove: ['needs-review'] },
        },
      });
    });

    it('persists only status (not the raw body/headers) when callKibanaApi throws on a non-2xx', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_add: ['triaged'],
        tags_to_remove: [],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
        new KibanaApiCallError({
          status: 500,
          headers: { 'x-leaky-header': 'header-value' },
          body: { sensitive: 'partial-success-payload', failures: [{ id: 'alert-1' }] },
          message: 'HTTP 500: bulk action partially failed',
        })
      );

      const error = await setAlertTagsStepDefinition
        .handler(mockContext)
        .then(() => undefined)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ExecutionError);
      const serialized = (error as ExecutionError).toSerializableObject();
      expect(serialized.type).toBe('ApiError');
      expect(serialized.details).toEqual({ status: 500 });
      // ES guard: the raw body/headers must never reach the persisted `details`.
      expect(JSON.stringify(serialized.details)).not.toContain('partial-success-payload');
      expect(JSON.stringify(serialized.details)).not.toContain('x-leaky-header');
    });

    it('should throw ExecutionError if API call throws a generic error', async () => {
      const mockContext = createMockContext({
        alert_ids: 'alert-1',
        tags_to_add: ['triaged'],
        tags_to_remove: [],
      });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await expect(setAlertTagsStepDefinition.handler(mockContext)).rejects.toThrow(ExecutionError);
    });
  });
});
