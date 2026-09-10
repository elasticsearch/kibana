/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';
import Os from 'os';

import { ToolingLog } from '@kbn/tooling-log';

import type { BuildkiteMetadata } from './buildkite_metadata';
import type { TestFailure } from './get_failures';
import { partitionCascadingFailures, reportFailuresToFile } from './report_failures_to_file';

const makeFailure = (name: string, overrides: Partial<TestFailure> = {}): TestFailure => ({
  classname: 'Serverless Search Functional Tests.x-pack/a·ts',
  name,
  time: '120.004',
  failure: `Error: Timeout of 120000ms exceeded. (x-pack/a.ts)
    at listOnTimeout (node:internal/timers:605:17)`,
  likelyIrrelevant: false,
  location: 'x-pack/a.ts',
  testType: 'ftr',
  owners: 'elastic/kibana-operations',
  commandLine: 'node scripts/functional_tests --config=x-pack/a/config.ts',
  ...overrides,
});

const bkMeta = {
  buildId: 'build-1',
  jobId: 'job-1',
  jobName: 'FTR Configs #1',
  url: 'https://buildkite.com/elastic/kibana-pull-request/builds/1',
  jobUrl: 'https://buildkite.com/elastic/kibana-pull-request/builds/1#job-1',
} as BuildkiteMetadata;

describe('partitionCascadingFailures', () => {
  it('folds a cascade into the failure that precedes it', () => {
    const rootCause = makeFailure('root cause');
    const cascading = [
      makeFailure('after all 1', { cascading: true }),
      makeFailure('after all 2', { cascading: true }),
    ];

    expect(partitionCascadingFailures([rootCause, ...cascading])).toEqual({
      reported: [rootCause],
      cascading,
      rootCause,
    });
  });

  it('reports every failure when there is no cascade', () => {
    const failures = [makeFailure('a'), makeFailure('b')];

    expect(partitionCascadingFailures(failures)).toEqual({ reported: failures, cascading: [] });
  });

  it('has nothing to fold into when the cascade comes first', () => {
    const failures = [makeFailure('a', { cascading: true })];

    expect(partitionCascadingFailures(failures)).toEqual({ reported: failures, cascading: [] });
  });
});

describe('reportFailuresToFile', () => {
  let cwd: string;
  let tmpDir: string;

  const readArtifacts = () => {
    const dir = Path.join(tmpDir, 'target', 'test_failures');
    return Fs.existsSync(dir) ? Fs.readdirSync(dir).sort() : [];
  };

  // `<wbr />` is only a wrapping hint, so drop it to keep the content assertions readable
  const readHtml = () => {
    const dir = Path.join(tmpDir, 'target', 'test_failures');
    const [html] = Fs.readdirSync(dir).filter((file) => file.endsWith('.html'));
    return Fs.readFileSync(Path.join(dir, html), 'utf8').replaceAll('<wbr />', '');
  };

  beforeEach(() => {
    cwd = process.cwd();
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'failed-test-reporter-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(cwd);
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const report = (failures: TestFailure[]) =>
    reportFailuresToFile(new ToolingLog(), failures, bkMeta, {});

  it('writes one set of artifacts per failure', async () => {
    await report([makeFailure('a'), makeFailure('b')]);

    expect(readArtifacts().filter((file) => file.endsWith('.html'))).toHaveLength(2);
  });

  it('writes no artifacts for cascading failures', async () => {
    await report([
      makeFailure('root cause'),
      makeFailure('after all 1', { cascading: true }),
      makeFailure('after all 2', { cascading: true }),
    ]);

    expect(readArtifacts().filter((file) => file.endsWith('.html'))).toHaveLength(1);
  });

  it('lists the aborted runnables on the report of the failure that caused the abort', async () => {
    await report([
      makeFailure('root cause'),
      makeFailure('"after all" hook: afterTestSuite.trigger', { cascading: true }),
    ]);

    const html = readHtml();
    expect(html).toContain('This failure aborted the run');
    expect(html).toContain('&quot;after all&quot; hook: afterTestSuite.trigger');
  });

  it('omits the aborted section when nothing cascaded', async () => {
    await report([makeFailure('a')]);

    expect(readHtml()).not.toContain('This failure aborted the run');
  });

  it('offers the full stack behind a toggle when repository frames were cut', async () => {
    const frames = Array.from({ length: 9 }, (_, i) => `    at fn${i} (x-pack/a.ts:${i}:1)`);
    await report([makeFailure('a', { failure: ['Error: boom', ...frames].join('\n') })]);

    const html = readHtml();
    expect(html).toContain('... 3 more stack frames hidden');
    expect(html).toContain('<summary>Full stack trace</summary>');
    expect(html).toContain('at fn8 (x-pack/a.ts:8:1)');
  });

  it('omits the full stack toggle when the summary lost nothing worth reading', async () => {
    await report([makeFailure('a')]);

    const html = readHtml();
    expect(html).not.toContain('Full stack trace');
    expect(html).not.toContain('stack frames hidden');
  });

  it('renders the failure details', async () => {
    await report([makeFailure('a', { failureCount: 3, githubIssue: 'https://gh/issues/42' })]);

    const html = readHtml();
    expect(html).toContain('<code>x-pack/a.ts</code>');
    expect(html).toContain('<code>x-pack/a/config.ts</code>');
    expect(html).toContain('elastic/kibana-operations');
    expect(html).toContain('120.00s');
    expect(html).toContain('>3</span>');
    expect(html).toContain('>#42</a>');
  });

  it('collapses standard output when there is any', async () => {
    await report([makeFailure('a', { 'system-out': 'the ftr log' })]);

    expect(readHtml()).toContain('<summary>Standard output</summary>');
  });

  it('records the aborted runnables in the log and json artifacts', async () => {
    await report([makeFailure('root cause'), makeFailure('skipped hook', { cascading: true })]);

    const dir = Path.join(tmpDir, 'target', 'test_failures');
    const [json] = Fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
    const [log] = Fs.readdirSync(dir).filter((file) => file.endsWith('.log'));

    expect(JSON.parse(Fs.readFileSync(Path.join(dir, json), 'utf8')).abortedRunnables).toEqual([
      'skipped hook',
    ]);
    expect(Fs.readFileSync(Path.join(dir, log), 'utf8')).toContain(
      'Run aborted after this failure:'
    );
  });
});
