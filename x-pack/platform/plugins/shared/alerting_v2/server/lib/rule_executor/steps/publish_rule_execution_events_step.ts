/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { Request } from '@kbn/core-di-server';
import { inject, injectable } from 'inversify';
import { alertEventType } from '../../../resources/datastreams/alert_events';
import type { PipelineStateStream, RuleExecutionStep, RulePipelineState } from '../types';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import { RuleExecutorEventPublisher } from '../../events/rule_executor_event_publisher/rule_executor_event_publisher';

const countSignalEventsInBatch = (state: RulePipelineState): number => {
  const batch = state.alertEventsBatch;

  if (!batch || batch.length === 0) {
    return 0;
  }

  return batch.filter((event) => event.type === alertEventType.signal).length;
};

/**
 * Final pipeline step that emits a rule-executor domain event once per
 * completed execution when signal events were persisted.
 *
 * Accumulates counts across streamed ES|QL batches and publishes after
 * the upstream stream is exhausted.
 */
@injectable()
export class PublishRuleExecutionEventsStep implements RuleExecutionStep {
  public readonly name = 'publish_rule_execution_events';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract,
    @inject(RuleExecutorEventPublisher)
    private readonly eventPublisher: RuleExecutorEventPublisher,
    @inject(Request) private readonly request: KibanaRequest
  ) {}

  public executeStream(streamState: PipelineStateStream): PipelineStateStream {
    const step = this;

    // Unlike most steps (e.g. StoreAlertEventsStep) which use `guardedMapStep` /
    // `guardedExpandStep` to transform one stream item at a time, this step wraps
    // the entire upstream stream. That lets us observe every batch, pass results
    // through unchanged, and run side effects only after the stream is exhausted
    // — one workflow trigger per rule execution, not one per ES|QL batch.
    return (async function* () {
      let totalSignalEventCount = 0;
      let lastState: RulePipelineState | undefined;

      for await (const result of streamState) {
        if (result.type === 'continue') {
          lastState = result.state;

          if (result.state.rule?.kind === 'signal') {
            totalSignalEventCount += countSignalEventsInBatch(result.state);
          }
        }

        yield result;
      }

      if (totalSignalEventCount > 0 && lastState?.rule) {
        step.logger.debug({
          message: () =>
            `[${step.name}] Emitting signalsWritten for rule ${lastState.input.ruleId} (${totalSignalEventCount} signal events)`,
        });

        step.eventPublisher.emitSignalsWritten(step.request, {
          rule: lastState.rule,
          spaceId: lastState.input.spaceId,
          scheduledAt: lastState.input.scheduledAt,
          signalEventCount: totalSignalEventCount,
        });
      }
    })();
  }
}
