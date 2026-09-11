/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Build the ensemble column from rejudge artifacts and print it.
 *
 * JUDGE_ARTIFACTS="haiku=/path/a.json,sonnet=/path/b.json,..."
 * OUT_JSON=/path/to/ensemble.json (optional)
 */

import fs from 'fs';
import { buildEnsembleColumn, type EnsembleCellInput } from '../src/matrix/ensemble_column';
import { realModelIdFromSourceExecution } from '../src/matrix/judge_overlap';

const spec = process.env.JUDGE_ARTIFACTS;
if (!spec)
  throw new Error('JUDGE_ARTIFACTS is required, e.g. "haiku=/tmp/haiku.json,gpt=/tmp/gpt.json"');

const EXCLUDED = new Set([
  'Tool Calls',
  'Latency',
  'Input Tokens',
  'Output Tokens',
  'Skill Invoked',
]);

const cells: EnsembleCellInput[] = [];

for (const entry of spec.split(',')) {
  const [judgeId, file] = entry.split('=');
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const result of artifact.results ?? []) {
    const graded = (result.scores ?? []).filter(
      (s: any) => !EXCLUDED.has(s.name) && typeof s.score === 'number'
    );
    if (graded.length === 0) continue;

    cells.push({
      judgeId,
      modelId: realModelIdFromSourceExecution(result.sourceExecutionId ?? result.executionId),
      exampleId: result.exampleId,
      score: graded.reduce((a: number, s: any) => a + s.score, 0) / graded.length,
    });
  }
}

const column = buildEnsembleColumn(cells);

// eslint-disable-next-line no-console
console.log(
  JSON.stringify(
    {
      judges: column.judges,
      sharedCellCount: column.sharedCellCount,
      noiseReductionFactor: Number(column.noiseReductionFactor.toFixed(3)),
      models: column.models.map((m) => ({
        modelId: m.modelId,
        ensemble: Number(m.ensemble.toFixed(4)),
        judgeSpread: Number(m.judgeSpread.toFixed(4)),
        cellCount: m.cellCount,
        perJudge: Object.fromEntries(
          Object.entries(m.perJudge).map(([k, v]) => [k, Number((v as number).toFixed(4))])
        ),
      })),
    },
    null,
    2
  )
);

if (process.env.OUT_JSON) {
  fs.writeFileSync(process.env.OUT_JSON, JSON.stringify(column, null, 2));
}
