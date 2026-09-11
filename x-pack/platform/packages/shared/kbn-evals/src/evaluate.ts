/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { hostname as osHostname } from 'os';
import { execFileSync } from 'child_process';
import { createRestClient } from '@kbn/inference-plugin/common';
import { test as base } from '@kbn/scout';
import { createEsClientForTesting } from '@kbn/test-es-server';
import { KibanaEvalsClient } from './kibana_evals_executor/client';
import { httpHandlerFromKbnClient } from './utils/http_handler_from_kbn_client';
import { wrapKbnClientWithRetries } from './utils/kbn_client_with_retries';
import { getEvaluationsKbnClient } from './utils/evaluations_kbn_client';
import { createCriteriaEvaluator } from './evaluators/criteria';
import { getGitMetadata } from './utils/git_metadata';
import { buildExecutionId } from './utils/build_execution_id';
import { createDefaultTerminalReporter } from './utils/reporting/evaluation_reporter';
import { createConnectorFixture } from './utils/create_connector_fixture';
import { wrapInferenceClientWithEisConnectorTelemetry } from './utils/wrap_inference_client_with_connector_telemetry';
import { createAgentBuilderClient } from './utils/agent_builder_client';
import { createCorrectnessAnalysisEvaluator } from './evaluators/correctness';
import { createGroundednessAnalysisEvaluator } from './evaluators/groundedness';
import {
  createCachedTokensEvaluator,
  createInputTokensEvaluator,
  createLatencyEvaluator,
  createOutputTokensEvaluator,
  createToolCallsEvaluator,
} from './evaluators/trace_based';
import { ESQL_EQUIVALENCE_EVALUATOR_NAME } from './evaluators/esql';
import { EvalsClient } from './utils/evals_client';
import { EvaluatorApiClient } from './utils/evaluator_api_client';
import { getBuildkiteCiMetadataFromEnv } from './utils/ci_metadata';
import { getSpaceIdsFromEnv } from './utils/space_ids';
import { buildIngestRequest, toScoreModel } from './utils/build_ingest_request';
import { buildModelFromConnector } from './utils/build_model_from_connector';
import type {
  DefaultEvaluators,
  EvaluationDataset,
  EvaluationSpecificWorkerFixtures,
  Example,
} from './types';
import { isElasticCloudEsUrl } from './utils/es_url';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toDatasetRouteExample(example: Example) {
  if (example.input != null && !isObjectRecord(example.input)) {
    throw new Error('Dataset example input must be an object when provided');
  }
  if (example.output != null && !isObjectRecord(example.output)) {
    throw new Error('Dataset example output must be an object when provided');
  }
  if (example.metadata != null && !isObjectRecord(example.metadata)) {
    throw new Error('Dataset example metadata must be an object when provided');
  }

  return {
    ...(example.input != null && { input: example.input }),
    ...(example.output != null && { output: example.output }),
    ...(example.metadata != null && { metadata: example.metadata }),
  };
}

/**
 * Test type for evaluations. Loads an inference client and a
 * executor client.
 */

