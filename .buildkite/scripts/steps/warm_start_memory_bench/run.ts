/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * CI wrapper for the warm-start memory benchmark.
 *
 * Baseline resolution and regression policy live under
 * `src/platform/packages/shared/kbn-core-server-benchmarks/ci_warm_start_memory/`.
 * This module only orchestrates Buildkite artifact download and bench execution.
 */

import { spawnSync } from 'child_process';
import { rm } from 'fs/promises';
import path from 'path';

import {
  annotateBaselineUnavailable,
  annotateExecutionFailure,
  annotateRegression,
  type AnnotateFn,
} from './annotate';
import {
  BENCH_CONFIG_PATH,
  LEFT_BUILD_DIR,
  REGRESSION_REPORT_PATH,
  RIGHT_BUILD_DIR,
} from './constants';
import { createBaselineBuildkiteClient } from './create_baseline_buildkite_client';
import { downloadAndExtractKibanaDistributable } from './download_and_extract_kibana_distributable';
import { getEffectiveTargetBuildId } from './get_effective_target_build_id';
import { getParentCommitSha } from './get_parent_commit_sha';
import { readRegressionReportIfPresent } from './read_regression_report';
import { resolveBaselineBuild } from './resolve_baseline_build';
import { setWarmStartMemoryReportContextEnv } from './set_report_context_env';
import { BuildkiteClient } from '#pipeline-utils';

export interface RunWarmStartMemoryBenchOptions {
  readonly mergeBaseCommitSha: string;
  readonly targetCommitSha: string;
  readonly kibanaDir?: string;
  readonly buildkite?: BuildkiteClient;
  readonly annotate?: AnnotateFn;
  readonly downloadAndExtract?: typeof downloadAndExtractKibanaDistributable;
  readonly runBench?: (args: {
    leftBuildDir: string;
    rightBuildDir: string;
    kibanaDir: string;
  }) => { status: number | null; error?: Error };
}

const defaultAnnotate: AnnotateFn = (context, style, body) => {
  const buildkite = new BuildkiteClient();
  buildkite.setAnnotation(context, style, body);
};

const defaultRunBench = ({
  leftBuildDir,
  rightBuildDir,
  kibanaDir,
}: {
  leftBuildDir: string;
  rightBuildDir: string;
  kibanaDir: string;
}) => {
  const result = spawnSync(
    'node',
    [
      'scripts/bench.js',
      '--config',
      BENCH_CONFIG_PATH,
      '--config-from-cwd',
      '--left-build-dir',
      leftBuildDir,
      '--right-build-dir',
      rightBuildDir,
    ],
    {
      cwd: kibanaDir,
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (result.error) {
    return { status: result.status, error: result.error };
  }

  return { status: result.status };
};

export const runWarmStartMemoryBench = async ({
  mergeBaseCommitSha,
  targetCommitSha,
  kibanaDir = process.cwd(),
  buildkite = new BuildkiteClient(),
  annotate = defaultAnnotate,
  downloadAndExtract = downloadAndExtractKibanaDistributable,
  runBench = defaultRunBench,
}: RunWarmStartMemoryBenchOptions): Promise<number> => {
  const baselineResult = await resolveBaselineBuild({
    mergeBaseCommitSha,
    buildkite: createBaselineBuildkiteClient(buildkite),
    getFirstParentCommitSha: (commitSha) => getParentCommitSha(commitSha, { kibanaDir }),
  });

  if (baselineResult.kind === 'unavailable') {
    annotateBaselineUnavailable(baselineResult, annotate);
    return 1;
  }

  let targetBuildId: string;
  try {
    targetBuildId = getEffectiveTargetBuildId({
      getMetadata: (key, defaultValue) => buildkite.getMetadata(key, defaultValue),
      buildkiteBuildId: process.env.BUILDKITE_BUILD_ID,
    });
  } catch (error) {
    annotateExecutionFailure((error as Error).message, annotate);
    return 1;
  }

  const regressionReportPath = path.resolve(kibanaDir, REGRESSION_REPORT_PATH);

  setWarmStartMemoryReportContextEnv({
    baselineCommit: baselineResult.baselineCommitSha,
    targetCommit: targetCommitSha,
    baselineBuildId: baselineResult.buildId,
    targetBuildId,
    baselineBuildUrl: baselineResult.buildUrl,
    regressionReportPath,
  });

  const leftBuildDir = path.resolve(kibanaDir, LEFT_BUILD_DIR);
  const rightBuildDir = path.resolve(kibanaDir, RIGHT_BUILD_DIR);

  try {
    await downloadAndExtract({
      buildId: baselineResult.buildId,
      extractDir: leftBuildDir,
      kibanaDir,
    });
    await downloadAndExtract({
      buildId: targetBuildId,
      extractDir: rightBuildDir,
      kibanaDir,
    });
  } catch (error) {
    annotateExecutionFailure(
      `Failed to download or extract Kibana distributable artifacts: ${(error as Error).message}`,
      annotate
    );
    return 1;
  }

  await rm(regressionReportPath, { force: true });

  const benchResult = runBench({
    leftBuildDir,
    rightBuildDir,
    kibanaDir,
  });

  if (benchResult.status === 0) {
    return 0;
  }

  const regressionReport = await readRegressionReportIfPresent(regressionReportPath);
  if (regressionReport && regressionReport.triggeredMetrics.length > 0) {
    annotateRegression(regressionReport, annotate);
    return 1;
  }

  const failureMessage =
    benchResult.error?.message ??
    `Warm-start memory benchmark exited with status ${benchResult.status ?? 'unknown'}`;
  annotateExecutionFailure(failureMessage, annotate);
  return 1;
};

const main = async () => {
  const mergeBaseCommitSha = process.env.GITHUB_PR_MERGE_BASE;
  const targetCommitSha = process.env.BUILDKITE_COMMIT;

  if (!mergeBaseCommitSha) {
    annotateExecutionFailure(
      'GITHUB_PR_MERGE_BASE is not set; warm-start memory bench only runs on pull request builds.',
      defaultAnnotate
    );
    process.exit(1);
    return;
  }

  if (!targetCommitSha) {
    annotateExecutionFailure(
      'BUILDKITE_COMMIT is not set; cannot determine PR head commit for warm-start memory bench.',
      defaultAnnotate
    );
    process.exit(1);
    return;
  }

  const exitCode = await runWarmStartMemoryBench({
    mergeBaseCommitSha,
    targetCommitSha,
  });

  process.exit(exitCode);
};

if (require.main === module) {
  void main();
}
