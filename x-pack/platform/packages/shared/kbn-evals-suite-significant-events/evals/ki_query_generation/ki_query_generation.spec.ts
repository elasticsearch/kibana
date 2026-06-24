/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateSignificantEvents } from '@kbn/streams-ai';
import { significantEventsPrompt } from '@kbn/streams-ai/src/significant_events/prompt';
import { tags } from '@kbn/scout';

import { getCurrentTraceId, createSpanLatencyEvaluator } from '@kbn/evals';
import type { Feature, Streams } from '@kbn/streams-schema';
import type { GcsConfig } from '../../src/data_generators/replay';
import {
  canonicalKIFeaturesFromExpectedGroundTruth,
  cleanSignificantEventsDataStreams,
  deleteTemporaryReplayIndices,
  ensureStreamsEnabled,
  listAvailableSnapshots,
  loadKIFeaturesFromSnapshot,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
  SIGEVENTS_WIRED_ROOTS,
} from '../../src/data_generators/replay';
import { evaluate } from '../../src/evaluate';
import { createKIQueryGenerationEvaluators } from '../../src/evaluators/ki_query_generation';
import { createScenarioCriteriaLlmEvaluator } from '../../src/evaluators/scenario_criteria/evaluators';
import {
  getActiveDatasets,
  MANAGED_STREAM_NAME,
  MANAGED_STREAM_SEARCH_PATTERN,
  resolveScenarioSnapshotSource,
  snapshotCatalogKey,
  type KIQueryGenerationScenario,
} from '../../src/datasets';
import { KI_FEATURE_SOURCES_TO_RUN } from './resolve_ki_sources';
import { extractLogTextFromSourceDoc } from './extract_log_text';
import { getComputedKIFeaturesFromDocs } from './get_computed_ki_features_from_docs';
import { collectSampleDocuments } from './collect_sample_documents';
import {
  createEvalSemanticCodeSearchTools,
  resolveCodeIndexForDataset,
  resolveGroundingModes,
  type AgentBuilderToolResult,
  type GroundingMode,
} from './grounding_tools';

const TRUST_UPSTREAM = process.env.SIGEVENTS_TRUST_UPSTREAM === 'true';

interface CollectedQueryGenExample {
  scenario: KIQueryGenerationScenario;
  kis: Feature[];
  sampleLogs: string[];
  sampleDocs: Array<Record<string, unknown>>;
}

