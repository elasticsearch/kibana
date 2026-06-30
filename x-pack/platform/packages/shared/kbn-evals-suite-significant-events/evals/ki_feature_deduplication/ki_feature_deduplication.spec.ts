/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { identifyFeatures, toPreviouslyIdentifiedFeature } from '@kbn/streams-ai';
import { featuresPrompt } from '@kbn/streams-ai/src/features/prompt';
import { tags } from '@kbn/scout';
import { createSpanLatencyEvaluator, getCurrentTraceId } from '@kbn/evals';
import { FeatureAccumulator, type BaseFeature, mergeFeature } from '@kbn/significant-events-schema';
import type { GcsConfig } from '../../src/data_generators/replay';
import {
  SIGEVENTS_SNAPSHOT_RUN,
  cleanSignificantEventsDataStreams,
  listAvailableSnapshots,
  replaySignificantEventsSnapshot,
} from '../../src/data_generators/replay';
import { evaluate } from '../../src/evaluate';
import {
  createSemanticUniquenessEvaluator,
  createMergeCorrectnessEvaluator,
  createIdReuseEvaluator,
} from '../../src/evaluators/ki_feature_deduplication/evaluators';
import {
  getActiveDatasets,
  MANAGED_STREAM_NAME,
  MANAGED_STREAM_SEARCH_PATTERN,
  resolveScenarioSnapshotSource,
  snapshotCatalogKey,
  type KIFeatureExtractionScenario,
  type KIFeatureDeduplicationScenario,
} from '../../src/datasets';
import { collectSampleDocuments } from '../ki_feature_extraction/collect_sample_documents';

interface AvailableDeduplicationScenario {
  scenario: KIFeatureDeduplicationScenario;
  extractionScenario: KIFeatureExtractionScenario;
}

