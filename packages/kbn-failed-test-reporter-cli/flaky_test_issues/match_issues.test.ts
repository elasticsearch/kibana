/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { updateIssueMetadata } from '../failed_tests_reporter/issue_metadata';
import { candidateIssues, describeIssue, findMatchingIssues, indexIssues } from './match_issues';
import { groupIntoSuites } from './suites';
import { flakyTest, githubIssue, SUITE_PATH } from './test_fixtures';

/** Body as `report_failed_tests` writes it: optional details table, then the metadata footer. */
const failedTestBody = (
  metadata: Record<string, string>,
  rows: Array<[string, string]> = []
): string => {
  const table = rows.map(([field, value]) => `| ${field} | ${value} |`).join('\n');
  return updateIssueMetadata(`A test failed on a tracked branch\n\n${table}`, metadata);
};

const scoutIssue = (number: number, testId: string, name: string, filePath = SUITE_PATH) =>
  githubIssue({
    number,
    title: `Failing test: DefaultStatusAlert - ${name}`,
    body: failedTestBody(
      { 'test.class': 'DefaultStatusAlert', 'test.name': name, 'test.type': 'scout' },
      [
        ['Test ID', testId],
        ['Location', filePath],
      ]
    ),
  });

const jestIssue = (number: number, directory: string, name: string) =>
  githubIssue({
    number,
    title: `Failing test: Jest Tests.${directory} - ${name}`,
    body: failedTestBody({ 'test.class': `Jest Tests.${directory}`, 'test.name': name }),
  });

const ftrIssue = (number: number, filePath: string, name: string) => {
  const className = `Chrome X-Pack UI Functional Tests.${filePath.replace(/\.ts$/, '·ts')}`;
  return githubIssue({
    number,
    title: `Failing test: ${className} - ${name}`,
    body: failedTestBody({ 'test.class': className, 'test.name': name }),
  });
};

describe('describeIssue', () => {
  it('reads the suite file, the Scout test id and location, the Jest directory and the test name', () => {
    expect(describeIssue(scoutIssue(1, 'abc-def', 'creates default alert'))).toMatchObject({
      suiteFilePath: undefined,
      scoutTestId: 'abc-def',
      filePath: SUITE_PATH,
      jestDirectory: undefined,
      testName: 'creates default alert',
    });
    expect(describeIssue(jestIssue(2, 'src/plugins/a', 'A b c'))).toMatchObject({
      scoutTestId: undefined,
      filePath: undefined,
      jestDirectory: 'src/plugins/a',
      testName: 'A b c',
    });
  });

  it('reads the suite file of a suite issue title', () => {
    expect(
      describeIssue(githubIssue({ number: 5, title: `Flaky FTR test suite: ${SUITE_PATH}` }))
    ).toMatchObject({ suiteFilePath: SUITE_PATH, testName: undefined });
  });

  it('restores dots in file paths and copes with hand-written issues', () => {
    const details = describeIssue(ftrIssue(3, 'x-pack/test/a.ts', 'a b'));
    expect(details.filePath).toBe('x-pack/test/a.ts');
    expect(details.text).toContain('x-pack/test/a.ts');
    expect(details.text).not.toContain('·');

    expect(describeIssue(githubIssue({ number: 4, title: 'Flaky a.ts', body: '' }))).toEqual({
      issue: expect.objectContaining({ number: 4 }),
      suiteFilePath: undefined,
      scoutTestId: undefined,
      filePath: undefined,
      jestDirectory: undefined,
      testName: undefined,
      text: 'Flaky a.ts\n',
    });
  });
});

