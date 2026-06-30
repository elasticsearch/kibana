/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { PublishRuleExecutionEventsStep } from './publish_rule_execution_events_step';
import {
  collectStreamResults,
  createAlertEvent,
  createPipelineStream,
  createRuleExecutionInput,
  createRulePipelineState,
  createRuleResponse,
} from '../test_utils';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';
import type { RuleExecutorEventPublisher } from '../../events/rule_executor_event_publisher/rule_executor_event_publisher';

describe('PublishRuleExecutionEventsStep', () => {
  let step: PublishRuleExecutionEventsStep;
  let mockPublisher: jest.Mocked<Pick<RuleExecutorEventPublisher, 'emitSignalsWritten'>>;
  let request: KibanaRequest;

  beforeEach(() => {
    const { loggerService } = createLoggerService();
    mockPublisher = {
      emitSignalsWritten: jest.fn(),
    };
    request = httpServerMock.createKibanaRequest();
    step = new PublishRuleExecutionEventsStep(
      loggerService,
      mockPublisher as unknown as RuleExecutorEventPublisher,
      request
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('emits once with aggregate signal count after a multi-batch stream', async () => {
    const rule = createRuleResponse({ kind: 'signal', id: 'signal-rule-1' });
    const input = createRuleExecutionInput({
      ruleId: 'signal-rule-1',
      scheduledAt: '2025-01-01T00:00:00.000Z',
    });

    const stream = step.executeStream(
      createPipelineStream([
        createRulePipelineState({
          input,
          rule,
          alertEventsBatch: [
            createAlertEvent({ type: 'signal', group_hash: 'hash-1' }),
            createAlertEvent({ type: 'signal', group_hash: 'hash-2' }),
          ],
        }),
        createRulePipelineState({
          input,
          rule,
          alertEventsBatch: [createAlertEvent({ type: 'signal', group_hash: 'hash-3' })],
        }),
      ])
    );

    const results = await collectStreamResults(stream);

    expect(results).toHaveLength(2);
    expect(mockPublisher.emitSignalsWritten).toHaveBeenCalledTimes(1);
    expect(mockPublisher.emitSignalsWritten).toHaveBeenCalledWith(request, {
      rule,
      spaceId: input.spaceId,
      scheduledAt: input.scheduledAt,
      signalEventCount: 3,
    });
  });

  it('does not emit when no signal events were written', async () => {
    const rule = createRuleResponse({ kind: 'signal' });

    await collectStreamResults(
      step.executeStream(
        createPipelineStream([
          createRulePipelineState({
            rule,
            alertEventsBatch: [],
          }),
        ])
      )
    );

    expect(mockPublisher.emitSignalsWritten).not.toHaveBeenCalled();
  });

  it('does not emit for alert-kind rules even when batches contain signal-typed events', async () => {
    const rule = createRuleResponse({ kind: 'alert' });

    await collectStreamResults(
      step.executeStream(
        createPipelineStream([
          createRulePipelineState({
            rule,
            alertEventsBatch: [createAlertEvent({ type: 'signal' })],
          }),
        ])
      )
    );

    expect(mockPublisher.emitSignalsWritten).not.toHaveBeenCalled();
  });

  it('passes through halt results without emitting', async () => {
    const stream = step.executeStream(
      (async function* () {
        yield {
          type: 'halt' as const,
          reason: 'rule_disabled' as const,
          state: createRulePipelineState({
            rule: createRuleResponse({ kind: 'signal' }),
            alertEventsBatch: [createAlertEvent({ type: 'signal' })],
          }),
        };
      })()
    );

    const results = await collectStreamResults(stream);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('halt');
    expect(mockPublisher.emitSignalsWritten).not.toHaveBeenCalled();
  });
});