export const evaluate = base.extend<{}, EvaluationSpecificWorkerFixtures>({
  kbnClient: [
    async ({ kbnClient, log }, use) => {
      // Centralize request retries for evals so suites don't need to wrap calls.
      await use(wrapKbnClientWithRetries({ kbnClient, log }));
    },
    { scope: 'worker' },
  ],
  evalsClient: [
    async ({ kbnClient, log }, use) => {
      const evaluationsKbnClient = getEvaluationsKbnClient({ kbnClient, log });
      const evalsClient = new EvalsClient(evaluationsKbnClient, log, {
        spaceIds: getSpaceIdsFromEnv(),
      });
      await evalsClient.assertPluginEnabled();
      await evalsClient.assertSpacesExist();
      await use(evalsClient);
    },
    { scope: 'worker' },
  ],
  evaluatorClient: [
    async ({ kbnClient, log }, use) => {
      const evaluationsKbnClient = getEvaluationsKbnClient({ kbnClient, log });
      const evaluatorClient = new EvaluatorApiClient(evaluationsKbnClient, log);
      await use(evaluatorClient);
    },
    { scope: 'worker' },
  ],
  workerExecutionId: [
    async ({}, use) => {
      await use({ current: undefined as string | undefined });
    },
    { scope: 'worker' },
  ],
  workerExperimentId: [
    async ({}, use) => {
      await use({ current: undefined as string | undefined });
    },
    { scope: 'worker' },
  ],
  fetch: [
    async ({ kbnClient, log, workerExecutionId, workerExperimentId }, use) => {
      const fetch = httpHandlerFromKbnClient({
        kbnClient,
        log,
        getExecutionId: () => workerExecutionId.current,
        getExperimentId: () => workerExperimentId.current,
      });
      await use(fetch);
    },
    { scope: 'worker' },
  ],
  connector: [
    async ({ fetch, log, connectorParam }, use) => {
      if (!connectorParam) {
        throw new Error(
          'The `connectorParam` option must be set per-project in the Playwright config.'
        );
      }
      await createConnectorFixture({ predefinedConnector: connectorParam, fetch, log, use });
    },
    {
      scope: 'worker',
    },
  ],
  evaluationConnector: [
    async ({ fetch, log, connector, connectorParam, evaluationConnectorParam }, use) => {
      if (!evaluationConnectorParam) {
        throw new Error(
          'The `evaluationConnectorParam` option must be set per-project in the Playwright config.'
        );
      }
      if (evaluationConnectorParam.id !== connectorParam?.id) {
        await createConnectorFixture({
          predefinedConnector: evaluationConnectorParam,
          fetch,
          log,
          use,
        });
      } else {
        // If the evaluation connector is the same as the main connector, reuse it
        await use(connector);
      }
    },
    {
      scope: 'worker',
    },
  ],
  inferenceClient: [
    async ({ log, fetch, connector }, use) => {
      log.info('Loading inference client');

      const inferenceClient = createRestClient({
        fetch,
        bindTo: {
          connectorId: connector.id,
        },
      });
      const wrappedInferenceClient = wrapInferenceClientWithEisConnectorTelemetry(inferenceClient);
      log.serviceLoaded?.('inferenceClient');

      await use(wrappedInferenceClient);
    },
    { scope: 'worker' },
  ],

  agentBuilderClient: [
    async ({ fetch, log, connector }, use) => {
      const agentBuilderClient = createAgentBuilderClient({
        fetch,
        log,
        connectorId: connector.id,
      });

      log.serviceLoaded?.('agentBuilderClient');

      await use(agentBuilderClient);
    },
    { scope: 'worker' },
  ],

  reportDisplayOptions: [
    async ({ evaluators }, use) => {
      const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
        evaluators.traceBasedEvaluators;

      await use({
        evaluatorDisplayOptions: new Map([
          [
            inputTokens.name,
            { decimalPlaces: 1, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            outputTokens.name,
            { decimalPlaces: 1, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            cachedTokens.name,
            { decimalPlaces: 1, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [toolCalls.name, { decimalPlaces: 1, statsToInclude: ['mean', 'median', 'min', 'max'] }],
          [
            latency.name,
            { unitSuffix: 's', statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            'Precision@K',
            { decimalPlaces: 2, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            'F1@K',
            { decimalPlaces: 2, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            'Recall@K',
            { decimalPlaces: 2, statsToInclude: ['mean', 'median', 'stdDev', 'min', 'max'] },
          ],
          [
            ESQL_EQUIVALENCE_EVALUATOR_NAME,
            { decimalPlaces: 2, statsToInclude: ['mean', 'stdDev'] },
          ],
        ]),
        evaluatorDisplayGroups: [
          {
            evaluatorNames: [inputTokens.name, outputTokens.name, cachedTokens.name],
            combinedColumnName: 'Tokens',
          },
          {
            evaluatorNames: ['Precision@K', 'F1@K', 'Recall@K'],
            combinedColumnName: 'RAG',
          },
        ],
      });
    },
    { scope: 'worker' },
  ],
  reportModelScore: [
    async ({ reportDisplayOptions }, use) => {
      await use(createDefaultTerminalReporter({ reportDisplayOptions }));
    },
    { scope: 'worker' },
  ],
  executorClient: [
    async (
      {
        log,
        evalsClient,
        connector,
        evaluationConnector,
        repetitions,
        reportModelScore,
        workerExecutionId,
        workerExperimentId,
      },
      use
    ) => {
      const model = buildModelFromConnector(connector);
      const evaluatorModel = buildModelFromConnector(evaluationConnector);
      const suiteId = process.env.EVAL_SUITE_ID;
      const buildkiteMetadata = getBuildkiteCiMetadataFromEnv();
      const spaceIds = getSpaceIdsFromEnv();

      const executionId = buildExecutionId({
        baseExecutionId: process.env.TEST_RUN_ID,
        suiteId,
        modelId: model.id,
      });

      workerExecutionId.current = executionId;

      const gitMetadata = getGitMetadata();
      const hostName = osHostname();

      const executorClient = new KibanaEvalsClient({
        log,
        model,
        executionId,
        repetitions,
        upsertDataset: async (dataset: EvaluationDataset) =>
          evalsClient.upsertDataset({
            name: dataset.name,
            description: dataset.description,
            tags: dataset.tags,
            maturity: dataset.maturity,
            spaceIds,
            examples: dataset.examples.map(toDatasetRouteExample),
          }),
        getDatasetByName: (datasetName: string) => evalsClient.getDatasetByName(datasetName),
        onExperimentStart: async ({ experimentId }) => {
          workerExperimentId.current = experimentId;
        },
        onEvaluationComplete: async (event) => {
          try {
            const ingestRequests = buildIngestRequest({
              taskModel: model,
              evaluatorModel,
              repetitions,
              hostName,
              gitMetadata,
              suiteId,
              executionId,
              buildkiteMetadata,
              spaceIds,
              source: { kind: 'event', event },
              log,
            });
            const results = await Promise.all(
              ingestRequests.map((ingestRequest) => evalsClient.ingestScores(ingestRequest))
            );
            for (const result of results) {
              if (result.failed.length > 0) {
                log.warning(
                  `Score ingest partially failed for example ${event.exampleId}: ${result.failed
                    .map((f) => f.reason)
                    .join(', ')}`
                );
              }
            }
          } catch (error) {
            log.warning(`Score ingest failed for example ${event.exampleId}: ${error}`);
          }
        },
      });

      await use(executorClient);

      const datasetRunResults = await executorClient.getDatasetRunResults();
      if (datasetRunResults.length > 0 && executionId) {
        await reportModelScore(evalsClient, datasetRunResults[0].id, log, {
          taskModelId: model.id,
          suiteId,
          executionId,
        });
      } else {
        for (const result of datasetRunResults) {
          await reportModelScore(evalsClient, result.id, log, {
            taskModelId: model.id,
            suiteId,
          });
        }
      }

      // Publish the full composite execution ID to Buildkite metadata so the
      // post-comparison step can retrieve it without querying the experiments API.
      // Per-connector key (kbn-evals:execution-id:<suite>:<connector>) is the primary
      // path for multi-model fanout builds; the per-suite key is a fallback for single
      // runs where EVAL_PROJECT is not set.
      if (executionId && suiteId && process.env.BUILDKITE_BUILD_ID) {
        const connectorId = process.env.EVAL_PROJECT;
        try {
          if (connectorId) {
            execFileSync(
              'buildkite-agent',
              ['meta-data', 'set', `kbn-evals:execution-id:${suiteId}:${connectorId}`, executionId],
              { stdio: 'ignore' }
            );
          }
          execFileSync(
            'buildkite-agent',
            ['meta-data', 'set', `kbn-evals:execution-id:${suiteId}`, executionId],
            { stdio: 'ignore' }
          );
        } catch {
          // Not running inside Buildkite; skip silently.
        }
      }
    },
    {
      scope: 'worker',
    },
  ],
  evaluators: [
    async ({ log, inferenceClient, evaluationConnector, traceEsClient }, use) => {
      const evaluatorInferenceClient = inferenceClient.bindTo({
        connectorId: evaluationConnector.id,
      });

      // These judges run in-process against `evaluationConnector`, so unlike the
      // `_evaluate`-backed ones they know their model up front.
      const evaluationModel = toScoreModel(buildModelFromConnector(evaluationConnector));
      const getModel = () => evaluationModel;

      const evaluators: DefaultEvaluators = {
        criteria: (criteria) => {
          return {
            ...createCriteriaEvaluator({
              inferenceClient: evaluatorInferenceClient,
              criteria,
              log,
            }),
            getModel,
          };
        },
        correctnessAnalysis: () => {
          return {
            ...createCorrectnessAnalysisEvaluator({
              inferenceClient: evaluatorInferenceClient,
              log,
            }),
            getModel,
          };
        },
        groundednessAnalysis: () => {
          return {
            ...createGroundednessAnalysisEvaluator({
              inferenceClient: evaluatorInferenceClient,
              log,
            }),
            getModel,
          };
        },
        traceBasedEvaluators: {
          inputTokens: createInputTokensEvaluator({
            traceEsClient,
            log,
          }),
          outputTokens: createOutputTokensEvaluator({
            traceEsClient,
            log,
          }),
          cachedTokens: createCachedTokensEvaluator({
            traceEsClient,
            log,
          }),
          toolCalls: createToolCallsEvaluator({
            traceEsClient,
            log,
          }),
          latency: createLatencyEvaluator({
            traceEsClient,
            log,
          }),
        },
      };
      await use(evaluators);
    },
    {
      scope: 'worker',
    },
  ],
  traceEsClient: [
    async ({ esClient }, use) => {
      const esUrl = process.env.TRACING_ES_URL;
      const apiKey = process.env.TRACING_ES_API_KEY;
      const traceEsClient = esUrl
        ? createEsClientForTesting({
            esUrl,
            isCloud: isElasticCloudEsUrl(esUrl),
            ...(apiKey ? { auth: { apiKey } } : {}),
          })
        : esClient;
      await use(traceEsClient);
    },
    { scope: 'worker' },
  ],
  // User-selected execution parameters, set per-project in the Playwright config.
  // Playwright >=1.61 requires anything set in a project's `use` to be declared as an
  // `{ option: true }` fixture, so these carry the selected values into the fixtures above.
  connectorParam: [undefined, { option: true, scope: 'worker' }],
  evaluationConnectorParam: [undefined, { option: true, scope: 'worker' }],
  repetitions: [1, { option: true, scope: 'worker' }],
});
