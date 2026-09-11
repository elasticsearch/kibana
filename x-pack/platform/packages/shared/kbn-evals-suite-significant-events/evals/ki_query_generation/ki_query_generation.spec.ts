/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  identifyKIQueries,
  QUERY_GENERATION_EXCLUDED_FEATURE_TYPES,
  significantEventsPrompt,
  type AnalysisTarget,
  type ExistingQuerySummary,
} from '@kbn/nightshift-ai';
import {
  createMemoryDiscoveryTools,
  MemoryServiceImpl,
} from '@kbn/significant-events-plugin/server';
import { STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG } from '@kbn/significant-events-plugin/common';
import { tags } from '@kbn/scout';

import {
  getCurrentTraceId,
  createSpanLatencyEvaluator,
  createChatCallsEvaluator,
  buildModelFromConnector,
} from '@kbn/evals';
import { getSourcesForStream, getStreamSamplingSource, type Streams } from '@kbn/streams-schema';
import type { Feature } from '@kbn/significant-events-schema';
import { createReportedTokenEvaluators } from '../../src/evaluators/reported_tokens';
import {
  assertRerunRequiresCanonicalKIs,
  buildQueryGenerationExamples,
  type CollectedQueryGenExample,
} from './build_query_gen_examples';
import type { GcsConfig } from '../../src/data_generators/replay';
import {
  canonicalKIFeaturesFromExpectedGroundTruth,
  cleanSignificantEventsDataStreams,
  deleteTemporaryReplayIndices,
  ensureStreamsEnabled,
  loadKIFeaturesFromSnapshot,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
  SIGEVENTS_WIRED_ROOTS,
} from '../../src/data_generators/replay';
import { evaluate } from '../../src/evaluate';
import { createEvalSignificantEventSearchTool } from '../../src/tools/significant_event_search_tool';
import { createKIQueryGenerationEvaluators } from '../../src/evaluators/ki_query_generation';
import {
  getActiveDatasets,
  MANAGED_STREAM_NAME,
  MANAGED_STREAM_SEARCH_PATTERN,
  resolveScenarioSnapshotSource,
  snapshotCatalogKey,
  type KIQueryGenerationScenario,
} from '../../src/datasets';
import { buildAvailableSnapshotsBySource } from '../shared';
import { KI_FEATURE_SOURCES_TO_RUN } from './resolve_ki_sources';
import { resolveMaxSteps } from './resolve_max_steps';
import {
  assertQueryGenerationDatasetSafety,
  resolveQueryGenerationDatasets,
  resolveQueryGenerationDatasetName,
} from './resolve_scenarios';
import { getEmptyDatastreamEvaluators, selectQueryGenerationEvaluators } from './select_evaluators';
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

const EMPTY_DATASTREAM_MAX_STEPS = 4;