evaluate.describe(
  'KI feature deduplication',
  { tag: tags.serverless.observability.complete },
  () => {
    const activeDatasets = getActiveDatasets();
    const availableSnapshotsBySource = new Map<string, Set<string>>();

    evaluate.beforeAll(async ({ esClient, log }) => {
      const uniqueCatalogSources = new Map<string, GcsConfig>();
      for (const dataset of activeDatasets) {
        for (const scenario of dataset.kiFeatureDeduplication) {
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
      evaluate.describe(dataset.id, () => {
        const availableScenarios: AvailableDeduplicationScenario[] = [];
        const snapshotSources = new Map<string, { snapshotName: string; gcs: GcsConfig }>();

        evaluate.beforeAll(async ({ log }) => {
          for (const scenario of dataset.kiFeatureDeduplication) {
            const extractionScenario = dataset.kiFeatureExtraction.find(
              (s) => s.input.scenario_id === scenario.input.scenario_id
            );
            if (!extractionScenario) {
              throw new Error(
                `KI feature deduplication scenario "${scenario.input.scenario_id}" in dataset "${dataset.id}" ` +
                  `has no matching KI feature extraction scenario (needed for sample document collection)`
              );
            }

            const source = resolveScenarioSnapshotSource({
              scenarioId: scenario.input.scenario_id,
              datasetGcs: dataset.gcs,
              snapshotSource: scenario.snapshot_source,
            });

            const available =
              availableSnapshotsBySource.get(snapshotCatalogKey(source.gcs)) ?? new Set();

            if (!available.has(source.snapshotName)) {
              log.info(
                `Snapshot "${source.snapshotName}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}" ` +
                  `(source: ${source.gcs.bucket}/${source.gcs.basePathPrefix}) - skipping`
              );
              continue;
            }

            availableScenarios.push({ scenario, extractionScenario });
            snapshotSources.set(scenario.input.scenario_id, source);
          }

          if (availableScenarios.length === 0) {
            log.info(`No scenarios available for dataset "${dataset.id}" - skipping`);
            evaluate.skip();
          }
        });

        evaluate(
          'KI feature deduplication',
          async ({
            esClient,
            inferenceClient,
            evaluators,
            evaluationConnector,
            logger,
            executorClient,
            traceEsClient,
            log,
          }) => {
            const evaluatorInferenceClient = inferenceClient.bindTo({
              connectorId: evaluationConnector.id,
            });

            const extractionScenariosByScenarioId = new Map(
              availableScenarios.map(({ scenario, extractionScenario }) => [
                scenario.input.scenario_id,
                extractionScenario,
              ])
            );

            let lastReplayedSnapshot: string | undefined;

            await executorClient.runExperiment(
              {
                datasets: [
                  {
                    name: `sigevents: KI feature deduplication (${dataset.id})`,
                    description: `[${dataset.id}] KI feature deduplication across scenarios`,
                    examples: availableScenarios.map(({ scenario }) => ({
                      id: scenario.input.scenario_id,
                      input: {
                        scenario_id: scenario.input.scenario_id,
                        stream_name: MANAGED_STREAM_NAME,
                        iterations: scenario.input.iterations,
                      },
                    })),
                  },
                ],
                concurrency: 1,
                task: async ({
                  input,
                }: {
                  input: {
                    scenario_id: string;
                    stream_name: string;
                    iterations: number;
                  };
                }) => {
                  const source = snapshotSources.get(input.scenario_id);
                  if (!source) {
                    throw new Error(`No snapshot source found for scenario "${input.scenario_id}"`);
                  }
                  if (source.snapshotName !== lastReplayedSnapshot) {
                    await cleanSignificantEventsDataStreams(esClient, log);
                    await replaySignificantEventsSnapshot(
                      esClient,
                      log,
                      source.snapshotName,
                      source.gcs
                    );
                    await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });
                    lastReplayedSnapshot = source.snapshotName;
                  }

                  const extractionScenario = extractionScenariosByScenarioId.get(input.scenario_id);
                  if (!extractionScenario) {
                    throw new Error(
                      `No extraction scenario found for scenario "${input.scenario_id}"`
                    );
                  }

                  const iterations: Array<{
                    features: BaseFeature[];
                    previousFeatureCount: number;
                  }> = [];
                  const accumulated = new FeatureAccumulator();
                  const mergeEvents = [];
                  const fingerprintOnlyMergeEvents = [];

                  for (let i = 0; i < input.iterations; i++) {
                    const sampleDocuments = await collectSampleDocuments({
                      esClient,
                      scenario: extractionScenario,
                      log,
                    });

                    const previouslyIdentifiedFeatures = accumulated
                      .getAll()
                      .map(toPreviouslyIdentifiedFeature);

                    const { features: identifiedFeatures } = await identifyFeatures({
                      streamName: input.stream_name,
                      sampleDocuments,
                      systemPrompt: featuresPrompt,
                      inferenceClient,
                      logger,
                      signal: new AbortController().signal,
                      previouslyIdentifiedFeatures,
                    });

                    iterations.push({
                      features: identifiedFeatures,
                      previousFeatureCount: previouslyIdentifiedFeatures.length,
                    });

                    for (const baseFeature of identifiedFeatures) {
                      const existing = accumulated.findDuplicate(baseFeature);
                      if (existing) {
                        if (existing.id.toLowerCase() === baseFeature.id.toLowerCase()) {
                          mergeEvents.push({ existing, incoming: baseFeature });
                        } else {
                          fingerprintOnlyMergeEvents.push({ existing, incoming: baseFeature });
                        }
                        const merged = mergeFeature(existing, baseFeature);

                        accumulated.update(merged);
                      } else {
                        accumulated.add(baseFeature);
                      }
                    }
                  }

                  return {
                    iterations,
                    mergeEvents,
                    fingerprintOnlyMergeEvents,
                    finalFeatures: accumulated.getAll(),
                    traceId: getCurrentTraceId(),
                  };
                },
              },
              [
                createSemanticUniquenessEvaluator({
                  inferenceClient: evaluatorInferenceClient,
                }),
                createMergeCorrectnessEvaluator({
                  inferenceClient: evaluatorInferenceClient,
                }),
                createIdReuseEvaluator(),
                evaluators.traceBasedEvaluators.inputTokens,
                evaluators.traceBasedEvaluators.outputTokens,
                evaluators.traceBasedEvaluators.cachedTokens,
                createSpanLatencyEvaluator({ traceEsClient, log, spanName: 'ChatComplete' }),
              ]
            );
          }
        );

        evaluate.afterAll(async ({ esClient, log }) => {
          log.debug('Cleaning replayed logs and index template');
          await cleanSignificantEventsDataStreams(esClient, log);
        });
      });
    }
  }
);
