/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildWarmStartMemoryRegressionReport,
  getWarmStartMemoryRegressionReportContextFromEnv,
  writeWarmStartMemoryRegressionReport,
} from './memory_regression_report';

describe('buildWarmStartMemoryRegressionReport', () => {
  it('includes baseline, target, delta, allowed delta, and optional context', () => {
    const report = buildWarmStartMemoryRegressionReport({
      metrics: {
        tailRss: {
          baselineBytes: 1_000,
          targetBytes: 1_500,
          baselineSampleBytes: [900, 1_000, 1_100],
          targetSampleBytes: [1_400, 1_500, 1_600],
          allowedDeltaBytes: 200,
          regressed: true,
        },
        maxRss: {
          baselineBytes: 2_000,
          targetBytes: 2_100,
          baselineSampleBytes: [1_900, 2_000, 2_100],
          targetSampleBytes: [2_000, 2_100, 2_200],
          allowedDeltaBytes: 300,
          regressed: false,
        },
        tailHeapUsed: {
          baselineBytes: 400,
          targetBytes: 450,
          baselineSampleBytes: [300, 400, 500],
          targetSampleBytes: [350, 450, 550],
          allowedDeltaBytes: 100,
          regressed: true,
        },
      },
      diagnosticMetrics: {
        tailHeapTotal: {
          baselineBytes: 500,
          targetBytes: 550,
        },
      },
      triggeredMetrics: ['tailRss', 'tailHeapUsed'],
      context: {
        baselineCommit: 'baseline-sha',
        targetCommit: 'target-sha',
      },
    });

    expect(report).toEqual({
      metrics: {
        tailRss: {
          baselineBytes: 1_000,
          targetBytes: 1_500,
          baselineSampleBytes: [900, 1_000, 1_100],
          targetSampleBytes: [1_400, 1_500, 1_600],
          deltaBytes: 500,
          allowedDeltaBytes: 200,
          regressed: true,
        },
        maxRss: {
          baselineBytes: 2_000,
          targetBytes: 2_100,
          baselineSampleBytes: [1_900, 2_000, 2_100],
          targetSampleBytes: [2_000, 2_100, 2_200],
          deltaBytes: 100,
          allowedDeltaBytes: 300,
          regressed: false,
        },
        tailHeapUsed: {
          baselineBytes: 400,
          targetBytes: 450,
          baselineSampleBytes: [300, 400, 500],
          targetSampleBytes: [350, 450, 550],
          deltaBytes: 50,
          allowedDeltaBytes: 100,
          regressed: true,
        },
      },
      diagnosticMetrics: {
        tailHeapTotal: {
          baselineBytes: 500,
          targetBytes: 550,
          deltaBytes: 50,
        },
      },
      triggeredMetrics: ['tailRss', 'tailHeapUsed'],
      context: {
        baselineCommit: 'baseline-sha',
        targetCommit: 'target-sha',
      },
    });
  });
});

describe('getWarmStartMemoryRegressionReportContextFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('collects commit and build identifiers when present', () => {
    process.env.GITHUB_PR_MERGE_BASE = 'baseline-sha';
    process.env.BUILDKITE_COMMIT = 'target-sha';
    process.env.BUILDKITE_BUILD_ID = 'build-123';

    expect(getWarmStartMemoryRegressionReportContextFromEnv()).toEqual({
      baselineCommit: 'baseline-sha',
      targetCommit: 'target-sha',
      targetBuildId: 'build-123',
    });
  });
});

describe('writeWarmStartMemoryRegressionReport', () => {
  it('writes a JSON report file for CI annotation consumers', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'warm-start-memory-report-'));
    const reportPath = path.join(tempDir, 'report.json');

    try {
      const report = buildWarmStartMemoryRegressionReport({
        metrics: {
          tailRss: {
            baselineBytes: 1_000,
            targetBytes: 2_000,
            baselineSampleBytes: [900, 1_000, 1_100],
            targetSampleBytes: [1_900, 2_000, 2_100],
            allowedDeltaBytes: 150,
            regressed: true,
          },
          maxRss: {
            baselineBytes: 1_500,
            targetBytes: 1_600,
            baselineSampleBytes: [1_400, 1_500, 1_600],
            targetSampleBytes: [1_500, 1_600, 1_700],
            allowedDeltaBytes: 300,
            regressed: false,
          },
        },
        triggeredMetrics: ['tailRss'],
      });

      await writeWarmStartMemoryRegressionReport(report, reportPath);

      const writtenReport = JSON.parse(await readFile(reportPath, 'utf8'));

      expect(writtenReport).toEqual(report);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
