/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import {
  DEFAULT_ALERTS_SNAPSHOT_CONFIG,
  resolveAlertsSnapshotConfig,
  restoreAlertsSnapshot,
} from '@kbn/security-evals-alerts-snapshot';
import { evaluate } from '../../src/evaluate';
import { loadAttackDiscoveryBundledAlertsJsonlDataset } from '../../src/dataset/load_attack_discovery_jsonl';
import { negativeCases } from '../../src/datasets/negative_cases';
import { runAttackDiscovery } from '../../src/task/run_attack_discovery';

const ALERTS_SNAPSHOT_ENV_PREFIX = 'ATTACK_DISCOVERY_ALERTS_SNAPSHOT';

const DEFAULT_DATASET_NAME = 'Attack Discovery All Scenarios';
const DEFAULT_DATASET_DESCRIPTION =
  'Attack Discovery evaluation dataset (all scenarios). Resolved from golden cluster.';

const resolveDatasetName = (): string =>
  process.env.ATTACK_DISCOVERY_DATASET_NAME || DEFAULT_DATASET_NAME;

const resolveDatasetLimit = (): number | undefined => {
  const raw = process.env.ATTACK_DISCOVERY_DATASET_LIMIT;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
};

const resolveDatasetOffset = (): number | undefined => {
  const raw = process.env.ATTACK_DISCOVERY_DATASET_OFFSET;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
};

/**
 * When ATTACK_DISCOVERY_DATASET_JSONL_PATH is set, load from local JSONL.
 * Otherwise, resolve the dataset by name from the golden cluster.
 */
const useLocalJsonl = (): boolean => Boolean(process.env.ATTACK_DISCOVERY_DATASET_JSONL_PATH);

evaluate.describe('Attack Discovery', { tag: tags.stateful.classic }, () => {
  evaluate('bundled alerts (jsonl)', async ({ evaluateDataset }) => {
    if (useLocalJsonl()) {
      const dataset = await loadAttackDiscoveryBundledAlertsJsonlDataset({
        jsonlPath: process.env.ATTACK_DISCOVERY_DATASET_JSONL_PATH,
        offset: resolveDatasetOffset(),
        limit: resolveDatasetLimit(),
      });
      await evaluateDataset({ dataset });
    } else {
      await evaluateDataset({
        dataset: {
          name: resolveDatasetName(),
          description: DEFAULT_DATASET_DESCRIPTION,
          examples: [],
        },
        trustUpstreamDataset: true,
      });
    }
  });

  evaluate('does not fabricate attacks from benign input', async ({ evaluateDataset }) => {
    // Checked-in benign/unrelated alert bundles that must NOT yield an attack
    // discovery. Scored by the deterministic No-Fabrication evaluator (correct =
    // zero insights); quality evaluators return N/A. Inline dataset, so this runs
    // without the golden cluster.
    await evaluateDataset({
      dataset: {
        name: 'attack_discovery: negative cases (benign input)',
        description:
          'Benign or unrelated alert bundles that should produce no attack discovery insights.',
        examples: negativeCases,
      },
    });
  });

  evaluate.describe('modes smoke', () => {
    const snapshotConfig = resolveAlertsSnapshotConfig(ALERTS_SNAPSHOT_ENV_PREFIX);

    evaluate(
      'searchAlerts mode (defaults)',
      async ({ executorClient, inferenceClient, log, attackDiscoveryClient, esClient }) => {
        if (snapshotConfig) {
          log.info(
            `Restoring alerts snapshot for searchAlerts smoke test (gs://${snapshotConfig.bucket}/${
              snapshotConfig.basePath
            }, snapshot="${snapshotConfig.snapshotName ?? 'latest'}")...`
          );
          await restoreAlertsSnapshot({ esClient, log, config: snapshotConfig });
        } else {
          log.info(
            'Skipping snapshot restore (missing GCS_CREDENTIALS or explicitly disabled). ' +
              `Default snapshot is pinned to gs://${DEFAULT_ALERTS_SNAPSHOT_CONFIG.bucket}/${DEFAULT_ALERTS_SNAPSHOT_CONFIG.basePath}. ` +
              'To override, set ATTACK_DISCOVERY_ALERTS_SNAPSHOT_BUCKET/BASE_PATH/NAME.'
          );
        }

        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'attack discovery: searchAlerts smoke',
                description: 'Smoke test for the searchAlerts mode',
                examples: [
                  {
                    input: { mode: 'searchAlerts', size: 1 } as const,
                    output: { attackDiscoveries: [] },
                  },
                ],
              },
            ],
            task: async ({ input }) =>
              runAttackDiscovery({
                inferenceClient,
                attackDiscoveryClient,
                input,
                log,
              }),
          },
          [
            {
              name: 'Ran',
              kind: 'CODE',
              evaluate: async ({ output }) => ({ score: Array.isArray(output?.insights) ? 1 : 0 }),
            },
          ]
        );
      }
    );

    evaluate(
      'graphState mode (defaults)',
      async ({ executorClient, inferenceClient, log, attackDiscoveryClient }) => {
        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'attack discovery: graphState smoke',
                description: 'Smoke test for the graphState mode',
                examples: [
                  {
                    input: { mode: 'graphState', anonymizedAlerts: [] } as const,
                    output: { attackDiscoveries: [] },
                  },
                ],
              },
            ],
            task: async ({ input }) =>
              runAttackDiscovery({
                inferenceClient,
                attackDiscoveryClient,
                input,
                log,
              }),
          },
          [
            {
              name: 'Ran',
              kind: 'CODE',
              evaluate: async ({ output }) => ({ score: Array.isArray(output?.insights) ? 1 : 0 }),
            },
          ]
        );
      }
    );
  });
});
