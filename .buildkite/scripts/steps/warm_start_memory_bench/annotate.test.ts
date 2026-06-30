/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  buildBaselineUnavailableAnnotation,
  buildExecutionFailureAnnotation,
  buildRegressionAnnotation,
} from './annotate';
import type { WarmStartMemoryRegressionReport } from './regression_report';
import type { UnavailableBaselineBuild } from './resolve_baseline_build';

const unavailableBaseline = (): UnavailableBaselineBuild => ({
  kind: 'unavailable',
  mergeBaseCommitSha: 'a'.repeat(40),
  attemptCount: 2,
  maxAttempts: 10,
  attempts: [
    {
      commitSha: 'a'.repeat(40),
      attempt: 1,
      outcome: 'no_build',
    },
    {
      commitSha: 'b'.repeat(40),
      attempt: 2,
      outcome: 'build_not_passed',
      buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/99',
    },
  ],
});

const regressionReport = (): WarmStartMemoryRegressionReport => ({
  metrics: {
    tailRss: {
      baselineBytes: 1_000_000_000,
      targetBytes: 1_200_000_000,
      deltaBytes: 200_000_000,
      allowedDeltaBytes: 150_000_000,
      regressed: true,
    },
    maxRss: {
      baselineBytes: 2_000_000_000,
      targetBytes: 2_500_000_000,
      deltaBytes: 500_000_000,
      allowedDeltaBytes: 300_000_000,
      regressed: true,
    },
    tailHeapUsed: {
      baselineBytes: 300_000_000,
      targetBytes: 350_000_000,
      deltaBytes: 50_000_000,
      allowedDeltaBytes: 40_000_000,
      regressed: true,
    },
  },
  diagnosticMetrics: {
    tailExternal: {
      baselineBytes: 100_000_000,
      targetBytes: 120_000_000,
      deltaBytes: 20_000_000,
    },
  },
  triggeredMetrics: ['tailRss', 'maxRss', 'tailHeapUsed'],
  context: {
    baselineCommit: 'baseline-sha',
    targetCommit: 'target-sha',
    baselineBuildId: 'baseline-build',
    targetBuildId: 'target-build',
  },
});

describe('warm start memory bench annotations', () => {
  it('describes baseline lookup failures', () => {
    const body = buildBaselineUnavailableAnnotation(unavailableBaseline());

    expect(body).toContain('Warm-start memory bench skipped');
    expect(body).toContain('kibana-on-merge');
    expect(body).toContain('no_build');
    expect(body).toContain('build_not_passed');
  });

  it('describes execution failures', () => {
    const body = buildExecutionFailureAnnotation('artifact download failed');

    expect(body).toContain('Warm-start memory bench failed');
    expect(body).toContain('artifact download failed');
  });

  it('includes Tail RSS and Max RSS regression details', () => {
    const body = buildRegressionAnnotation(regressionReport());

    expect(body).toContain('Warm-start memory regression detected');
    expect(body).toContain('Tail RSS');
    expect(body).toContain('Max RSS');
    expect(body).toContain('Diagnostic memory context');
    expect(body).toContain('Tail heap used');
    expect(body).toContain('Tail external memory');
    expect(body).toContain('tailRss, maxRss, tailHeapUsed');
    expect(body).toContain('baseline-sha');
    expect(body).toContain('target-sha');
  });
});
