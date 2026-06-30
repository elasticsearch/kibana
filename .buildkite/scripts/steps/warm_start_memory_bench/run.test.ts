/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnnotateFn } from './annotate';
import type { WarmStartMemoryRegressionReport } from './regression_report';
import {
  KIBANA_ON_MERGE_PIPELINE_SLUG,
  KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME,
  type ResolveBaselineBuildResult,
} from './resolve_baseline_build';
import { runWarmStartMemoryBench } from './run';

const MERGE_BASE_SHA = 'a'.repeat(40);
const BASELINE_SHA = 'b'.repeat(40);
const TARGET_SHA = 'c'.repeat(40);

jest.mock('./resolve_baseline_build', () => ({
  ...jest.requireActual('./resolve_baseline_build'),
  resolveBaselineBuild: jest.fn(),
}));

jest.mock('./read_regression_report', () => ({
  readRegressionReportIfPresent: jest.fn(),
}));

import { readRegressionReportIfPresent } from './read_regression_report';
import { resolveBaselineBuild } from './resolve_baseline_build';

const mockResolveBaselineBuild = resolveBaselineBuild as jest.MockedFunction<
  typeof resolveBaselineBuild
>;
const mockReadRegressionReportIfPresent = readRegressionReportIfPresent as jest.MockedFunction<
  typeof readRegressionReportIfPresent
>;

const resolvedBaseline = (): Extract<ResolveBaselineBuildResult, { kind: 'resolved' }> => ({
  kind: 'resolved',
  mergeBaseCommitSha: MERGE_BASE_SHA,
  baselineCommitSha: BASELINE_SHA,
  pipelineSlug: KIBANA_ON_MERGE_PIPELINE_SLUG,
  buildId: 'baseline-build-id',
  buildNumber: 42,
  buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/42',
  attemptCount: 1,
});

describe('runWarmStartMemoryBench', () => {
  let annotate: jest.MockedFunction<AnnotateFn>;
  let downloadAndExtract: jest.Mock;
  let runBench: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    annotate = jest.fn();
    downloadAndExtract = jest.fn().mockResolvedValue(undefined);
    runBench = jest.fn().mockReturnValue({ status: 0 });
    process.env.BUILDKITE_BUILD_ID = 'target-build-id';
    delete process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_COMMIT;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_COMMIT;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_ID;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_BUILD_ID;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_URL;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_REPORT_PATH;
  });

  const run = () =>
    runWarmStartMemoryBench({
      mergeBaseCommitSha: MERGE_BASE_SHA,
      targetCommitSha: TARGET_SHA,
      buildkite: {
        getMetadata: jest.fn((key: string) =>
          key === 'kibana-effective-build-id' ? 'effective-target-build' : null
        ),
        getBuildForCommit: jest.fn(),
        getArtifacts: jest.fn(),
        setAnnotation: jest.fn(),
      } as never,
      annotate,
      downloadAndExtract,
      runBench,
    });

  it('annotates and exits non-zero when baseline is unavailable', async () => {
    mockResolveBaselineBuild.mockResolvedValue({
      kind: 'unavailable',
      mergeBaseCommitSha: MERGE_BASE_SHA,
      attemptCount: 1,
      maxAttempts: 10,
      attempts: [
        {
          commitSha: MERGE_BASE_SHA,
          attempt: 1,
          outcome: 'no_build',
        },
      ],
    });

    await expect(run()).resolves.toBe(1);
    expect(annotate).toHaveBeenCalledWith('warm-start-memory-bench', 'warning', expect.any(String));
    expect(downloadAndExtract).not.toHaveBeenCalled();
    expect(runBench).not.toHaveBeenCalled();
  });

  it('downloads baseline and target artifacts with the selected build ids', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());

    await expect(run()).resolves.toBe(0);

    expect(downloadAndExtract).toHaveBeenNthCalledWith(1, {
      buildId: 'baseline-build-id',
      extractDir: expect.stringContaining('/left'),
      kibanaDir: process.cwd(),
    });
    expect(downloadAndExtract).toHaveBeenNthCalledWith(2, {
      buildId: 'effective-target-build',
      extractDir: expect.stringContaining('/right'),
      kibanaDir: process.cwd(),
    });
    expect(runBench).toHaveBeenCalledWith({
      leftBuildDir: expect.stringContaining('/left'),
      rightBuildDir: expect.stringContaining('/right'),
      kibanaDir: process.cwd(),
    });
    expect(annotate).not.toHaveBeenCalled();
  });

  it('sets report context env vars before running the benchmark', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());

    await run();

    expect(process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_COMMIT).toBe(BASELINE_SHA);
    expect(process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_COMMIT).toBe(TARGET_SHA);
    expect(process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_ID).toBe('baseline-build-id');
    expect(process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_BUILD_ID).toBe('effective-target-build');
    expect(process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_URL).toBe(
      'https://buildkite.com/elastic/kibana-on-merge/builds/42'
    );
    expect(process.env.KIBANA_CI_WARM_START_MEMORY_REPORT_PATH).toContain(
      'target/ci-warm-start-memory-bench/warm_start_memory_regression_report.json'
    );
  });

  it('annotates execution failures from artifact download', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());
    downloadAndExtract.mockRejectedValueOnce(new Error('download failed'));

    await expect(run()).resolves.toBe(1);

    expect(annotate).toHaveBeenCalledWith(
      'warm-start-memory-bench',
      'error',
      expect.stringContaining('download failed')
    );
    expect(runBench).not.toHaveBeenCalled();
  });

  it('annotates regression reports when the benchmark fails with a report', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());
    runBench.mockReturnValue({ status: 1 });
    const report: WarmStartMemoryRegressionReport = {
      metrics: {
        tailRss: {
          baselineBytes: 1,
          targetBytes: 2,
          deltaBytes: 1,
          allowedDeltaBytes: 0,
          regressed: true,
        },
        maxRss: {
          baselineBytes: 1,
          targetBytes: 1,
          deltaBytes: 0,
          allowedDeltaBytes: 0,
          regressed: false,
        },
      },
      triggeredMetrics: ['tailRss'],
    };
    mockReadRegressionReportIfPresent.mockResolvedValue(report);

    await expect(run()).resolves.toBe(1);

    expect(annotate).toHaveBeenCalledWith(
      'warm-start-memory-bench',
      'error',
      expect.stringContaining('regression')
    );
    expect(mockReadRegressionReportIfPresent).toHaveBeenCalledWith(
      expect.stringContaining(
        'target/ci-warm-start-memory-bench/warm_start_memory_regression_report.json'
      )
    );
  });

  it('annotates generic benchmark failures when no regression report exists', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());
    runBench.mockReturnValue({ status: 2 });
    mockReadRegressionReportIfPresent.mockResolvedValue(null);

    await expect(run()).resolves.toBe(1);

    expect(annotate).toHaveBeenCalledWith(
      'warm-start-memory-bench',
      'error',
      expect.stringContaining('exited with status 2')
    );
  });

  it('stays quiet on success', async () => {
    mockResolveBaselineBuild.mockResolvedValue(resolvedBaseline());
    runBench.mockReturnValue({ status: 0 });
    mockReadRegressionReportIfPresent.mockResolvedValue(null);

    await expect(run()).resolves.toBe(0);
    expect(annotate).not.toHaveBeenCalled();
  });

  it('uses the reusable distributable artifact filename expected by baseline resolution', () => {
    expect(KIBANA_REUSABLE_DISTRIBUTABLE_ARTIFACT_FILENAME).toBe('kibana-default.tar.zst');
  });
});
