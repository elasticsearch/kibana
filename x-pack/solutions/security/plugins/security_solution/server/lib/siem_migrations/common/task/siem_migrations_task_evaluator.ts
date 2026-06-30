/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EvaluationResult } from 'langsmith/evaluation';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { Run, Example } from 'langsmith/schemas';
import { evaluate } from 'langsmith/evaluation';
import { isLangSmithEnabled } from '@kbn/langchain/server/tracers/langsmith';
import { Client } from 'langsmith';
import type { Logger } from '@kbn/logging';
// Structural copy of langsmith's internal `TargetConfigT` — not exported from the public entry.
type TargetConfigT = Record<string, unknown> & {
  attachments?: Record<string, unknown>;
  callbacks?: unknown;
};
import type { LangSmithEvaluationOptions } from '../../../../../common/siem_migrations/model/common.gen';
import type { SiemMigrationTaskRunner } from './siem_migrations_task_runner';
import type { MigrationDocument, ItemDocument, SiemMigrationsClientDependencies } from '../types';

export interface EvaluateParams {
  connectorId: string;
  langsmithOptions: LangSmithEvaluationOptions;
}

export type Evaluator = (args: { run: Run; example: Example }) => EvaluationResult;
type CustomEvaluatorResult = Omit<EvaluationResult, 'key'>;
export type CustomEvaluator = (args: { run: Run; example: Example }) => CustomEvaluatorResult;

export type SiemMigrationEvaluatorConstructor<
  M extends MigrationDocument = MigrationDocument,
  I extends ItemDocument = ItemDocument,
  P extends object = {},
  C extends object = {},
  O extends object = {}
> = new (
  ...params: ConstructorParameters<typeof SiemMigrationsBaseEvaluator<M, I, P, C, O>>
) => SiemMigrationsBaseEvaluator<M, I, P, C, O>;

export abstract class SiemMigrationsBaseEvaluator<
  M extends MigrationDocument = MigrationDocument,
  I extends ItemDocument = ItemDocument,
  P extends object = {},
  C extends object = {},
  O extends object = {}
> {
  /**
   * Custom evaluators are the functions that will be used to evaluate the quality if the results  in langchain.
   * Both Rule and Dashboard migrations can have common or differing evaluators.
   */
  protected abstract evaluators: Record<string, CustomEvaluator>;

  constructor(
    protected taskRunner: SiemMigrationTaskRunner<M, I, P, C, O>,
    protected dependencies: SiemMigrationsClientDependencies,
    protected logger: Logger
  ) {}

  public async evaluate({ connectorId, langsmithOptions }: EvaluateParams): Promise<void> {
    if (!isLangSmithEnabled()) {
      throw Error('LangSmith is not enabled');
    }

    const client = new Client({ apiKey: langsmithOptions.api_key });

    // Make sure the dataset exists
    const dataset: Example[] = [];
    for await (const example of client.listExamples({ datasetName: langsmithOptions.dataset })) {
      dataset.push(example);
    }
    if (dataset.length === 0) {
      throw Error(`LangSmith dataset not found: ${langsmithOptions.dataset}`);
    }

    // Initialize the task runner first, this may take some time
    await this.taskRunner.initialize();

    // Check if the connector exists and user has privileges to read it
    const connector = await this.dependencies.actionsClient.get({ id: connectorId });

    if (!connector) {
      throw Error(`Connector with id ${connectorId} not found`);
    }
    // for each connector, setup the evaluator
    await this.taskRunner.setup(connectorId);

    // create the migration task after setup
    const evaluators = this.getEvaluators();
    const executeMigrationTask = (params: P, config?: TargetConfigT) =>
      this.taskRunner.executeTask(params, config as RunnableConfig<C>);

    evaluate(executeMigrationTask, {
      data: langsmithOptions.dataset,
      experimentPrefix: connector.name,
      evaluators,
      client,
      maxConcurrency: 3,
    })
      .then(() => {
        this.logger.info('Evaluation finished');
      })
      .catch((err) => {
        this.logger.error(`Evaluation error:\n ${JSON.stringify(err, null, 2)}`);
      });
  }

  private genericEvaluators: Record<string, CustomEvaluator> = {
    translation_result: ({ run, example }) => {
      const runResult = (run?.outputs as ItemDocument)?.translation_result;
      const expectedResult = (example?.outputs as ItemDocument)?.translation_result;

      if (!expectedResult) {
        return { comment: 'No translation result expected' };
      }
      if (!runResult) {
        return { score: false, comment: 'No translation result received' };
      }

      if (runResult === expectedResult) {
        return { score: true, comment: 'Correct' };
      }

      return {
        score: false,
        comment: `Incorrect, expected "${expectedResult}" but got "${runResult}"`,
      };
    },
  };

  private getEvaluators(): Evaluator[] {
    return Object.entries({ ...this.genericEvaluators, ...this.evaluators }).map(
      ([key, evaluator]) => {
        return (args) => {
          const result = evaluator(args);
          return { key, ...result };
        };
      }
    );
  }
}
