/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import type { Logger } from '@kbn/logging';
import type { AiIndexDest } from '../../common/http_api/ai_indices';
import type { AiIndexService } from '../ai_indices/service';
import type { ContextEngineAnalyticsService } from '../telemetry';

/** Builds a minimal step handler context with a mocked scoped ES client. */
export const createMockStepContext = ({
  input,
  esClient,
  abortController = new AbortController(),
  spaceId = 'default',
}: {
  input: unknown;
  esClient: unknown;
  abortController?: AbortController;
  spaceId?: string;
}): StepHandlerContext => {
  return {
    input,
    rawInput: {},
    config: {},
    contextManager: {
      getScopedEsClient: jest.fn().mockReturnValue(esClient),
      getFakeRequest: jest.fn().mockReturnValue({ headers: {} }),
      getContext: jest.fn().mockReturnValue({ workflow: { spaceId } }),
      renderInputTemplate: jest.fn(),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    abortSignal: abortController.signal,
    stepId: 'test-step',
    stepType: 'context-engine.test',
  } as unknown as StepHandlerContext;
};

/** An AiIndexService stub whose `get` resolves to an AI index with the given dest. */
export const mockAiIndexService = (dest: AiIndexDest, managed = false): AiIndexService =>
  ({
    get: jest.fn().mockResolvedValue({ id: 'my-ai-index', dest, managed }),
  } as unknown as AiIndexService);

/** Fresh telemetry deps (analytics service + logger mocks) for a KI step definition. */
export const mockKiStepTelemetry = () => ({
  analyticsService: {
    reportKiWrite: jest.fn(),
    reportKiVerification: jest.fn(),
  } as unknown as jest.Mocked<ContextEngineAnalyticsService>,
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger,
});
