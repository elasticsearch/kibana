/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Report whether a rejudged column is limited by its rubric or by its judges.
 *
 *   SATURATION_INPUT=/tmp/ad_saturation_input.json \
 *     node --require @kbn/setup-node-env scripts/analyze_saturation.ts
 *
 * Input is `{ cells: [{ modelId, cellKey, scoresByJudge }], ceiling }`, which is
 * what a multi-judge rejudge sweep produces once its artifacts are joined on the
 * cells every judge graded.
 */

import fs from 'fs';
import { analyzeSaturation } from '../src/matrix/saturation';

const inputPath = process.env.SATURATION_INPUT;
if (!inputPath) {
  throw new Error('SATURATION_INPUT must point at the joined multi-judge cell file.');
}

const { cells, ceiling } = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const report = analyzeSaturation({ cells, ceiling: ceiling ?? 1 });

/* eslint-disable no-console */
console.log(JSON.stringify(report, null, 2));
console.log(`\n${report.verdict}`);
