/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SIGEVENTS_JUDGE_AGENT_ID } from '@kbn/streams-plugin/server';
import { tags } from '@kbn/scout';
import { getCurrentTraceId } from '@kbn/evals';
import type { Discovery } from '@kbn/significant-events-schema';
import type { GcsConfig } from '../../src/data_generators/replay';
import {
  listAvailableSnapshots,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
  SIGEVENTS_WIRED_ROOTS,
  cleanSignificantEventsDataStreams,
  ensureStreamsEnabled,
  deleteTemporaryReplayIndices,
  canonicalDiscoveryFromGroundTruth,
} from '../../src/data_generators/replay';
import { loadDiscoveriesFromSnapshot } from '../../src/data_generators/load_from_snapshot';
import { replayKnowledgeIndicatorsSnapshot } from '../../src/data_generators/replay_knowledge_indicators_snapshot';
import { evaluate } from '../../src/evaluate';
import {
  getActiveDatasets,
  MANAGED_STREAM_SEARCH_PATTERN,
  resolveScenarioSnapshotSource,
  snapshotCatalogKey,
  snapshotSourceKey,
} from '../../src/datasets';
import type { DiscoveryJudgeScenario } from '../../src/datasets';
import { createJudgeEvaluators } from '../../src/evaluators/discovery';
import { parseSignificantEvents } from '../../src/evaluators/discovery/utils/parse_agent_output';
import { buildJudgeInput } from '../../src/evaluators/discovery/judge/build_agent_input';

const TRUST_UPSTREAM = process.env.SIGEVENTS_TRUST_UPSTREAM === 'true';

