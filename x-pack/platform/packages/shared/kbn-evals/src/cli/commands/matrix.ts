/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { Command } from '@kbn/dev-cli-runner';
import { KbnClient } from '@kbn/kbn-client';
import { EvalsClient } from '../../utils/evals_client';
import { getEvaluationsKbnClient } from '../../utils/evaluations_kbn_client';
import { loadMatrixConfig } from '../../utils/matrix/load_matrix_config';
import { queryMatrixScores } from '../../utils/matrix/query_matrix_scores';
import { buildMatrix } from '../../utils/matrix/build_matrix';
import { renderMatrix } from '../../utils/matrix/render_matrix';
import { envFromDatasetsProfile } from '../profiles';

const DEFAULT_OUT_DIR = 'target/llm_matrix';
const DEFAULT_EVALUATIONS_KBN_URL = 'http://elastic:changeme@localhost:5601';

export const matrixCmd: Command<void> = {
  name: 'matrix',
  description: `
  Generate an LLM performance matrix artifact from exported evaluation results.

  Reads the latest experiment per (model, suite) from the evals plugin on the
  target Kibana, maps suites/datasets/evaluators onto matrix columns via a config
  file, normalizes scores onto a 0-10 scale, and writes markdown + CSV + JSON.

  Configure target/auth with EVALUATIONS_KBN_URL and EVALUATIONS_KBN_API_KEY,
  with --kbn-url/--kbn-api-key, or with --profile (e.g. dev-vault for the golden
  cluster, or a config.<name>.json file).

  Example:
    node scripts/evals matrix \\
      --config .buildkite/pipelines/evals/security_matrix.config.json \\
      --profile dev-vault --branch main --out target/llm_matrix
  `,
  flags: {
    string: ['config', 'out', 'branch', 'lookback-days', 'profile', 'kbn-url', 'kbn-api-key'],
    help: `
    --config           Path to the matrix config JSON (required).
    --out              Output directory for artifacts (default: ${DEFAULT_OUT_DIR}).
    --branch           Git branch filter override (default: config.branch).
    --lookback-days    Only consider experiments newer than now-<n>d (default: config.lookbackDays).
    --profile          Golden-cluster config profile providing EVALUATIONS_KBN_URL/API_KEY
                       (e.g. 'dev-vault' for runtime Vault, or a config.<name>.json file).
    --kbn-url          Kibana URL override.
    --kbn-api-key      Kibana API key override.
    `,
  },
  run: async ({ log, flagsReader }) => {
    const configPath = flagsReader.string('config');
    if (!configPath) {
      throw createFlagError('--config is required. Provide the path to a matrix config JSON.');
    }

    const repoRoot = process.cwd();
    const config = loadMatrixConfig(Path.resolve(repoRoot, configPath));

    const profile = flagsReader.string('profile') ?? undefined;
    const profileEnv = envFromDatasetsProfile(repoRoot, profile);

    const evaluationsKbnUrl =
      flagsReader.string('kbn-url') ??
      profileEnv.EVALUATIONS_KBN_URL ??
      process.env.EVALUATIONS_KBN_URL;
    if (!evaluationsKbnUrl) {
      log.warning(`EVALUATIONS_KBN_URL not set; defaulting to ${DEFAULT_EVALUATIONS_KBN_URL}.`);
    }

    const evaluationsKbnApiKey =
      flagsReader.string('kbn-api-key') ??
      profileEnv.EVALUATIONS_KBN_API_KEY ??
      process.env.EVALUATIONS_KBN_API_KEY;

    const branch = flagsReader.string('branch') ?? config.branch;
    const lookbackDaysFlag = flagsReader.string('lookback-days');
    const lookbackDays = lookbackDaysFlag ? Number(lookbackDaysFlag) : config.lookbackDays;
    if (Number.isNaN(lookbackDays) || lookbackDays < 1) {
      throw createFlagError('--lookback-days must be a positive number.');
    }

    const outDir = Path.resolve(repoRoot, flagsReader.string('out') ?? DEFAULT_OUT_DIR);
    const suiteIds = [...new Set(config.columns.flatMap((column) => column.suites))];

    const defaultKbnClient = new KbnClient({ log, url: DEFAULT_EVALUATIONS_KBN_URL });
    const kbnClient = getEvaluationsKbnClient({
      kbnClient: defaultKbnClient,
      log,
      evaluationsKbnUrl,
      evaluationsKbnApiKey,
    });
    const evalsClient = new EvalsClient(kbnClient, log);

    try {
      await evalsClient.assertPluginEnabled();
    } catch (error) {
      throw createFlagError(
        [
          error instanceof Error ? error.message : String(error),
          'Set EVALUATIONS_KBN_URL to a Kibana instance with xpack.evals.enabled=true.',
          'Set EVALUATIONS_KBN_API_KEY when authenticating to a non-local target.',
        ].join('\n')
      );
    }

    log.info(
      `Querying matrix scores from ${evaluationsKbnUrl ?? DEFAULT_EVALUATIONS_KBN_URL} (branch: ${
        branch ?? 'any'
      })`
    );

    const aggregated = await queryMatrixScores(evalsClient, log, {
      suiteIds,
      branch,
      lookbackDays,
    });

    if (aggregated.length === 0) {
      log.warning(
        'No experiments matched the configured filters. ' +
          'Check the branch/lookback filters and that suites have results.'
      );
    }

    const matrix = buildMatrix(aggregated, config);
    const rendered = renderMatrix(matrix, config);

    Fs.mkdirSync(outDir, { recursive: true });
    const writes: Array<[string, string]> = [
      ['proprietary-models.csv', rendered.proprietaryCsv],
      ['open-source-models.csv', rendered.openSourceCsv],
      ['matrix.md', rendered.markdown],
      ['matrix.json', rendered.json],
      // Raw, pre-scaling per-evaluator means/counts grouped by model > suite >
      // dataset > evaluator. Lets reviewers audit exactly which evaluators feed
      // each cell (e.g. why a column saturates at 10) without re-querying.
      ['scores.debug.json', `${JSON.stringify(aggregated, null, 2)}\n`],
    ];
    for (const [fileName, contents] of writes) {
      Fs.writeFileSync(Path.join(outDir, fileName), contents);
    }

    log.info(
      `Wrote matrix artifacts to ${outDir} ` +
        `(${matrix.proprietary.length} proprietary, ${matrix.openSource.length} open-source models)`
    );
    log.info(`\n${rendered.markdown}`);
  },
};
