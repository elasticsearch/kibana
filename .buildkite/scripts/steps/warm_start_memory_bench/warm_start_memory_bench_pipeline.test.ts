/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import path from 'path';
import { parse as loadYaml } from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PIPELINE_YML = path.resolve(
  REPO_ROOT,
  '.buildkite/pipelines/pull_request/warm_start_memory_bench.yml'
);
const PIPELINE_TS = path.resolve(
  REPO_ROOT,
  '.buildkite/scripts/pipelines/pull_request/pipeline.ts'
);

describe('warm_start_memory_bench pipeline', () => {
  it('defines a soft-fail step that depends on build', () => {
    const doc = loadYaml(fs.readFileSync(PIPELINE_YML, 'utf8')) as {
      steps: Array<Record<string, unknown>>;
    };

    expect(doc.steps).toHaveLength(1);
    expect(doc.steps[0]).toMatchObject({
      key: 'warm_start_memory_bench',
      soft_fail: true,
      depends_on: ['build'],
      command: '.buildkite/scripts/steps/warm_start_memory_bench.sh',
    });
    expect(doc.steps[0].agents).toMatchObject({
      machineType: 'c4d-standard-16',
      diskType: 'hyperdisk-balanced',
    });
  });

  it('is emitted unconditionally for non-skipped pull request pipelines', () => {
    const pipelineSource = fs.readFileSync(PIPELINE_TS, 'utf8');

    expect(pipelineSource).toContain(
      "getPipeline('.buildkite/pipelines/pull_request/warm_start_memory_bench.yml', cancelable)"
    );
    expect(pipelineSource).not.toMatch(/ci:[^\s'"]+[\s\S]{0,200}warm_start_memory_bench\.yml/);
  });
});