evaluate.describe('KI query generation', { tag: tags.serverless.observability.complete }, () => {
  const activeDatasets = getActiveDatasets();
  const availableSnapshotsBySource = new Map<string, Set<string>>();

  evaluate.beforeAll(async ({ esClient, log }) => {
    const uniqueCatalogSources = new Map<string, GcsConfig>();
    for (const dataset of activeDatasets) {
      for (const scenario of dataset.kiQueryGeneration) {
        const source = resolveScenarioSnapshotSource({
          scenarioId: scenario.input.scenario_id,
          datasetGcs: dataset.gcs,
          snapshotSource: scenario.snapshot_source,
        });
        uniqueCatalogSources.set(snapshotCatalogKey(source.gcs), source.gcs);
      }
    }

    for (const [catalogSourceKey, gcs] of uniqueCatalogSources.entries()) {
      const availableSnapshots = await listAvailableSnapshots(esClient, log, gcs);
      availableSnapshotsBySource.set(catalogSourceKey, new Set(availableSnapshots));
    }
  });

  for (const dataset of activeDatasets) {
    for (const kiSource of KI_FEATURE_SOURCES_TO_RUN) {
      evaluate.describe(`${dataset.id} (${kiSource})`, () => {
        const collectedExamples: CollectedQueryGenExample[] = [];
        const snapshotSources = new Map<string, { snapshotName: string; gcs: GcsConfig }>();

        evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
          for (const scenario of dataset.kiQueryGeneration) {
            const source = resolveScenarioSnapshotSource({
              scenarioId: scenario.input.scenario_id,
              datasetGcs: dataset.gcs,
              snapshotSource: scenario.snapshot_source,
            });

            const availableSnapshots =
              availableSnapshotsBySource.get(snapshotCatalogKey(source.gcs)) ?? new Set();

            if (!availableSnapshots.has(source.snapshotName)) {
              log.info(
                `Snapshot "${source.snapshotName}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}" ` +
                  `(source: ${source.gcs.bucket}/${source.gcs.basePathPrefix}) - skipping`
              );
              continue;
            }

            await cleanSignificantEventsDataStreams(esClient, log);

            for (const name of SIGEVENTS_WIRED_ROOTS) {
              await esClient.indices.deleteDataStream({ name }).catch(() => {});
              await esClient.indices
                .delete({ index: name, ignore_unavailable: true })
                .catch(() => {});
            }

            await ensureStreamsEnabled({ esClient, apiServices, log });

            const extractionScenario = dataset.kiFeatureExtraction.find(
              (item) => item.input.scenario_id === scenario.input.scenario_id
            );
            const canonicalKIs =
              extractionScenario?.output.expected_ground_truth != null
                ? canonicalKIFeaturesFromExpectedGroundTruth({
                    streamName: scenario.input.stream_name,
                    scenarioId: scenario.input.scenario_id,
                    expectedGroundTruth: extractionScenario.output.expected_ground_truth,
                  })
                : [];

            const shouldUseCanonicalKIs =
              kiSource === 'canonical' || (kiSource === 'auto' && canonicalKIs.length > 0);

            const resolvedKIs = shouldUseCanonicalKIs
              ? canonicalKIs
              : await loadKIFeaturesFromSnapshot(
                  esClient,
                  log,
                  source.snapshotName,
                  source.gcs,
                  scenario.input.stream_name
                );

            if (!shouldUseCanonicalKIs && resolvedKIs.length === 0) {
              log.info(
                `No snapshot KIs available for "${source.snapshotName}" - skipping snapshot variant`
              );
              continue;
            }

            const stats = await replayIntoManagedStream(
              esClient,
              log,
              source.snapshotName,
              source.gcs
            );

            if (stats.created === 0) {
              throw new Error(
                `No documents indexed after replaying snapshot "${source.snapshotName}" into managed stream`
              );
            }

            await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });

            const sampleHits = await collectSampleDocuments({
              esClient,
              extractionScenario,
              queryGenerationScenario: scenario,
              log,
            });

            const sampleDocs = sampleHits
              .map((hit) => hit._source)
              .filter((doc): doc is Record<string, unknown> => doc != null);

            const sampleLogs = sampleDocs.map((doc) => extractLogTextFromSourceDoc(doc));

            let kis: Feature[];
            if (shouldUseCanonicalKIs) {
              const computedKIs = getComputedKIFeaturesFromDocs({
                streamName: scenario.input.stream_name,
                docs: sampleDocs,
              });
              kis = [...resolvedKIs, ...computedKIs];
            } else {
              kis = resolvedKIs;
            }

            if (kis.length === 0) {
              const details = shouldUseCanonicalKIs
                ? 'No canonical KIs could be derived from expected_ground_truth.'
                : `No snapshot KIs found for "${source.snapshotName}". Ensure the snapshot includes sigevents-streams-features-<scenario>.`;
              throw new Error(
                `No KIs available for scenario "${scenario.input.scenario_id}". ${details}`
              );
            }

            collectedExamples.push({ scenario, kis, sampleLogs, sampleDocs });
            snapshotSources.set(scenario.input.scenario_id, source);
          }

          if (collectedExamples.length === 0) {
            log.info(`No scenarios available for dataset "${dataset.id}" (${kiSource}) - skipping`);
            evaluate.skip();
          }
        });

        evaluate(
          'KI query generation',
          async ({
            executorClient,
            evaluators,
            esClient,
            inferenceClient,
            logger,
            apiServices,
            traceEsClient,
            log,
            fetch,
          }) => {
            let lastReplayedSnapshot: string | undefined;

            const heavyDataByScenario = new Map(
              collectedExamples.map(({ scenario, kis, sampleLogs, sampleDocs }) => [
                scenario.input.scenario_id,
                { kis, sampleLogs, sampleDocs },
              ])
            );

            const groundingModes = resolveGroundingModes();
            const codeIndex = resolveCodeIndexForDataset(dataset.id);

            const examples = collectedExamples.map(({ scenario }) => ({
              id: scenario.input.scenario_id,
              input: {
                ...scenario.input,
                snapshot_source: scenario.snapshot_source,
              },
              output: {
                ...scenario.output,
                criteria: scenario.output.criteria,
                expected: scenario.output.expected_ground_truth,
              },
              metadata: {
                ...scenario.metadata,
                test_index: MANAGED_STREAM_SEARCH_PATTERN,
              },
            }));

            const evaluatorsList = [
              ...createKIQueryGenerationEvaluators(
                esClient,
                {
                  criteriaFn: evaluators.criteria.bind(evaluators),
                },
                logger
              ),
              evaluators.traceBasedEvaluators.inputTokens,
              evaluators.traceBasedEvaluators.outputTokens,
              evaluators.traceBasedEvaluators.cachedTokens,
              evaluators.traceBasedEvaluators.toolCalls,
              createSpanLatencyEvaluator({ traceEsClient, log, spanName: 'ChatComplete' }),
            ];

            const makeTask = (groundingMode: GroundingMode) => {
              const groundingTools =
                groundingMode === 'grounded' && codeIndex
                  ? createEvalSemanticCodeSearchTools({
                      codeIndex,
                      logger,
                      executeTool: async (toolId, toolParams) =>
                        (await fetch('/api/agent_builder/tools/_execute', {
                          method: 'POST',
                          version: '2023-10-31',
                          body: JSON.stringify({ tool_id: toolId, tool_params: toolParams }),
                        })) as { results?: AgentBuilderToolResult[] },
                    })
                  : undefined;

              return async ({ input }: { input: KIQueryGenerationScenario['input'] }) => {
                const heavy = heavyDataByScenario.get(input.scenario_id);
                if (!heavy) {
                  throw new Error(`No pre-collected data for scenario "${input.scenario_id}"`);
                }
                const { kis, sampleLogs, sampleDocs } = heavy;

                const source = snapshotSources.get(input.scenario_id);
                if (!source) {
                  throw new Error(`No snapshot source found for scenario "${input.scenario_id}"`);
                }

                if (source.snapshotName !== lastReplayedSnapshot) {
                  await cleanSignificantEventsDataStreams(esClient, log);
                  for (const name of ['logs.otel', 'logs.ecs']) {
                    await esClient.indices.deleteDataStream({ name }).catch(() => {});
                    await esClient.indices
                      .delete({ index: name, ignore_unavailable: true })
                      .catch(() => {});
                  }
                  await apiServices.streams.disable().catch(() => {});
                  await apiServices.streams.enable();
                  await replayIntoManagedStream(esClient, log, source.snapshotName, source.gcs);
                  await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });
                  lastReplayedSnapshot = source.snapshotName;
                }

                const { stream: logsStream } = await apiServices.streams.getStreamDefinition(
                  MANAGED_STREAM_NAME
                );

                const stream = {
                  ...logsStream,
                  name: MANAGED_STREAM_SEARCH_PATTERN,
                } as Streams.all.Definition;

                const kiTypeCounts = kis.reduce<Record<string, number>>((counts, ki) => {
                  counts[ki.type] = (counts[ki.type] ?? 0) + 1;
                  return counts;
                }, {});

                logger.info(
                  `[DEBUG] KI query generation input: scenario=${input.scenario_id}, ` +
                    `ki_source=${kiSource}, grounding=${groundingMode}, total_kis=${kis.length}, ` +
                    `ki_types=${JSON.stringify(kiTypeCounts)}, sample_logs=${sampleLogs.length}`
                );

                const { queries, toolUsage } = await generateSignificantEvents({
                  stream,
                  esClient,
                  inferenceClient,
                  logger,
                  signal: new AbortController().signal,
                  systemPrompt: groundingTools
                    ? `${significantEventsPrompt}\n${groundingTools.promptSnippet}`
                    : significantEventsPrompt,
                  getFeatures: async () => kis,
                  additionalTools: groundingTools?.additionalTools,
                  additionalToolCallbacks: groundingTools?.additionalToolCallbacks,
                  maxSteps: groundingTools ? 10 : undefined,
                });

                logger.info(
                  `[DEBUG] Tool usage: get_stream_features calls=${toolUsage.get_stream_features.calls}, failures=${toolUsage.get_stream_features.failures}; add_queries calls=${toolUsage.add_queries.calls}, failures=${toolUsage.add_queries.failures}; generated_queries=${queries.length}`
                );

                return {
                  queries,
                  toolUsage,
                  traceId: getCurrentTraceId(),
                  sample_logs: sampleLogs,
                  sample_docs: sampleDocs,
                  features: kis,
                };
              };
            };

            for (const groundingMode of groundingModes) {
              if (groundingMode === 'grounded' && !codeIndex) {
                log.info(
                  `[${dataset.id}] grounded variant skipped — set KI_QUERY_GENERATION_CODE_INDEX ` +
                    `(or KI_QUERY_GENERATION_CODE_INDICES) to an SCS code index, and ensure the SCS ` +
                    `Agent Builder tools are installed in the cluster.`
                );
                continue;
              }

              await executorClient.runExperiment(
                {
                  datasets: [
                    {
                      name: `sigevents: KI query generation (${dataset.id}) (${kiSource}) [${groundingMode}]`,
                      description: `[${dataset.id}] KI query generation across scenarios (${kiSource}) [${groundingMode}]`,
                      examples,
                    },
                  ],
                  concurrency: 1,
                  trustUpstreamDataset: TRUST_UPSTREAM,
                  task: makeTask(groundingMode),
                },
                evaluatorsList
              );
            }
          }
        );

        evaluate.afterAll(async ({ esClient, apiServices, log }) => {
          log.debug('Cleaning up KI query generation test data');
          await deleteTemporaryReplayIndices(esClient, log);
          await apiServices.streams.disable().catch(() => {});
          await cleanSignificantEventsDataStreams(esClient, log);
        });
      });
    }
  }

  evaluate.describe('empty datastream', () => {
    let emptyDataStreamTestIndex: string | undefined;

    evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
      emptyDataStreamTestIndex = `logs-sig-events-test-${Date.now()}`;
      await ensureStreamsEnabled({ esClient, apiServices, log });
      await esClient.indices.createDataStream({ name: emptyDataStreamTestIndex });
    });

    evaluate(
      'KI query generation',
      async ({ executorClient, evaluators, esClient, inferenceClient, logger, apiServices }) => {
        if (!emptyDataStreamTestIndex) {
          throw new Error('Missing temporary test index for empty datastream evaluation');
        }

        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'sigevents: KI query generation: empty datastream',
                description: 'Significant events KI query generation with empty stream data',
                examples: [
                  {
                    input: {},
                    output: {},
                    metadata: {},
                  },
                ],
              },
            ],
            task: async () => {
              const { stream: streamFromApi } = await apiServices.streams.getStreamDefinition(
                emptyDataStreamTestIndex!
              );

              const { queries } = await generateSignificantEvents({
                stream: streamFromApi as Streams.all.Definition,
                esClient,
                inferenceClient,
                logger,
                signal: new AbortController().signal,
                systemPrompt: significantEventsPrompt,
                getFeatures: async () => [],
              });

              return queries;
            },
          },
          [
            createScenarioCriteriaLlmEvaluator({
              criteriaFn: evaluators.criteria.bind(evaluators),
              criteria: ['Assert the ES|QL queries are generated following the user intent'],
            }),
          ]
        );
      }
    );

    evaluate.afterAll(async ({ esClient, apiServices }) => {
      if (emptyDataStreamTestIndex) {
        await esClient.indices.deleteDataStream({ name: emptyDataStreamTestIndex }).catch(() => {});
      }
      await apiServices.streams.disable().catch(() => {});
    });
  });
});
