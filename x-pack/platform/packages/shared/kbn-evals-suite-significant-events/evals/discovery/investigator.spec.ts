/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SIGEVENTS_INVESTIGATOR_AGENT_ID } from '@kbn/streams-plugin/server';
import { tags } from '@kbn/scout';
import { getCurrentTraceId } from '@kbn/evals';
import type { DefaultEvaluators, Evaluator } from '@kbn/evals';
import type { Detection, Discovery } from '@kbn/significant-events-schema';

import type { GcsConfig } from '../../src/data_generators/replay';
import {
  listAvailableSnapshots,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
  SIGEVENTS_WIRED_ROOTS,
  cleanSignificantEventsDataStreams,
  ensureStreamsEnabled,
  deleteTemporaryReplayIndices,
  canonicalDetectionsFromGroundTruth,
} from '../../src/data_generators/replay';
import { loadDetectionsFromSnapshot } from '../../src/data_generators/load_from_snapshot';
import { replayKnowledgeIndicatorsSnapshot } from '../../src/data_generators/replay_knowledge_indicators_snapshot';
import { evaluate } from '../../src/evaluate';
import {
  getActiveDatasets,
  MANAGED_STREAM_SEARCH_PATTERN,
  resolveScenarioSnapshotSource,
  snapshotCatalogKey,
  snapshotSourceKey,
} from '../../src/datasets';
import type { DiscoveryInvestigatorScenario } from '../../src/datasets';
import {
  createInvestigatorEvaluators,
  createContinuationEvaluators,
} from '../../src/evaluators/discovery';
import { parseDiscoveries } from '../../src/evaluators/discovery/utils/parse_agent_output';
import { buildInvestigatorInput } from '../../src/evaluators/discovery/investigator/build_agent_input';
import {
  toContinuationCandidate,
  mergeContinuationCandidates,
} from '../../src/evaluators/discovery/investigator/continuation/continuation_candidate';
import type { ContinuationCycle } from '../../src/evaluators/discovery/investigator/continuation/continuation_stability';

const TRUST_UPSTREAM = process.env.SIGEVENTS_TRUST_UPSTREAM === 'true';

/** Standard trace-based cost/latency evaluators (tokens, tool calls, latency). */
const traceCostEvaluators = (t: DefaultEvaluators['traceBasedEvaluators']): Evaluator[] => [
  t.inputTokens,
  t.outputTokens,
  t.cachedTokens,
  t.toolCalls,
  t.latency,
];

