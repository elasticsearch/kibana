/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UsageRecord } from '@kbn/usage-api-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import { ModelProvider } from '@kbn/inference-common';
import {
  ConversationRoundStatus,
  ConversationRoundStepType,
  ToolResultType,
} from '@kbn/agent-builder-common';
import { createMeteringService } from './metering_service';
import type { AgentExecutionUsage } from './types';

const reportUsage = jest.fn().mockResolvedValue(undefined);

const createService = () =>
  createMeteringService({
    logger: loggerMock.create(),
    cloud: { serverless: { projectId: 'project-1' }, csp: 'aws', region: 'us-east-1' } as never,
    usageApi: { usageReporting: { reportUsage } } as never,
  });

const execution = (parts: Partial<AgentExecutionUsage> = {}): AgentExecutionUsage => ({
  agentId: 'agent-1',
  executionId: 'execution-1',
  conversationId: 'conversation-1',
  modelProvider: ModelProvider.OpenAI,
  roundId: 'round-1',
  roundCount: 2,
  executionCount: 1,
  usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 4, output_tokens: 2 },
  status: ConversationRoundStatus.completed,
  startedAt: '2026-01-01T00:00:00.000Z',
  timeToFirstToken: 10,
  timeToLastToken: 3_000,
  steps: [],
  messageLength: 5,
  responseLength: 7,
  ...parts,
});

const lastRecord = (): UsageRecord => reportUsage.mock.calls.at(-1)![0][0];

describe('MeteringService.reportExecution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bills the turn, recording how many executions it took', async () => {
    await createService().reportExecution(execution({ executionCount: 2 }));

    const record = lastRecord();
    expect(record.usage.metadata).toEqual(
      expect.objectContaining({
        round_id: 'round-1',
        execution_count: '2',
        input_tokens: '4',
        output_tokens: '2',
        llm_calls: '1',
        message_length: '5',
        response_length: '7',
      })
    );
    expect(record.usage.period_seconds).toBe(3);
  });

  it('gives each turn its own record, so none is overwritten or deduped away', async () => {
    const service = createService();

    await service.reportExecution(execution({ executionId: 'execution-1', roundId: 'round-1' }));
    await service.reportExecution(execution({ executionId: 'execution-2', roundId: 'round-2' }));

    const ids = reportUsage.mock.calls.map(([[record]]) => record.id);
    expect(ids).toEqual([
      'agent-builder-execution-execution-1',
      'agent-builder-execution-execution-2',
    ]);
  });

  it('counts tool calls and errors from this execution only', async () => {
    await createService().reportExecution(
      execution({
        steps: [
          {
            type: ConversationRoundStepType.toolCall,
            tool_call_id: 'tc-1',
            tool_id: 'search',
            params: {},
            results: [{ type: ToolResultType.error, tool_result_id: 'r1', data: {} }],
          },
          {
            type: ConversationRoundStepType.toolCall,
            tool_call_id: 'tc-2',
            tool_id: 'search',
            params: {},
            results: [{ type: ToolResultType.other, tool_result_id: 'r2', data: {} }],
          },
        ] as AgentExecutionUsage['steps'],
      })
    );

    expect(lastRecord().usage.metadata).toEqual(
      expect.objectContaining({ tool_calls: '2', tool_call_errors: '1' })
    );
  });

  // https://github.com/elastic/search-team/issues/13010: one unit per 50k input tokens in the turn,
  // e.g. 235k tokens meters as 5.
  it('charges at least one unit, and one more per 50k input tokens', async () => {
    const service = createService();

    await service.reportExecution(
      execution({ usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 0, output_tokens: 0 } })
    );
    expect(lastRecord().usage.quantity).toBe(1);

    await service.reportExecution(
      execution({
        usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 60_000, output_tokens: 0 },
      })
    );
    expect(lastRecord().usage.quantity).toBe(2);
  });

  it('meters the worked example from the billing definition: 235k tokens is 5 units', async () => {
    await createService().reportExecution(
      execution({
        usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 235_000, output_tokens: 10 },
      })
    );

    expect(lastRecord().usage.quantity).toBe(5);
  });

  it('reports cached input tokens, which the round-shaped payload used to drop', async () => {
    await createService().reportExecution(
      execution({
        usage: {
          connector_id: 'c1',
          llm_calls: 1,
          input_tokens: 100,
          output_tokens: 2,
          cached_input_tokens: 60,
        },
      })
    );

    expect(lastRecord().usage.metadata).toEqual(
      expect.objectContaining({ cached_input_tokens: '60' })
    );
  });

  it('does nothing without the cloud and usage-reporting dependencies', async () => {
    const service = createMeteringService({
      logger: loggerMock.create(),
      cloud: undefined,
      usageApi: undefined,
    });

    await service.reportExecution(execution());

    expect(reportUsage).not.toHaveBeenCalled();
  });
});