describe('indexIssues / candidateIssues', () => {
  const numbers = (details: ReturnType<typeof candidateIssues>) =>
    details.map(({ issue }) => issue.number).sort();

  it('indexes issues by every file name they mention, with JUnit dots restored', () => {
    const index = indexIssues([
      describeIssue(ftrIssue(1, 'x-pack/test/a.ts', 'a b')),
      describeIssue(githubIssue({ number: 2, title: 'Flaky Scout test suite: src/b/c.spec.ts' })),
      describeIssue(
        githubIssue({ number: 3, body: 'Fails in `src/d/e.test.tsx` and mentions f.js too' })
      ),
    ]);

    expect([...index.byFileName.keys()].sort()).toEqual([
      'a.ts',
      'c.spec.ts',
      'e.test.tsx',
      'f.js',
    ]);
    expect(index.byFileName.get('a.ts')?.map(({ issue }) => issue.number)).toEqual([1]);
  });

  it('selects the issues naming the file, the Jest directory or one of the Scout test ids', () => {
    const [suite] = groupIntoSuites([
      flakyTest({ testId: 'id-1', filePath: 'src/plugins/a/b.test.ts' }),
      flakyTest({ testId: 'id-2', filePath: 'src/plugins/a/b.test.ts' }),
    ]);
    const index = indexIssues([
      describeIssue(githubIssue({ number: 1, body: 'see src/plugins/a/b.test.ts' })),
      describeIssue(githubIssue({ number: 2, body: 'see elsewhere/b.test.ts' })),
      describeIssue(jestIssue(3, 'src/plugins/a', 'A b c')),
      describeIssue(jestIssue(4, 'src/plugins/other', 'A b c')),
      describeIssue(scoutIssue(5, 'id-2', 'some test', 'moved/renamed.spec.ts')),
      describeIssue(scoutIssue(6, 'id-9', 'some test', 'moved/renamed.spec.ts')),
      describeIssue(githubIssue({ number: 7, body: 'nothing to do with it' })),
    ]);

    expect(numbers(candidateIssues(suite, index))).toEqual([1, 2, 3, 5]);
  });

  it('finds the same matches through the index as against every issue', () => {
    const [suite] = groupIntoSuites([
      flakyTest({ testId: 'id-1', title: 'creates default alert' }),
    ]);
    const details = [
      describeIssue(scoutIssue(10, 'id-1', 'creates default alert')),
      describeIssue(githubIssue({ number: 11, title: `Flaky Scout test suite: ${SUITE_PATH}` })),
      describeIssue(scoutIssue(12, 'id-x', 'another test')),
      describeIssue(scoutIssue(13, 'id-y', 'unrelated', 'x-pack/other.spec.ts')),
      describeIssue(jestIssue(14, 'src/plugins/a', 'A creates default alert')),
    ];

    const viaIndex = findMatchingIssues(suite, candidateIssues(suite, indexIssues(details)));
    expect(viaIndex).toEqual(findMatchingIssues(suite, details));
    expect(viaIndex.map(({ issue }) => issue.number)).toEqual([11, 10, 12]);
  });
});