evaluate.describe(
  'Significant Events Discovery',
  { tag: tags.serverless.observability.complete },
  () => {
    const activeDatasets = getActiveDatasets();
    const availableSnapshotsBySource = new Map<string, Set<string>>();

    evaluate.beforeAll(async ({ esClient, kbnClient, log }) => {
      // Agent availability is gated on this UI setting (cached per space); enable before any converse.
      await kbnClient.uiSettings.update({ 'observability:streamsEnableSignificantEvents': true });
      log.info('Enabled significant events UI setting');

      const uniqueCatalogSources = new Map<string, GcsConfig>();
      for (const dataset of activeDatasets) {
        for (const scenario of dataset.discoveryInvestigator) {
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
      if (dataset.discoveryInvestigator.length === 0) {
        continue;
      }

      for (const source of ['canonical', 'snapshot'] as const) {
        evaluate.describe(`${dataset.id} (${source})`, () => {
          interface CollectedExample {
            scenario: DiscoveryInvestigatorScenario;
            detections: Detection[];
            snapshotKey: string;
          }

          const collectedExamples: CollectedExample[] = [];
          const snapshotSources = new Map<string, { snapshotName: string; gcs: GcsConfig }>();

          evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
            for (const scenario of dataset.discoveryInvestigator) {
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

              let detections: Detection[];

              if (source === 'canonical') {
                detections = canonicalDetectionsFromGroundTruth({
                  streamName: scenario.input.stream_name,
                  rules: scenario.input.detections,
                });
              } else {
                detections = await loadDetectionsFromSnapshot(
                  esClient,
                  log,
                  snapshotSource.snapshotName,
                  snapshotSource.gcs,
                  { kinds: ['detection', 'quiet'] }
                );
                if (detections.length === 0) {
                  log.info(
                    `No snapshot detections for "${snapshotSource.snapshotName}" — skipping snapshot variant`
                  );
                  continue;
                }
              }

              // Ensure KI features index is available by replaying the snapshot
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
              collectedExamples.push({ scenario, detections, snapshotKey: key });
              snapshotSources.set(scenario.input.scenario_id, snapshotSource);
            }

            if (collectedExamples.length === 0) {
              log.info(`No scenarios available for dataset "${dataset.id}" (${source}) — skipping`);
              evaluate.skip();
            }
          });

          evaluate(
            'Discovery investigator',
            async ({
              executorClient,
              evaluators,
              esClient,
              agentBuilderClient,
              apiServices,
              log,
            }) => {
              let lastReplayedSnapshotKey: string | undefined;

              const detectionsByScenario = new Map(
                collectedExamples.map(({ scenario, detections, snapshotKey }) => [
                  scenario.input.scenario_id,
                  { detections, snapshotKey },
                ])
              );

              await executorClient.runExperiment(
                {
                  datasets: [
                    {
                      name: `sigevents: Discovery investigator (${dataset.id}) (${source})`,
                      description: `[${dataset.id}] investigator agent across scenarios (${source})`,
                      examples: collectedExamples.map(({ scenario }) => ({
                        id: scenario.input.scenario_id,
                        input: { ...scenario.input, snapshot_source: scenario.snapshot_source },
                        output: { ...scenario.output, criteria: scenario.output.criteria },
                        metadata: {
                          ...scenario.metadata,
                          test_index: MANAGED_STREAM_SEARCH_PATTERN,
                        },
                      })),
                    },
                  ],
                  concurrency: 1,
                  trustUpstreamDataset: TRUST_UPSTREAM,
                  task: async ({ input }: { input: DiscoveryInvestigatorScenario['input'] }) => {
                    const data = detectionsByScenario.get(input.scenario_id);
                    if (!data) {
                      throw new Error(`No pre-collected data for scenario "${input.scenario_id}"`);
                    }

                    const { detections, snapshotKey } = data;
                    const snapshotSource = snapshotSources.get(input.scenario_id);
                    if (!snapshotSource) {
                      throw new Error(
                        `No snapshot source found for scenario "${input.scenario_id}"`
                      );
                    }

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

                    // Replay captured KIs into the live KI stream so search_knowledge_indicators
                    // resolves them over /converse.
                    await replayKnowledgeIndicatorsSnapshot(
                      esClient,
                      log,
                      snapshotSource.snapshotName,
                      snapshotSource.gcs
                    );

                    // Same message shape as the production batch.
                    const agentInput = buildInvestigatorInput({
                      episodeSuffix: Date.now().toString(36).slice(-8),
                      detections,
                      continuationCandidates: input.continuation_candidates ?? [],
                    });

                    const converseResult = await agentBuilderClient.converse({
                      agentId: SIGEVENTS_INVESTIGATOR_AGENT_ID,
                      input: agentInput,
                    });

                    return {
                      // Agent returns JSON in the final message (no emit tool on converse); parse it.
                      discoveries: parseDiscoveries(converseResult.message),
                      // Thread the input detections through so snapshot-mode evaluators can access them.
                      inputDetections: detections,
                      // Raw steps — trajectory/grounding evaluators read tool calls from these.
                      steps: converseResult.steps,
                      // Agent runs inline, so its gen_ai spans nest under the eval's trace.
                      traceId: getCurrentTraceId(),
                    };
                  },
                },
                [
                  ...createInvestigatorEvaluators({
                    criteriaFn: evaluators.criteria.bind(evaluators),
                  }),
                  ...traceCostEvaluators(evaluators.traceBasedEvaluators),
                ]
              );
            }
          );

          // Continuation over time — does a re-arriving incident fold into ONE slug? We grade three
          // matchers per scenario: rule-UUID re-detection (same rule re-fires) plus the declared
          // `semantic` and `cascade` chains (different rules, same episode). One experiment example
          // per (scenario × path); each chain is ground truth, so slug reuse is the correct answer
          // and minting a new slug is the defect ("slug proliferation is a defect").
          evaluate(
            'Discovery investigator — continuation over time',
            async ({
              executorClient,
              evaluators,
              esClient,
              agentBuilderClient,
              apiServices,
              log,
            }) => {
              // One run per (scenario × path): rule-uuid re-fires the anchor; semantic/cascade resolve
              // the declared ordered rule_name chain to detections. Keep runs with ≥2 cycles (one
              // establishing + one gradable follow-up).
              const runs = collectedExamples.flatMap(({ scenario, detections, snapshotKey }) => {
                if (detections.length === 0) return [];
                const byRuleName = new Map(detections.map((d) => [d.rule_name, d]));

                const plans: Array<{ path: string; sequence: Detection[] }> = [
                  { path: 'rule-uuid', sequence: [detections[0], detections[0]] },
                  ...Object.entries(scenario.continuationChains ?? {}).map(([path, ruleNames]) => ({
                    path,
                    sequence: ruleNames
                      .map((name) => byRuleName.get(name))
                      .filter((d): d is Detection => Boolean(d)),
                  })),
                ].filter((plan) => plan.sequence.length >= 2);

                return plans.map((plan) => ({
                  id: `${scenario.input.scenario_id}__${plan.path}`,
                  scenario,
                  sequence: plan.sequence,
                  snapshotKey,
                }));
              });

              if (runs.length === 0) {
                log.info(`No gradable continuation runs for dataset "${dataset.id}" — skipping`);
                evaluate.skip();
                return;
              }

              const runById = new Map(runs.map((run) => [run.id, run]));
              let lastReplayedSnapshotKey: string | undefined;

              await executorClient.runExperiment(
                {
                  datasets: [
                    {
                      name: `sigevents: Discovery investigator continuation (${dataset.id})`,
                      description: `[${dataset.id}] investigator folds a re-arriving incident into one slug across rule-UUID re-detection and the declared semantic/cascade chains`,
                      examples: runs.map((run) => ({
                        id: run.id,
                        input: {
                          ...run.scenario.input,
                          snapshot_source: run.scenario.snapshot_source,
                          continuation_run: run.id,
                        },
                        output: {},
                        metadata: {
                          ...run.scenario.metadata,
                          test_index: MANAGED_STREAM_SEARCH_PATTERN,
                        },
                      })),
                    },
                  ],
                  concurrency: 1,
                  trustUpstreamDataset: TRUST_UPSTREAM,
                  task: async ({
                    input,
                  }: {
                    input: DiscoveryInvestigatorScenario['input'] & { continuation_run: string };
                  }) => {
                    const run = runById.get(input.continuation_run);
                    if (!run) {
                      throw new Error(`No continuation run "${input.continuation_run}"`);
                    }

                    const snapshotSource = snapshotSources.get(input.scenario_id);
                    if (!snapshotSource) {
                      throw new Error(
                        `No snapshot source found for scenario "${input.scenario_id}"`
                      );
                    }

                    if (run.snapshotKey !== lastReplayedSnapshotKey) {
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
                      lastReplayedSnapshotKey = run.snapshotKey;
                    }

                    await replayKnowledgeIndicatorsSnapshot(
                      esClient,
                      log,
                      snapshotSource.snapshotName,
                      snapshotSource.gcs
                    );

                    const cycles: ContinuationCycle[] = [];
                    let continuationCandidates: Array<Partial<Discovery>> = [];

                    // Feed one detection per cycle, oldest first, threading prior discoveries back as
                    // candidates. A fresh detection_id per firing simulates re-arrival (and lets the
                    // rule-uuid path re-fire the same rule); a unique episode suffix per cycle makes any
                    // wrongly-minted slug observable.
                    for (let i = 0; i < run.sequence.length; i++) {
                      const base = run.sequence[i];
                      const detection: Detection = {
                        ...base,
                        detection_id: `${base.detection_id ?? base.rule_uuid}-fire-${i}`,
                      };
                      const agentInput = buildInvestigatorInput({
                        episodeSuffix: `${Date.now().toString(36).slice(-6)}${i}`,
                        detections: [detection],
                        continuationCandidates,
                      });

                      const converseResult = await agentBuilderClient.converse({
                        agentId: SIGEVENTS_INVESTIGATOR_AGENT_ID,
                        input: agentInput,
                      });

                      const discoveries = parseDiscoveries(converseResult.message);
                      const producedSlugs = discoveries
                        .map((discovery) => discovery.discovery_slug)
                        .filter((slug): slug is string => Boolean(slug));

                      cycles.push({ ruleName: detection.rule_name, producedSlugs });

                      // Thread produced discoveries into the next cycle's candidates, latest per slug.
                      const produced = discoveries.map((discovery, idx) =>
                        toContinuationCandidate({
                          discovery,
                          discoveryId: `${discovery.discovery_slug ?? 'unknown'}-cycle-${i}-${idx}`,
                        })
                      );
                      continuationCandidates = mergeContinuationCandidates([
                        ...continuationCandidates,
                        ...produced,
                      ]);
                    }

                    return { cycles, traceId: getCurrentTraceId() };
                  },
                },
                [
                  // Task returns a slug trajectory (not discoveries/steps), so only the continuation
                  // check applies; trace-based evaluators aggregate cost across all cycles.
                  ...createContinuationEvaluators(),
                  ...traceCostEvaluators(evaluators.traceBasedEvaluators),
                ]
              );
            }
          );

          evaluate.afterAll(async ({ esClient, apiServices, log }) => {
            log.debug('Cleaning up investigator test data');
            await deleteTemporaryReplayIndices(esClient, log);
            await apiServices.streams.disable().catch(() => {});
            await cleanSignificantEventsDataStreams(esClient, log);
          });
        });
      }
    }
  }
);
