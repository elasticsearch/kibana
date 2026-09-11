/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import { buildJudgeAuthHeader, loadSuiteRubricItems } from './rejudge';

describe('buildJudgeAuthHeader', () => {
  it('base64-encodes raw user:pass credentials', () => {
    expect(buildJudgeAuthHeader({ basicAuth: 'elastic:changeme' })).toBe(
      `Basic ${Buffer.from('elastic:changeme').toString('base64')}`
    );
  });

  // Regression: a pre-encoded JUDGE_KBN_AUTH double-encodes, and the resulting
  // 401 only surfaces after every planned cell has been judged and discarded --
  // an entire AD rejudge (99 cells, two judges) was lost to it.
  it('rejects an already base64-encoded value instead of double-encoding', () => {
    const encoded = Buffer.from('elastic:changeme').toString('base64');
    expect(() => buildJudgeAuthHeader({ basicAuth: encoded })).toThrow(/raw "user:pass"/);
  });

  it('rejects a value that already carries the Basic scheme', () => {
    expect(() => buildJudgeAuthHeader({ basicAuth: 'Basic abc123' })).toThrow(/raw "user:pass"/);
  });

  it('falls back to the API key when no basic auth is given', () => {
    expect(buildJudgeAuthHeader({ apiKey: 'abc' })).toBe('ApiKey abc');
  });

  it('prefers basic auth over an API key, matching the stack that needs it', () => {
    expect(buildJudgeAuthHeader({ basicAuth: 'a:b', apiKey: 'abc' })).toBe(
      `Basic ${Buffer.from('a:b').toString('base64')}`
    );
  });

  it('returns undefined when neither credential is present', () => {
    expect(buildJudgeAuthHeader({})).toBeUndefined();
  });
});

describe('loadSuiteRubricItems', () => {
  // The suite owns the rubric; the jury keeps a fallback copy. These tests pin
  // the resolution so a suite-side rubric change cannot be silently shadowed by
  // the stale copy -- the exact drift that let a rejudge grade a collapsed
  // "5 of 7 -> Y or N" rubric while the suite scored seven items separately.
  let root: string;

  beforeEach(() => {
    root = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'rubric-load-'));
  });

  afterEach(() => {
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const writeEvaluator = (body: string) => {
    const evaluatorsDir = Path.join(root, 'src', 'evaluators');
    Fs.mkdirSync(evaluatorsDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(evaluatorsDir, 'attack_discovery_rubric_evaluator.ts'),
      body,
      'utf8'
    );
    const datasetsDir = Path.join(root, 'src', 'datasets');
    Fs.mkdirSync(datasetsDir, { recursive: true });
    const datasetPath = Path.join(datasetsDir, 'some_dataset.ts');
    Fs.writeFileSync(datasetPath, 'export const examples = [];\n', 'utf8');
    return datasetPath;
  };

  it('loads the rubric items the suite exports', async () => {
    const datasetPath = writeEvaluator(
      "export const ATTACK_DISCOVERY_RUBRIC_ITEMS = ['item one', 'item two', 'item three'];\n"
    );

    await expect(loadSuiteRubricItems(datasetPath)).resolves.toEqual([
      'item one',
      'item two',
      'item three',
    ]);
  });

  it('returns undefined when the suite exports no rubric items', async () => {
    const datasetPath = writeEvaluator('export const SOMETHING_ELSE = 1;\n');

    await expect(loadSuiteRubricItems(datasetPath)).resolves.toBeUndefined();
  });

  it('returns undefined rather than throwing when the evaluator is absent', async () => {
    const datasetsDir = Path.join(root, 'src', 'datasets');
    Fs.mkdirSync(datasetsDir, { recursive: true });
    const datasetPath = Path.join(datasetsDir, 'orphan_dataset.ts');
    Fs.writeFileSync(datasetPath, 'export const examples = [];\n', 'utf8');

    await expect(loadSuiteRubricItems(datasetPath)).resolves.toBeUndefined();
  });

  it('ignores a non-string rubric export instead of passing it to the judge', async () => {
    // A malformed export must not reach the judge as criteria: it would be
    // stringified into nonsense and graded as if it were a requirement.
    const datasetPath = writeEvaluator('export const ATTACK_DISCOVERY_RUBRIC_ITEMS = [1, 2, 3];\n');

    await expect(loadSuiteRubricItems(datasetPath)).resolves.toBeUndefined();
  });
});
