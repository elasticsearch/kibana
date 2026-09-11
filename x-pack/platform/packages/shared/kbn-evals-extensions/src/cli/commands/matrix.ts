/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { createFailError, createFlagError } from '@kbn/dev-cli-errors';
import type { Command } from '@kbn/dev-cli-runner';
import {
  EvalsClient,
  getEvaluationsKbnClient,
  envFromDatasetsProfile,
  DEFAULT_EVALUATIONS_KBN_URL,
} from '@kbn/evals';
import { KbnClient } from '@kbn/kbn-client';
import type { EvaluationScoreDocument } from '@kbn/evals-common';
import { loadMatrixConfig, applyModelOverrides } from '../../matrix/load_matrix_config';
import type { MatrixConfig } from '../../matrix/load_matrix_config';
import { queryMatrixScores } from '../../matrix/query_matrix_scores';
import type {
  QueryMatrixScoresOptions,
  ScoreAggregationOptions,
} from '../../matrix/query_matrix_scores';
import { buildMatrix } from '../../matrix/build_matrix';
import { renderMatrix } from '../../matrix/render_matrix';
import { renderMatrixHtml } from '../../matrix/render_matrix_html';
import { renderReliabilityHtml } from '../../matrix/render_reliability_html';
import { queryMatrixTraces } from '../../matrix/query_matrix_traces';
import type { MatrixTraceData } from '../../matrix/trace_types';
import { readLocalGitState } from '../../matrix/local_git_state';
import {
  warnOnConfiguredNamesMissingFromData,
  warnOnDataAboutToLeaveLookback,
} from '../../matrix/config_data_preflight';

const DEFAULT_OUT_DIR = 'target/llm_matrix';

/**
 * Build the aggregation query for a matrix run.
 *
 * Extracted from the command body so the config-to-aggregation link is
 * reachable from a unit test: the scoring policy is only worth anything if a
 * config value actually survives the trip, and a test that cannot see this
 * object cannot notice when it stops being passed.
 */
export const matrixScoreQuery = (
  config: MatrixConfig,
  {
    suiteIds,
    modelIds,
    branch,
    lookbackDays,
    asOf,
  }: Omit<
    QueryMatrixScoresOptions,
    'prefixesBySuite' | 'scoring' | 'branchBySuite' | 'scoringBySuite' | 'asOf'
  > & {
    /**
     * Required (though nullable) so a caller that forgets it fails to compile.
     * An optional `asOf` was silently dropped at the command call site once
     * already: the flag parsed, selection ignored it, and the matrix published
     * exactly the runs the cutoff existed to exclude.
     */
    asOf: number | undefined;
  }
): QueryMatrixScoresOptions => ({
  suiteIds,
  modelIds,
  branch,
  branchBySuite: branchBySuiteFromColumns(config),
  lookbackDays,
  asOf,
  prefixesBySuite: prefixesBySuiteFromColumns(config),
  scoring: config.scoring,
  scoringBySuite: scoringBySuiteFromColumns(config),
});

/**
 * Collapses per-column `allowSelfJudged` into a suite-keyed scoring policy.
 *
 * A judge that is also a ranked model has its own row dropped by the global
 * `excludeSelfJudged`, blanking a cell it genuinely earned. Opting out is
 * scoped to the suite whose judge was actually audited: gemini-3.1-pro also
 * self-judges 100% of security-automatic-migrations, so a global flip would
 * admit self-judged scores for suites nobody measured.
 */
export const scoringBySuiteFromColumns = (
  config: MatrixConfig
): Record<string, ScoreAggregationOptions> => {
  const bySuite: Record<string, ScoreAggregationOptions> = {};
  for (const column of config.columns) {
    if (column.allowSelfJudged === undefined) {
      continue;
    }
    for (const suiteId of column.suites ?? []) {
      bySuite[suiteId] = { ...config.scoring, excludeSelfJudged: !column.allowSelfJudged };
    }
  }
  return bySuite;
};

/**
 * Collapses per-column `examplePrefixes` into a suite-keyed map.
 *
 * A single global union made the per-prefix fetch run for every suite, so a
 * suite whose column declares no prefixes still paid the extra query and
 * then reported every score as an unmapped verdict. attack-discovery writes
 * a constant example id and produced 63 such rejections per model while its
 * column scored correctly from aggregate stats.
 */