describe('findMatchingIssues', () => {
  it('matches suite issues by title, ahead of per-test issues, open ones ahead of closed ones', () => {
    const [suite] = groupIntoSuites([
      flakyTest({ testId: 'id-1', title: 'creates default alert' }),
    ]);
    const matches = findMatchingIssues(suite, [
      describeIssue(scoutIssue(10, 'id-1', 'creates default alert')),
      describeIssue(
        githubIssue({ number: 11, title: `Flaky Scout test suite: ${SUITE_PATH}`, state: 'closed' })
      ),
      describeIssue(githubIssue({ number: 12, title: `Flaky test suite: ${SUITE_PATH}` })),
      describeIssue(githubIssue({ number: 13, title: 'Flaky Scout test suite: other.spec.ts' })),
    ]);

    expect(matches.map(({ issue, match }) => [issue.number, match])).toEqual([
      [12, 'suite'],
      [11, 'suite'],
      [10, 'test'],
    ]);
  });

  it('matches Scout issues by test id, or by file for other tests of the suite', () => {
    const [suite] = groupIntoSuites([
      flakyTest({ testId: 'id-1', title: 'creates default alert' }),
      flakyTest({ testId: 'id-2', title: 'recovers' }),
    ]);
    const related = findMatchingIssues(suite, [
      describeIssue(scoutIssue(10, 'id-1', 'creates default alert')),
      describeIssue(scoutIssue(11, 'id-other', 'some other test of the file')),
      describeIssue(scoutIssue(12, 'id-2', 'recovers', 'other/file.spec.ts')),
      describeIssue(scoutIssue(13, 'id-elsewhere', 'recovers', 'other/file.spec.ts')),
    ]);

    expect(related.map(({ issue, match }) => [issue.number, match])).toEqual([
      [12, 'test'],
      [10, 'test'],
      [11, 'file'],
    ]);
  });

  it('matches Jest issues by directory and test name, since the classname has no file', () => {
    const [suite] = groupIntoSuites([
      flakyTest({ filePath: 'src/plugins/a/client.test.ts', title: 'drops every stored event' }),
    ]);
    const related = findMatchingIssues(suite, [
      describeIssue(
        jestIssue(20, 'src/plugins/a', 'ConversationClient events drops every stored event')
      ),
      // Same directory, another test: could be any file of the directory
      describeIssue(jestIssue(21, 'src/plugins/a', 'ConversationClient other test')),
      // Same test name in another directory
      describeIssue(jestIssue(22, 'src/plugins/b', 'drops every stored event')),
    ]);

    expect(related.map(({ issue, match }) => [issue.number, match])).toEqual([[20, 'test']]);
  });

  it('matches FTR issues by the file in the classname and the test title suffix', () => {
    const [suite] = groupIntoSuites([
      flakyTest({
        filePath: 'x-pack/test/functional/apps/ml/synchronize.ts',
        title: 'should have nothing to sync anymore',
      }),
    ]);
    const related = findMatchingIssues(suite, [
      describeIssue(
        ftrIssue(
          30,
          'x-pack/test/functional/apps/ml/synchronize.ts',
          'machine learning - stack management jobs synchronize should have nothing to sync anymore'
        )
      ),
      describeIssue(
        ftrIssue(31, 'x-pack/test/functional/apps/ml/synchronize.ts', 'should sync everything')
      ),
      describeIssue(
        ftrIssue(
          32,
          'x-pack/test/functional/apps/ml/other.ts',
          'should have nothing to sync anymore'
        )
      ),
    ]);

    expect(related.map(({ issue, match }) => [issue.number, match])).toEqual([
      [30, 'test'],
      [31, 'file'],
    ]);
  });

  it('matches by test and file name when the file moved since the issue was filed', () => {
    const [suite] = groupIntoSuites([
      flakyTest({
        testId: 'new-id',
        filePath: 'x-pack/plugins/a/test/scout/alerting/ui/tests/default_status_alert.spec.ts',
        title: 'creates default alert',
      }),
    ]);
    const related = findMatchingIssues(suite, [
      describeIssue(
        scoutIssue(
          50,
          'old-id',
          'creates default alert',
          'x-pack/plugins/a/test/scout/ui/tests/default_status_alert.spec.ts'
        )
      ),
      // Same file name, different test
      describeIssue(
        scoutIssue(
          51,
          'other-id',
          'other test',
          'x-pack/plugins/a/test/scout/ui/tests/default_status_alert.spec.ts'
        )
      ),
      // Same test name, different file name
      describeIssue(
        scoutIssue(52, 'yet-another', 'creates default alert', 'x-pack/plugins/b/other.spec.ts')
      ),
    ]);

    expect(related.map(({ issue, match }) => [issue.number, match])).toEqual([[50, 'moved']]);
  });

  it('does not match a test title alone, without the file or directory', () => {
    const [suite] = groupIntoSuites([flakyTest({ title: 'should render' })]);
    const related = findMatchingIssues(suite, [
      describeIssue(
        githubIssue({
          number: 40,
          title: 'Failing test: Other suite - should render',
          body: failedTestBody({
            'test.class': 'Other suite',
            'test.name': 'Other suite should render',
          }),
        })
      ),
    ]);
    expect(related).toEqual([]);
  });
});
