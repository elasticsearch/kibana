/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RunContext, RunResult } from '@kbn/task-manager-plugin/server/task';
import { throwUnrecoverableError } from '@kbn/task-manager-plugin/server';
import { inject, injectable } from 'inversify';

import type { HaltReason, RuleExecutorTaskParams } from './types';
import type {
  RuleExecutionPipelineContract,
  RuleExecutionPipelineInput,
  RuleExecutionPipelineResult,
} from './execution_pipeline';
import { RuleExecutionPipeline } from './execution_pipeline';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../services/logger_service/logger_service';

type TaskRunParams = Pick<RunContext, 'taskInstance' | 'abortController'>;

@injectable()
export class RuleExecutorTaskRunner {
  constructor(
    @inject(RuleExecutionPipeline) private readonly pipeline: RuleExecutionPipelineContract,
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  public async run({ taskInstance, abortController }: TaskRunParams): Promise<RunResult> {
    const input = this.createRuleExecutionInput(taskInstance, abortController);

    const result = await this.pipeline.execute(input);

    return this.buildRunResult(result, taskInstance);
  }

  /**
   * Creates execution input for the pipeline.
   */
  private createRuleExecutionInput(
    taskInstance: TaskRunParams['taskInstance'],
    abortController: AbortController
  ): RuleExecutionPipelineInput {
    const params = taskInstance.params as RuleExecutorTaskParams;
    const scheduledAt = taskInstance.scheduledAt;

    return {
      ruleId: params.ruleId,
      spaceId: params.spaceId,
      scheduledAt: this.getScheduledAtISOString(scheduledAt, taskInstance.startedAt),
      abortSignal: abortController.signal,
    };
  }

  private getScheduledAtISOString(scheduledAt?: Date | string, startedAt?: Date | null): string {
    if (typeof scheduledAt === 'string') {
      return scheduledAt;
    }

    if (startedAt instanceof Date) {
      return startedAt.toISOString();
    }

    return new Date().toISOString();
  }

  /**
   * Translate pipeline result to task manager state.
   */
  private buildRunResult(
    result: RuleExecutionPipelineResult,
    taskInstance: TaskRunParams['taskInstance']
  ): RunResult {
    if (result.completed) {
      return { state: {} };
    }

    if (result.haltReason === 'rule_deleted') {
      const params = taskInstance.params as RuleExecutorTaskParams;
      this.logger.debug({
        message: `Rule "${params.ruleId}" in the "${params.spaceId}" space no longer exists. Its corresponding task will be removed by Task Manager.`,
      });
      throwUnrecoverableError(new Error('Rule no longer exists'));
    }

    return { state: this.getStateForHaltReason(taskInstance, result.haltReason) };
  }

  /**
   * Map domain halt reasons to task manager state.
   */
  private getStateForHaltReason(
    taskInstance: TaskRunParams['taskInstance'],
    reason?: HaltReason
  ): Record<string, unknown> {
    switch (reason) {
      case 'rule_disabled':
      case 'engine_disabled':
        return taskInstance.state ?? {};
      default:
        return {};
    }
  }
}