export const prefixesBySuiteFromColumns = (config: MatrixConfig): Record<string, string[]> => {
  const bySuite: Record<string, string[]> = {};

  for (const column of config.columns) {
    if (!column.examplePrefixes?.length) {
      continue;
    }
    for (const suiteId of column.suites) {
      bySuite[suiteId] = [...new Set([...(bySuite[suiteId] ?? []), ...column.examplePrefixes])];
    }
  }

  return bySuite;
};
/**
 * Collapses per-column `branch` overrides into the suite-keyed map the query
 * layer consumes.
 *
 * Columns address suites, but the score query iterates suites, so an override
 * declared on a column has to be projected onto every suite that column reads.
 * Two columns sharing a suite must agree: silently honouring the first would
 * make the resulting cells depend on config ordering, so a genuine conflict
 * throws rather than resolving arbitrarily.
 */
export const branchBySuiteFromColumns = (
  config: MatrixConfig
): Record<string, string | string[]> => {
  const bySuite: Record<string, string | string[]> = {};
  // Compare by value: a branch override may be a list, and two columns
  // declaring equal lists agree even though the arrays are distinct objects.
  const describe = (branch: string | string[]): string =>
    Array.isArray(branch) ? branch.join(', ') : branch;

  for (const column of config.columns) {
    if (!column.branch) {
      continue;
    }
    for (const suiteId of column.suites) {
      const existing = bySuite[suiteId];
      if (existing !== undefined && describe(existing) !== describe(column.branch)) {
        throw new Error(
          `Conflicting branch overrides for suite "${suiteId}": ` +
            `"${describe(existing)}" and "${describe(column.branch)}". A suite is queried ` +
            `once, so its columns must agree on which branch to read.`
        );
      }
      bySuite[suiteId] = column.branch;
    }
  }

  return bySuite;
};

