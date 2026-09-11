/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Run the judge-overlap analysis over real rejudge artifacts.
 *
 * Takes the `rejudge-*.json` files produced by re-judging one common subset of
 * cells with several judges and reports whether the resulting board can be
 * ranked. Output is JSON on stdout so the numbers quoted in the PR and in the
 * rendered board come from the same committed code path as the tests.
 *
 *   JUDGE_ARTIFACTS=haiku=/path/a.json,gpt=/path/b.json node scripts/analyze_judge_overlap.ts
 */

import fs from 'fs';
import {
  analyzeJudgeOverlap,
  realModelIdFromSourceExecution,
  type JudgeOverlapInput,
} from '../src/matrix/judge_overlap';

const spec = process.env.JUDGE_ARTIFACTS;
if (!spec) {
  throw new Error('JUDGE_ARTIFACTS must be judgeId=path pairs, comma separated.');
}

const inputs: JudgeOverlapInput[] = spec.split(',').map((pair) => {
  const [judgeId, file] = pair.split('=');
  if (!judgeId || !file) throw new Error(`Malformed JUDGE_ARTIFACTS entry "${pair}".`);

  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));

  const cells = artifact.results.map((r: any) => {
    const numeric = r.scores
      .map((s: any) => s.score)
      .filter((s: unknown): s is number => typeof s === 'number');

    if (numeric.length === 0) {
      // The rejudge guard should have refused this artifact. Reaching here
      // means an unscored cell would otherwise average in as a real zero.
      throw new Error(
        `Cell ${r.sourceExecutionId}/${r.exampleId} in "${file}" carries no numeric score.`
      );
    }

    return {
      // Blind runs alias modelId; sourceExecutionId keeps the real identity.
      modelId: realModelIdFromSourceExecution(r.sourceExecutionId),
      exampleId: r.exampleId,
      score: numeric.reduce((a: number, b: number) => a + b, 0) / numeric.length,
    };
  });

  return { judgeId, cells };
});

const report = analyzeJudgeOverlap(inputs);

// eslint-disable-next-line no-console
console.log(JSON.stringify(report, null, 2));
