/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';

import { toRepoRelativePaths, trimFailureText } from './failure_text';

describe('toRepoRelativePaths', () => {
  it('strips the buildkite agent checkout prefix', () => {
    expect(
      toRepoRelativePaths(
        'Error: Timeout of 120000ms exceeded. (/opt/buildkite-agent/builds/bk-agent-prod-gcp-1785876936796953378/elastic/kibana-pull-request/kibana/x-pack/platform/test/serverless/functional/test_suites/saved_objects_management/find.ts)'
      )
    ).toBe(
      'Error: Timeout of 120000ms exceeded. (x-pack/platform/test/serverless/functional/test_suites/saved_objects_management/find.ts)'
    );
  });

  it('strips the local checkout prefix', () => {
    expect(toRepoRelativePaths(`    at Context.<anonymous> (${REPO_ROOT}/src/a.ts:1:1)`)).toBe(
      '    at Context.<anonymous> (src/a.ts:1:1)'
    );
  });

  it('rewrites every occurrence so the same error compares equal across builds', () => {
    const build = (agent: string) =>
      [
        `Error: boom (/opt/buildkite-agent/builds/${agent}/elastic/kibana-pull-request/kibana/x-pack/a.ts)`,
        `    at fn (/opt/buildkite-agent/builds/${agent}/elastic/kibana-pull-request/kibana/x-pack/b.ts:2:3)`,
      ].join('\n');

    expect(toRepoRelativePaths(build('bk-agent-1'))).toBe(toRepoRelativePaths(build('bk-agent-2')));
  });

  it('leaves text without checkout paths alone', () => {
    const text = 'Error: boom\n    at fn (node:internal/timers:605:17)';
    expect(toRepoRelativePaths(text)).toBe(text);
  });
});

describe('trimFailureText', () => {
  it('drops runtime frames without counting them as trimmed', () => {
    const { summary, trimmed } = trimFailureText(
      [
        'Error: Timeout of 120000ms exceeded. (x-pack/a/find.ts)',
        '    at listOnTimeout (node:internal/timers:605:17)',
        '    at processTimers (node:internal/timers:541:7) {',
        "  code: 'ERR_MOCHA_TIMEOUT',",
        '  timeout: 120000,',
        '}',
      ].join('\n')
    );

    expect(trimmed).toBe(false);
    expect(summary).toBe(
      [
        'Error: Timeout of 120000ms exceeded. (x-pack/a/find.ts)',
        '{',
        "  code: 'ERR_MOCHA_TIMEOUT',",
        '  timeout: 120000,',
        '}',
      ].join('\n')
    );
  });

  it('keeps frames that point at repository code', () => {
    const { summary, trimmed } = trimFailureText(
      [
        'Error: retry.try timeout',
        '    at lastError (src/platform/test/common/services/retry/retry_for_success.ts:28:9)',
        '    at Object.throwDecodedError (node_modules/selenium-webdriver/lib/error.js:550:15)',
      ].join('\n')
    );

    expect(trimmed).toBe(false);
    expect(summary).toBe(
      [
        'Error: retry.try timeout',
        '    at lastError (src/platform/test/common/services/retry/retry_for_success.ts:28:9)',
      ].join('\n')
    );
  });

  it('reports nothing as trimmed when every frame is kept', () => {
    const text = 'Error: boom\n    at Context.<anonymous> (x-pack/a.ts:1:1)';

    expect(trimFailureText(text)).toEqual({ summary: text, trimmed: false });
  });

  it('caps how many frames it keeps', () => {
    const frames = Array.from({ length: 9 }, (_, i) => `    at fn${i} (x-pack/a.ts:${i}:1)`);
    const { summary, trimmed } = trimFailureText(['Error: boom', ...frames].join('\n'));

    expect(trimmed).toBe(true);
    expect(summary.split('\n')).toEqual([
      'Error: boom',
      ...frames.slice(0, 6),
      '    ... 3 more stack frames hidden',
    ]);
  });

  it('passes through text without a stack trace', () => {
    expect(trimFailureText('  expected 1 to equal 2  ')).toEqual({
      summary: 'expected 1 to equal 2',
      trimmed: false,
    });
  });
});