export const matrixCmd: Command<void> = {
  name: 'matrix',
  description: `
  Generate an LLM performance matrix artifact from exported evaluation results.

  Reads the latest experiment per (model, suite) from the evals plugin on the
  target Kibana, maps suites/datasets/evaluators onto matrix columns via a config
  file, normalizes scores onto a 0-10 scale, and writes markdown + CSV + JSON.

  Configure target/auth with EVAL_KBN_URL and EVAL_KBN_API_KEY,
  with --kbn-url/--kbn-api-key, or with --profile (e.g. dev-vault for the golden
  cluster, or a config.<name>.json file).

  Example:
    node scripts/evals ext matrix \\
      --config .buildkite/pipelines/evals/security_matrix.config.json \\
      --profile dev-vault --branch main --out target/llm_matrix
  `,
  flags: {
    string: [
      'config',
      'out',
      'branch',
      'lookback-days',
      'as-of',
      'profile',
      'kbn-url',
      'kbn-api-key',
      'model',
      'trace-cache',
    ],
    boolean: ['html'],
    allowUnexpected: false,
    help: `
    --config           Path to the matrix config JSON (required).
    --out              Output directory for artifacts (default: ${DEFAULT_OUT_DIR}).
    --branch           Git branch filter override (default: config.branch).
    --lookback-days    Only consider experiments newer than now-<n>d (default: config.lookbackDays).
    --as-of            Render the matrix as of an ISO date/instant, ignoring runs
                       after it for every model alike (e.g. 2026-09-01). Use to
                       reproduce an earlier matrix or exclude a known-bad window.
    --model            Replace the config's model set for an on-demand run.
                       Format: id[:label][:open-source]. Repeatable.
                       e.g. --model gpt-5-preview:GPT-5 --model qwen3:Qwen3:open-source
    --profile          Golden-cluster config profile providing EVAL_KBN_URL/API_KEY
                       (e.g. 'dev-vault' for runtime Vault, or a config.<name>.json file).
    --trace-cache      Path to a trace-cache JSON (executionId::exampleId -> score docs).
    --kbn-url          Kibana URL override.
    --kbn-api-key      Kibana API key override.
    --html             Also generate a self-contained HTML report (matrix.html).
    `,
  },
  run: async ({ log, flagsReader }) => {
    const configPath = flagsReader.string('config');
    if (!configPath) {
      throw createFlagError('--config is required. Provide the path to a matrix config JSON.');
    }

    const repoRoot = process.cwd();
    const baseConfig = loadMatrixConfig(Path.resolve(repoRoot, configPath));

    const modelOverrides = flagsReader.arrayOfStrings('model') ?? [];
    let config: MatrixConfig;
    try {
      config = applyModelOverrides(baseConfig, modelOverrides);
    } catch (error) {
      throw createFlagError(error instanceof Error ? error.message : String(error));
    }
    if (modelOverrides.length > 0) {
      log.info(
        `Overriding config model set with ${
          config.models.length
        } on-demand model(s): ${config.models.map((model) => model.id).join(', ')}`
      );
    }

    const profile = flagsReader.string('profile') ?? undefined;
    const profileEnv = envFromDatasetsProfile(repoRoot, profile);

    const evaluationsKbnUrl =
      flagsReader.string('kbn-url') ?? profileEnv.EVAL_KBN_URL ?? process.env.EVAL_KBN_URL;
    if (!evaluationsKbnUrl) {
      log.warning(`EVAL_KBN_URL not set; defaulting to ${DEFAULT_EVALUATIONS_KBN_URL}.`);
    }

    const evaluationsKbnApiKey =
      flagsReader.string('kbn-api-key') ??
      profileEnv.EVAL_KBN_API_KEY ??
      process.env.EVAL_KBN_API_KEY;

    const branch = flagsReader.string('branch') ?? config.branch;
    const lookbackDaysFlag = flagsReader.string('lookback-days');
    const lookbackDays = lookbackDaysFlag ? Number(lookbackDaysFlag) : config.lookbackDays;
    if (Number.isNaN(lookbackDays) || lookbackDays < 1) {
      throw createFlagError('--lookback-days must be a positive number.');
    }

    const asOfFlag = flagsReader.string('as-of');
    const asOf = asOfFlag === undefined ? undefined : Date.parse(asOfFlag);
    if (asOf !== undefined && !Number.isFinite(asOf)) {
      throw createFlagError('--as-of must be an ISO date or instant, e.g. 2026-09-01.');
    }

    const outDir = Path.resolve(repoRoot, flagsReader.string('out') ?? DEFAULT_OUT_DIR);
    const suiteIds = [...new Set(config.columns.flatMap((column) => column.suites))];
    // Query per (suite, model) pair: the experiments route answers from a
    // terms aggregation that grows with the page number, so the listing must
    // stay bounded per pair. Include matchIds so aliased model rows are found.
    const modelIds = [
      ...new Set(config.models.flatMap((model) => [model.id, ...(model.matchIds ?? [])])),
    ];

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
          'Set EVAL_KBN_URL to a Kibana instance with xpack.evals.enabled=true.',
          'Set EVAL_KBN_API_KEY when authenticating to a non-local target.',
        ].join('\n')
      );
    }

    log.info(
      `Querying matrix scores from ${evaluationsKbnUrl ?? DEFAULT_EVALUATIONS_KBN_URL} (branch: ${
        branch ?? 'any'
      })`
    );

    const aggregated = await queryMatrixScores(
      evalsClient,
      log,
      matrixScoreQuery(config, { suiteIds, modelIds, branch, lookbackDays, asOf })
    );

    if (aggregated.length === 0) {
      // Empty CSVs would publish as a blank matrix in customer-facing docs.
      throw createFailError(
        [
          'No experiments matched the configured filters, refusing to write an empty matrix.',
          `Filters: suites=[${suiteIds.join(', ')}] models=[${modelIds.join(', ')}] branch=${
            branch ?? 'any'
          } lookbackDays=${lookbackDays}`,
          'Check that the weekly eval run published results for these suites in the lookback window.',
        ].join('\n')
      );
    }

    warnOnConfiguredNamesMissingFromData(config, aggregated, log);
    warnOnDataAboutToLeaveLookback(config, aggregated, log);

    const matrix = buildMatrix(aggregated, config, log);
    const generateHtml = flagsReader.boolean('html');

    // Query traces before rendering so they can be embedded in matrix.json —
    // the artifact then carries everything needed to audit a cell's full
    // conversation without re-querying the evals cluster.
    let traces: MatrixTraceData | undefined;
    // Recorded in the artifact's provenance. A matrix built from a dirty tree or
    // from a different cache than a later regen will not reproduce, and every
    // stale-artifact mix-up this pipeline has had looked exactly like a real
    // result until someone diffed it.
    const traceCacheForProvenance = flagsReader.string('trace-cache') ?? 'none';
    const localGit = readLocalGitState(repoRoot, log);
    if (generateHtml) {
      log.info('Querying trace data for HTML report...');
      // --trace-cache <path>: pre-pulled score documents keyed
      // `${executionId}::${exampleId}`, e.g. fetched directly from the evals
      // cluster's ES when the Kibana route can't serve them (older plugin
      // builds ignore execution filters and trip the response-size cap on
      // heavy examples). Cached cells skip the server fetch entirely.
      const traceCachePath = flagsReader.string('trace-cache');
      let traceCache: Record<string, EvaluationScoreDocument[]> | undefined;
      if (traceCachePath) {
        traceCache = JSON.parse(Fs.readFileSync(traceCachePath, 'utf8')) as Record<
          string,
          EvaluationScoreDocument[]
        >;
        const cellCount = traceCache ? Object.keys(traceCache).length : 0;
        log.info(`Loaded trace cache: ${cellCount} cells from ${traceCachePath}`);
      }
      traces = await queryMatrixTraces(
        evalsClient,
        log,
        aggregated,
        traceCache,
        config.toolCallWarnAbove,
        new Map(
          config.models
            .filter((model) => (model.matchIds ?? []).length > 0)
            .map((model) => [model.id, model.matchIds ?? []])
        )
      );

      // Traces fetched from the server come back hollow (stepCount 0) when the
      // evals plugin cannot serve step payloads, so the report renders panels
      // with nothing in them and still exits 0. Counting panels is not enough
      // -- count the ones that actually carry steps.
      const traceCells = Object.values(traces ?? {});
      const withSteps = traceCells.filter((t) => (t?.stepCount ?? 0) > 0).length;
      if (traceCells.length === 0) {
        log.warning('no traces resolved -- the report will have no trace panels');
      } else if (withSteps === 0) {
        log.warning(
          `all ${traceCells.length} traces came back without steps` +
            (traceCachePath
              ? ''
              : ' -- pass --trace-cache to load step payloads from a pre-pulled cache')
        );
      }
    }

    const rendered = renderMatrix(
      matrix,
      config,
      {
        branch,
        lookbackDays,
        asOf,
        suiteIds,
        commitSha: process.env.BUILDKITE_COMMIT ?? localGit.sha,
        dirtyWorkingTree: localGit.dirty,
        traceCache: traceCacheForProvenance,
        buildUrl: process.env.BUILDKITE_BUILD_URL,
      },
      traces
    );

    Fs.mkdirSync(outDir, { recursive: true });
    const writes: Array<[string, string]> = [
      ['proprietary-models.csv', rendered.proprietaryCsv],
      ['open-source-models.csv', rendered.openSourceCsv],
      ['matrix.md', rendered.markdown],
      ['matrix.json', rendered.json],
      // Raw, pre-scaling per-evaluator means/counts, so reviewers can audit which
      // evaluators feed a cell without re-querying.
      ['scores.debug.json', `${JSON.stringify(aggregated, null, 2)}\n`],
    ];
    for (const [fileName, contents] of writes) {
      Fs.writeFileSync(Path.join(outDir, fileName), contents);
    }

    if (generateHtml && traces) {
      const htmlContent = renderMatrixHtml(
        matrix,
        config,
        {
          branch,
          lookbackDays,
          asOf,
          suiteIds,
          commitSha: process.env.BUILDKITE_COMMIT ?? localGit.sha,
          dirtyWorkingTree: localGit.dirty,
          traceCache: traceCacheForProvenance,
          buildUrl: process.env.BUILDKITE_BUILD_URL,
          fixtureFingerprint: config.provenance?.fixtureFingerprint,
          methodologyNotes: config.provenance?.methodologyNotes,
        },
        traces
      );
      Fs.writeFileSync(Path.join(outDir, 'matrix.html'), htmlContent);
      const reliabilityHtml = renderReliabilityHtml(matrix, traces, {
        branch,
        lookbackDays,
        asOf,
        commitSha: process.env.BUILDKITE_COMMIT ?? localGit.sha,
        dirtyWorkingTree: localGit.dirty,
      });
      Fs.writeFileSync(Path.join(outDir, 'matrix.reliability.html'), reliabilityHtml);
      log.info(`Wrote matrix.html and matrix.reliability.html to ${outDir}`);
    }

    log.info(
      `Wrote matrix artifacts to ${outDir} ` +
        `(${matrix.proprietary.length} proprietary, ${matrix.openSource.length} open-source models)`
    );
    log.info(`\n${rendered.markdown}`);
  },
};
