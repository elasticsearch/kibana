/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execFileSync } from 'child_process';
import path from 'path';

/**
 * Repo-wide guard for the trace index pattern.
 *
 * The per-evaluator test next to this one only exercises the evaluators built by
 * the shared factory. Suites are free to hand-roll their own ES|QL against
 * `traceEsClient`, and two of them did -- the persona-matrix `SkillInvoked`
 * check and the endpoint suite's skill-invocation evaluator both kept a bare
 * `FROM traces-*` after the shared package was fixed. On the golden cluster the
 * eval key is granted on datastream BACKING indices, so a bare `traces-*`
 * resolves zero authorized indices and ES|QL reports `Unknown column
 * [trace.id]`. Those cells then read as "the model emitted no spans".
 *
 * Grep the sources instead of the evaluator objects so a new suite that writes
 * its own query is covered the day it lands.
 */
describe('trace ES|QL index pattern (repo-wide)', () => {
  const repoRoot = path.resolve(__dirname, '../../../../../../../..');

  const matches = (): string[] => {
    try {
      // -F: the pattern is literal. Restrict to the eval packages so an unrelated
      // doc or example query cannot fail this suite.
      const out = execFileSync(
        'grep',
        [
          '-rn',
          '-F',
          'FROM traces-*',
          '--include=*.ts',
          'x-pack/platform/packages/shared/kbn-evals/src',
          'x-pack/solutions/security/packages',
        ],
        { cwd: repoRoot, encoding: 'utf8' }
      );
      return out.split('\n').filter(Boolean);
    } catch (error: unknown) {
      // grep exits 1 with no output when nothing matches, which is the pass case.
      const status = (error as { status?: number }).status;
      if (status === 1) {
        return [];
      }
      throw error;
    }
  };

  it('has no bare FROM traces-* left in eval sources', () => {
    // A line is only a violation when the pattern is NOT the shared constant,
    // i.e. the literal is followed by something other than `,.ds-traces-*`.
    // Test files are excluded: they legitimately spell out a bare pattern as a
    // fixture or, like this file, quote it to describe the bug.
    const offenders = matches()
      .filter((line) => !line.includes('FROM traces-*,.ds-traces-*'))
      .filter((line) => !/\.test\.ts:/.test(line));

    expect(offenders).toEqual([]);
  });
});