evaluate.describe(
  'Significant Events Discovery',
  { tag: tags.serverless.observability.complete },
  () => {
    const activeDatasets = getActiveDatasets();
    const availableSnapshotsBySource = new Map<string, Set<string>>();

    evaluate.beforeAll(async ({ esClient, log }) => {
      const uniqueCatalogSources = new Map<string, GcsConfig>();
      for (const dataset of activeDatasets) {
        for (const scenario of dataset.discoveryJudge) {
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
      if (dataset.discoveryJudge.length === 0) {
        continue;
      }

      for (const source of ['canonical', 'snapshot'] as const) {
        evaluate.describe(`${dataset.id} (${source})`, () => {
          interface CollectedExample {
            scenario: DiscoveryJudgeScenario;
            discoveries: Discovery[];
            snapshotKey: string;
          }

          const collectedExamples: CollectedExample[] = [];
          const snapshotSources = new Map<string, { snapshotName: string; gcs: GcsConfig }>();

          evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
            for (const scenario of dataset.discoveryJudge) {
              const snapshotSource = resolveScenarioSnapshotSource({
                scenarioId: scenario.input.scenario_id,
                datasetGcs: dataset.gcs,
                snapshotSource: scenario.snapshot_source,
              });

              const availableSnapshots =
                availableSnapshotsBySource.get(snapshotCatalogKey(snapshotSource.gcs)) ?? new Set();

              if (!availableSnapshots.has(snapshotSource.snapshotName)) {
                if (source === 'snapshot') {
                  log.info(
                    `Snapshot "${snapshotSource.snapshotName}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}" ` +
                      `(source: ${snapshotSource.gcs.bucket}/${snapshotSource.gcs.basePathPrefix}) — skipping snapshot variant for scenario "${scenario.input.scenario_id}"`
                  );
                  continue;
                }
              }

              let discoveries: Discovery[];

              if (source === 'canonical') {
                discoveries = scenario.input.discoveries.map((discovery) =>
                  canonicalDiscoveryFromGroundTruth({
                    streamName: 'logs',
                    scenarioId: scenario.input.scenario_id,
                    discovery,
                  })
                );
              } else {
                discoveries = await loadDiscoveriesFromSnapshot(
                  esClient,
                  log,
                  snapshotSource.snapshotName,
                  snapshotSource.gcs
                );
                if (discoveries.length === 0) {
                  log.info(
                    `No snapshot discoveries for "${snapshotSource.snapshotName}" — skipping snapshot variant`
                  );
                  continue;
                }
              }

              // Ensure the managed stream is replayed so ES|QL queries in judge can execute
              await cleanSignificantEventsDataStreams(esClient, log);
              for (const name of SIGEVENTS_WIRED_ROOTS) {
                await esClient.indices.deleteDataStream({ name }).catch(() => {});
                await esClient.indices
                  .delete({ index: name, ignore_unavailable: true })
                  .catch(() => {});
              }
              await ensureStreamsEnabled({ esClient, apiServices, log });

              const stats = await replayIntoManagedStream(
                esClient,
                log,
                snapshotSource.snapshotName,
                snapshotSource.gcs
              );

              if (stats.created === 0) {
                log.info(
                  `No documents indexed from snapshot "${snapshotSource.snapshotName}" — skipping`
                );
                continue;
              }

              await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });

              const key = snapshotSourceKey(snapshotSource);
              collectedExamples.push({
                scenario,
                discoveries,
                snapshotKey: key,
              });
              snapshotSources.set(scenario.input.scenario_id, snapshotSource);
            }

            if (collectedExamples.length === 0) {
              log.info(`No scenarios available for dataset "${dataset.id}" (${source}) — skipping`);
              evaluate.skip();
            }
          });

          evaluate(
            'Discovery judge',
            async ({
              executorClient,
              evaluators,
              esClient,
              agentBuilderClient,
              apiServices,
              log,
            }) => {
              let lastReplayedSnapshotKey: string | undefined;

              const discoveriesByScenario = new Map(
                collectedExamples.map(({ scenario, discoveries, snapshotKey }) => [
                  scenario.input.scenario_id,
                  { discoveries, snapshotKey },
                ])
              );

              await executorClient.runExperiment(
                {
                  datasets: [
                    {
                      name: `sigevents: Discovery judge (${dataset.id}) (${source})`,
                      description: `[${dataset.id}] Discovery judge across scenarios (${source})`,
                      examples: collectedExamples.map(({ scenario }) => ({
                        id: scenario.input.scenario_id,
                        input: { ...scenario.input, snapshot_source: scenario.snapshot_source },
                        output: scenario.output,
                        metadata: {
                          ...scenario.metadata,
                          test_index: MANAGED_STREAM_SEARCH_PATTERN,
                        },
                      })),
                    },
                  ],
                  concurrency: 1,
                  trustUpstreamDataset: TRUST_UPSTREAM,
                  task: async ({ input }: { input: DiscoveryJudgeScenario['input'] }) => {
                    const data = discoveriesByScenario.get(input.scenario_id);
                    if (!data) {
                      throw new Error(`No pre-collected data for scenario "${input.scenario_id}"`);
                    }

                    const { discoveries, snapshotKey } = data;
                    const snapshotSource = snapshotSources.get(input.scenario_id);
                    if (!snapshotSource) {
                      throw new Error(
                        `No snapshot source found for scenario "${input.scenario_id}"`
                      );
                    }

                    const agentInput = buildJudgeInput({ discoveries });

                    if (snapshotKey !== lastReplayedSnapshotKey) {
                      await cleanSignificantEventsDataStreams(esClient, log);
                      for (const name of SIGEVENTS_WIRED_ROOTS) {
                        await esClient.indices.deleteDataStream({ name }).catch(() => {});
                        await esClient.indices
                          .delete({ index: name, ignore_unavailable: true })
                          .catch(() => {});
                      }
                      await ensureStreamsEnabled({ esClient, apiServices, log });
                      const stats = await replayIntoManagedStream(
                        esClient,
                        log,
                        snapshotSource.snapshotName,
                        snapshotSource.gcs
                      );
                      if (stats.created === 0) {
                        throw new Error(
                          `No documents indexed after replaying snapshot "${snapshotSource.snapshotName}"`
                        );
                      }
                      await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });
                      lastReplayedSnapshotKey = snapshotKey;
                    }

                    // Replay the captured knowledge indicators (features + queries) into the LIVE KI
                    // data stream so the real search_knowledge_indicators tool resolves them when we
                    // invoke the agent over /converse.
                    await replayKnowledgeIndicatorsSnapshot(
                      esClient,
                      log,
                      snapshotSource.snapshotName,
                      snapshotSource.gcs
                    );

                    const converseResult = await agentBuilderClient.converse({
                      agentId: SIGEVENTS_JUDGE_AGENT_ID,
                      input: agentInput,
                    });

                    return {
                      // The agent returns its result as JSON in the final message (no emit tool /
                      // structured_output on the public converse API); parse it for the evaluators.
                      significantEvents: parseSignificantEvents(converseResult.message),
                      inputDiscoveries: discoveries,
                      // Raw converse steps — the trajectory and grounding evaluators read tool calls.
                      steps: converseResult.steps,
                      // The agent runs inline (local execution), so its gen_ai spans nest under the
                      // eval's trace — tag with that id, like the inferenceClient-based evals. This
                      // keeps trace metrics correlatable against the default cluster (no TRACING_ES_URL).
                      traceId: getCurrentTraceId(),
                    };
                  },
                },
                [
                  ...createJudgeEvaluators({
                    criteriaFn: evaluators.criteria.bind(evaluators),
                  }),
                  evaluators.traceBasedEvaluators.inputTokens,
                  evaluators.traceBasedEvaluators.outputTokens,
                  evaluators.traceBasedEvaluators.cachedTokens,
                  evaluators.traceBasedEvaluators.toolCalls,
                  evaluators.traceBasedEvaluators.latency,
                ]
              );
            }
          );

          evaluate.afterAll(async ({ esClient, apiServices, log }) => {
            log.debug('Cleaning up judge test data');
            await deleteTemporaryReplayIndices(esClient, log);
            await apiServices.streams.disable().catch(() => {});
            await cleanSignificantEventsDataStreams(esClient, log);
          });
        });
      }
    }
  }
);