evaluate.describe('KI query generation', { tag: tags.serverless.observability.complete }, () => {
  const scenarioResolution = resolveQueryGenerationDatasets(getActiveDatasets());
  const activeDatasets = scenarioResolution.datasets;
  const availableSnapshotsBySource = new Map<string, Set<string>>();

  assertQueryGenerationDatasetSafety(scenarioResolution, TRUST_UPSTREAM);

  evaluate.beforeAll(async ({ esClient, kbnClient, log }) => {
    // The significant_event_search tool is only registered when significant
    // events availability is on (defaults to false); enable it before any run.
    await kbnClient.request({
      path: '/internal/core/_settings',
      method: 'PUT',
      headers: { 'elastic-api-version': '1' },
      body: {
        'feature_flags.overrides': {
          [STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG]: true,
        },
      },
    });
    log.info('Enabled significant events availability feature flag');

    const snapshots = await buildAvailableSnapshotsBySource(
      activeDatasets,
      (dataset) => dataset.kiQueryGeneration,
      esClient,
      log
    );
    snapshots.forEach((v, k) => availableSnapshotsBySource.set(k, v));
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

            assertRerunRequiresCanonicalKIs(scenario, canonicalKIs);

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
            connector,
            evaluationConnector,
            repetitions,
          }) => {
            let lastReplayedSnapshot: string | undefined;
            const maxStepsOverride = resolveMaxSteps();

            const heavyDataByScenario = new Map(
              collectedExamples.map(({ scenario, kis, sampleLogs, sampleDocs }) => [
                scenario.input.scenario_id,
                { kis, sampleLogs, sampleDocs },
              ])
            );

            // Exercise the same grounding tools that production query generation
            // wires in, so the eval covers the memory + prior-SigEvents code paths.
            const memoryTools = createMemoryDiscoveryTools({
              memoryService: new MemoryServiceImpl({ logger: logger.get('memory'), esClient }),
            });

            const executeAgentBuilderTool = async (
              toolId: string,
              toolParams: Record<string, unknown>
            ) =>
              (await fetch('/api/agent_builder/tools/_execute', {
                method: 'POST',
                version: '2023-10-31',
                body: JSON.stringify({ tool_id: toolId, tool_params: toolParams }),
              })) as { results?: AgentBuilderToolResult[] };

            const eventSearchTool = createEvalSignificantEventSearchTool({
              executeTool: executeAgentBuilderTool,
              streamName: MANAGED_STREAM_NAME,
              logger,
            });

            const groundingModes = resolveGroundingModes();
            const codeIndex = resolveCodeIndexForDataset(dataset.id);

            const examples = buildQueryGenerationExamples(
              collectedExamples,
              MANAGED_STREAM_SEARCH_PATTERN
            );

            const evaluatorsList = selectQueryGenerationEvaluators([
              ...createKIQueryGenerationEvaluators(
                esClient,
                {
                  criteriaFn: evaluators.criteria.bind(evaluators),
                },
                logger
              ),
              ...createReportedTokenEvaluators(),
              evaluators.traceBasedEvaluators.inputTokens,
              evaluators.traceBasedEvaluators.outputTokens,
              evaluators.traceBasedEvaluators.cachedTokens,
              evaluators.traceBasedEvaluators.toolCalls,
              createChatCallsEvaluator({ traceEsClient, log }),
              createSpanLatencyEvaluator({ traceEsClient, log, operationName: 'chat' }),
            ]);

            const makeTask = (groundingMode: GroundingMode, effectiveMaxSteps: number) => {
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

              return async ({
                input,
              }: {
                input: KIQueryGenerationScenario['input'] & {
                  existing_queries?: ExistingQuerySummary[];
                };
              }) => {
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
                const target: AnalysisTarget = {
                  id: stream.name,
                  name: stream.name,
                  description: stream.description,
                  sources: getSourcesForStream(stream),
                  samplingSource: getStreamSamplingSource(stream),
                };

                const kiTypeCounts = kis.reduce<Record<string, number>>((counts, ki) => {
                  counts[ki.type] = (counts[ki.type] ?? 0) + 1;
                  return counts;
                }, {});

                logger.info(
                  `[DEBUG] KI query generation input: scenario=${input.scenario_id}, ` +
                    `ki_source=${kiSource}, grounding=${groundingMode}, total_kis=${kis.length}, ` +
                    `ki_types=${JSON.stringify(kiTypeCounts)}, sample_logs=${sampleLogs.length}`
                );

                const promptSnippet = [
                  groundingTools?.promptSnippet,
                  memoryTools.promptSnippet,
                  eventSearchTool.promptSnippet,
                ]
                  .filter(Boolean)
                  .join('\n');

                const { queries, toolUsage, tokensUsed, queryAttempts, reasoningDiagnostics } =
                  await identifyKIQueries({
                    target,
                    esClient,
                    inferenceClient,
                    logger,
                    signal: new AbortController().signal,
                    systemPrompt: `${significantEventsPrompt}\n${promptSnippet}`,
                    // Mirror production: the plugin excludes these at retrieval,
                    // but the fixture still builds them — filter here to match.
                    getFeatures: async () =>
                      kis.filter(
                        (feature) =>
                          !(QUERY_GENERATION_EXCLUDED_FEATURE_TYPES as readonly string[]).includes(
                            feature.type
                          )
                      ),
                    additionalTools: {
                      ...memoryTools.tools,
                      ...eventSearchTool.tools,
                      ...groundingTools?.additionalTools,
                    },
                    additionalToolCallbacks: {
                      ...memoryTools.callbacks,
                      ...eventSearchTool.callbacks,
                      ...groundingTools?.additionalToolCallbacks,
                    },
                    maxSteps: effectiveMaxSteps,
                    requireQueryIntent: true,
                    collectQueryAttempts: true,
                    existingQueries: input.existing_queries?.map((q) => ({
                      ...q,
                      description: q.description.slice(0, 200),
                    })),
                  });

                logger.info(
                  `[DEBUG] Tool usage: get_stream_features calls=${toolUsage.get_stream_features.calls}, failures=${toolUsage.get_stream_features.failures}; add_queries calls=${toolUsage.add_queries.calls}, failures=${toolUsage.add_queries.failures}; generated_queries=${queries.length}`
                );

                return {
                  queries,
                  toolUsage,
                  tokens_used: tokensUsed,
                  query_attempts: queryAttempts,
                  reasoning_diagnostics: reasoningDiagnostics,
                  evaluation_arm: input.existing_queries ? ('rerun' as const) : ('clean' as const),
                  traceId: getCurrentTraceId(),
                  ki_source: kiSource,
                  grounding_mode: groundingMode,
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

              const effectiveMaxSteps = maxStepsOverride ?? (groundingMode === 'grounded' ? 12 : 8);

              logger.info(
                `QUERY_GENERATION_EVAL_CONFIG ${JSON.stringify({
                  dataset: dataset.id,
                  ki_source: kiSource,
                  grounding: groundingMode,
                  scenario_ids: dataset.kiQueryGeneration.map(
                    (scenario) => scenario.input.scenario_id
                  ),
                  example_ids: examples.map((example) => example.id),
                  evaluator_names: evaluatorsList.map((evaluator) => evaluator.name),
                  effective_max_steps: effectiveMaxSteps,
                  repetitions,
                  generation_model: buildModelFromConnector(connector).id,
                  judge_model: buildModelFromConnector(evaluationConnector).id,
                })}`
              );

              const canonicalDatasetName = `sigevents: KI query generation (${dataset.id}) (${kiSource}) [${groundingMode}]`;
              const datasetName = resolveQueryGenerationDatasetName(
                scenarioResolution,
                canonicalDatasetName
              );
              const description = scenarioResolution.isFocused
                ? `[${dataset.id}] KI query generation across scenarios (${kiSource}) [${groundingMode}] ` +
                  `focused=${scenarioResolution.selectedScenarioIds.join(',')}`
                : `[${dataset.id}] KI query generation across scenarios (${kiSource}) [${groundingMode}]`;

              await executorClient.runExperiment(
                {
                  datasets: [
                    {
                      name: datasetName,
                      description,
                      examples,
                    },
                  ],
                  concurrency: 1,
                  trustUpstreamDataset: TRUST_UPSTREAM,
                  task: makeTask(groundingMode, effectiveMaxSteps),
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
      async ({
        executorClient,
        esClient,
        inferenceClient,
        logger,
        apiServices,
        connector,
        evaluationConnector,
        repetitions,
      }) => {
        if (!emptyDataStreamTestIndex) {
          throw new Error('Missing temporary test index for empty datastream evaluation');
        }

        const emptyDatastreamEvaluators = getEmptyDatastreamEvaluators();
        logger.info(
          `QUERY_GENERATION_EVAL_CONFIG ${JSON.stringify({
            dataset: 'empty-datastream',
            ki_source: 'none',
            grounding: 'baseline',
            scenario_ids: ['empty-datastream'],
            example_ids: ['empty-datastream'],
            evaluator_names: emptyDatastreamEvaluators.map((evaluator) => evaluator.name),
            effective_max_steps: EMPTY_DATASTREAM_MAX_STEPS,
            repetitions,
            generation_model: buildModelFromConnector(connector).id,
            judge_model: buildModelFromConnector(evaluationConnector).id,
          })}`
        );

        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'sigevents: KI query generation: empty datastream',
                description: 'Significant events KI query generation with empty stream data',
                examples: [
                  {
                    id: 'empty-datastream',
                    input: {},
                    output: { expect_queries: false },
                    metadata: {},
                  },
                ],
              },
            ],
            task: async () => {
              const { stream: streamFromApi } = await apiServices.streams.getStreamDefinition(
                emptyDataStreamTestIndex!
              );
              const emptyStream = streamFromApi as Streams.all.Definition;

              const { queries, queryAttempts, toolUsage, reasoningDiagnostics } =
                await identifyKIQueries({
                  target: {
                    id: emptyStream.name,
                    name: emptyStream.name,
                    description: emptyStream.description,
                    sources: getSourcesForStream(emptyStream),
                    samplingSource: getStreamSamplingSource(emptyStream),
                  },
                  esClient,
                  inferenceClient,
                  logger,
                  signal: new AbortController().signal,
                  systemPrompt: significantEventsPrompt,
                  getFeatures: async () => [],
                  maxSteps: EMPTY_DATASTREAM_MAX_STEPS,
                  collectQueryAttempts: true,
                });

              return {
                queries,
                query_attempts: queryAttempts,
                toolUsage,
                reasoning_diagnostics: reasoningDiagnostics,
                traceId: getCurrentTraceId(),
                ki_source: 'none' as const,
                grounding_mode: 'baseline' as const,
              };
            },
          },
          // The empty-stream safety canary always runs its mandatory deterministic
          // evaluator. Evaluator-selection variables must never disable this canary.
          emptyDatastreamEvaluators
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
