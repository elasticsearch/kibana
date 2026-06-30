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
import { compareWarmStartMemory } from './compare_warm_start_memory';
import {
  MIN_MAX_RSS_REGRESSION_DELTA_BYTES,
  MIN_TAIL_HEAP_USED_REGRESSION_DELTA_BYTES,
  MIN_TAIL_RSS_REGRESSION_DELTA_BYTES,
} from './memory_regression_threshold';
import { WARM_START_MEMORY_REPORT_PATH_ENV } from './memory_regression_report';
import { makeWarmStartMemoryCompareContext } from './test_helpers';

describe('compareWarmStartMemory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_COMMIT;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_COMMIT;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_ID;
    delete process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_BUILD_ID;
    delete process.env.GITHUB_PR_MERGE_BASE;
    delete process.env.BUILDKITE_COMMIT;
    delete process.env.BUILDKITE_BUILD_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not throw when the target median is within the allowed regression threshold', async () => {
    const baselineMedianRssBytes = 500 * 1024 * 1024;
    const targetMedianRssBytes = baselineMedianRssBytes + MIN_TAIL_RSS_REGRESSION_DELTA_BYTES;

    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      baselineTailRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      targetMaxRssValues: [targetMedianRssBytes, targetMedianRssBytes, targetMedianRssBytes],
      targetTailRssValues: [targetMedianRssBytes, targetMedianRssBytes, targetMedianRssBytes],
    });
    const logInfoSpy = jest.spyOn(context.log, 'info');

    await expect(compareWarmStartMemory(context)).resolves.toBeUndefined();
    expect(logInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warm-start memory gate samples')
    );
  });

  it('throws and writes a structured report when Tail RSS exceeds its threshold', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'warm-start-memory-compare-'));
    const reportPath = path.join(tempDir, 'report.json');
    const baselineMedianRssBytes = 500 * 1024 * 1024;
    const targetMedianRssBytes = baselineMedianRssBytes + MIN_TAIL_RSS_REGRESSION_DELTA_BYTES + 1;

    process.env[WARM_START_MEMORY_REPORT_PATH_ENV] = reportPath;
    process.env.GITHUB_PR_MERGE_BASE = 'baseline-sha';
    process.env.BUILDKITE_COMMIT = 'target-sha';

    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      baselineTailRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      targetMaxRssValues: [baselineMedianRssBytes, baselineMedianRssBytes, baselineMedianRssBytes],
      targetTailRssValues: [targetMedianRssBytes, targetMedianRssBytes, targetMedianRssBytes],
      baselineTailHeapUsedValues: [100, 200, 300],
      targetTailHeapUsedValues: [150, 250, 350],
      baselineTailHeapTotalValues: [400, 500, 600],
      targetTailHeapTotalValues: [450, 550, 650],
      baselineTailExternalValues: [700, 800, 900],
      targetTailExternalValues: [750, 850, 950],
      baselineTailArrayBuffersValues: [1000, 1100, 1200],
      targetTailArrayBuffersValues: [1050, 1150, 1250],
    });

    try {
      let rejection: Error | undefined;
      try {
        await compareWarmStartMemory(context);
      } catch (error) {
        rejection = error as Error;
      }

      expect(rejection?.message).toContain('Warm-start memory regression detected');
      expect(rejection?.message).toContain('Threshold failure(s): Tail RSS delta');
      expect(rejection?.message).toContain('Metric context: Max RSS delta');
      expect(rejection!.message.indexOf('Threshold failure(s): Tail RSS delta')).toBeLessThan(
        rejection!.message.indexOf('Metric context: Max RSS delta')
      );

      const writtenReport = JSON.parse(await readFile(reportPath, 'utf8'));

      expect(writtenReport).toEqual({
        metrics: {
          tailRss: {
            baselineBytes: baselineMedianRssBytes,
            targetBytes: targetMedianRssBytes,
            baselineSampleBytes: [
              baselineMedianRssBytes,
              baselineMedianRssBytes,
              baselineMedianRssBytes,
            ],
            targetSampleBytes: [targetMedianRssBytes, targetMedianRssBytes, targetMedianRssBytes],
            deltaBytes: MIN_TAIL_RSS_REGRESSION_DELTA_BYTES + 1,
            allowedDeltaBytes: MIN_TAIL_RSS_REGRESSION_DELTA_BYTES,
            regressed: true,
          },
          maxRss: {
            baselineBytes: baselineMedianRssBytes,
            targetBytes: baselineMedianRssBytes,
            baselineSampleBytes: [
              baselineMedianRssBytes,
              baselineMedianRssBytes,
              baselineMedianRssBytes,
            ],
            targetSampleBytes: [
              baselineMedianRssBytes,
              baselineMedianRssBytes,
              baselineMedianRssBytes,
            ],
            deltaBytes: 0,
            allowedDeltaBytes: MIN_MAX_RSS_REGRESSION_DELTA_BYTES,
            regressed: false,
          },
          tailHeapUsed: {
            baselineBytes: 200,
            targetBytes: 250,
            baselineSampleBytes: [100, 200, 300],
            targetSampleBytes: [150, 250, 350],
            deltaBytes: 50,
            allowedDeltaBytes: MIN_TAIL_HEAP_USED_REGRESSION_DELTA_BYTES,
            regressed: false,
          },
        },
        diagnosticMetrics: {
          tailHeapTotal: {
            baselineBytes: 500,
            targetBytes: 550,
            deltaBytes: 50,
          },
          tailExternal: {
            baselineBytes: 800,
            targetBytes: 850,
            deltaBytes: 50,
          },
          tailArrayBuffers: {
            baselineBytes: 1100,
            targetBytes: 1150,
            deltaBytes: 50,
          },
        },
        triggeredMetrics: ['tailRss'],
        context: {
          baselineCommit: 'baseline-sha',
          targetCommit: 'target-sha',
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('throws when Max RSS exceeds its looser threshold', async () => {
    const baselineMedianRssBytes = 500 * 1024 * 1024;
    const targetMedianMaxRssBytes = baselineMedianRssBytes + MIN_MAX_RSS_REGRESSION_DELTA_BYTES + 1;

    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      baselineTailRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      targetMaxRssValues: [
        targetMedianMaxRssBytes,
        targetMedianMaxRssBytes,
        targetMedianMaxRssBytes,
      ],
      targetTailRssValues: [baselineMedianRssBytes, baselineMedianRssBytes, baselineMedianRssBytes],
    });

    await expect(compareWarmStartMemory(context)).rejects.toThrow('Triggered metric(s): maxRss');
  });

  it('throws when Tail heap used exceeds its threshold even if RSS is stable', async () => {
    const baselineMedianRssBytes = 500 * 1024 * 1024;
    const baselineMedianHeapUsedBytes = 100 * 1024 * 1024;
    const targetMedianHeapUsedBytes =
      baselineMedianHeapUsedBytes + MIN_TAIL_HEAP_USED_REGRESSION_DELTA_BYTES + 1;

    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      baselineTailRssValues: [
        baselineMedianRssBytes,
        baselineMedianRssBytes,
        baselineMedianRssBytes,
      ],
      baselineTailHeapUsedValues: [
        baselineMedianHeapUsedBytes,
        baselineMedianHeapUsedBytes,
        baselineMedianHeapUsedBytes,
      ],
      targetMaxRssValues: [baselineMedianRssBytes, baselineMedianRssBytes, baselineMedianRssBytes],
      targetTailRssValues: [baselineMedianRssBytes, baselineMedianRssBytes, baselineMedianRssBytes],
      targetTailHeapUsedValues: [
        targetMedianHeapUsedBytes,
        targetMedianHeapUsedBytes,
        targetMedianHeapUsedBytes,
      ],
    });

    let rejection: Error | undefined;
    try {
      await compareWarmStartMemory(context);
    } catch (error) {
      rejection = error as Error;
    }

    expect(rejection?.message).toContain('Threshold failure(s): Tail heap used delta');
    expect(rejection?.message).toContain('baseline samples:');
    expect(rejection?.message).toContain('target samples:');
    expect(rejection?.message).toContain('Metric context: Tail RSS delta');
    expect(rejection?.message).toContain('Triggered metric(s): tailHeapUsed');
    expect(rejection!.message.indexOf('Threshold failure(s): Tail heap used delta')).toBeLessThan(
      rejection!.message.indexOf('Metric context: Tail RSS delta')
    );
  });
});
