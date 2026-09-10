/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';

import { processJUnitReports } from './process_junit_reports';
import type { ProcessReportsParams } from './process_reports_types';
import type { TestFailure } from './get_failures';
import type { ExistingFailedTestIssue } from './existing_failed_test_issues';

jest.mock('./test_report', () => ({ readTestReport: jest.fn(), getRootMetadata: jest.fn() }));
jest.mock('./get_failures', () => ({ getFailures: jest.fn() }));
jest.mock('./report_metadata', () => ({ getReportMessageIter: jest.fn() }));
jest.mock('./report_failure', () => ({
  createFailureIssue: jest.fn(),
  updateFailureIssue: jest.fn(),
}));
jest.mock('./report_failures_to_es', () => ({ reportFailuresToEs: jest.fn() }));
jest.mock('./report_failures_to_file', () => ({ reportFailuresToFile: jest.fn() }));
jest.mock('./add_messages_to_report', () => ({ addMessagesToReport: jest.fn() }));

const { readTestReport, getRootMetadata } = jest.requireMock('./test_report');
const { getFailures } = jest.requireMock('./get_failures');
const { getReportMessageIter } = jest.requireMock('./report_metadata');
const { createFailureIssue, updateFailureIssue } = jest.requireMock('./report_failure');
const { reportFailuresToEs } = jest.requireMock('./report_failures_to_es');
const { reportFailuresToFile } = jest.requireMock('./report_failures_to_file');

const makeFailure = (i: number): TestFailure => ({
  classname: `suite ${i}`,
  name: `test ${i}`,
  failure: `failure ${i}`,
  time: '1.0',
  likelyIrrelevant: false,
});

const createExistingIssue = (failure: TestFailure): ExistingFailedTestIssue => ({
  classname: failure.classname,
  name: failure.name,
  github: {
    nodeId: `node-${failure.classname}-${failure.name}`,
    number: 1,
    htmlUrl: 'https://github.com/issues/1',
    body: 'body',
  },
});

const createParams = (initialExistingIssues: ExistingFailedTestIssue[] = []) => {
  const trackedIssues = [...initialExistingIssues];
  const existingIssues = {
    loadForFailures: jest.fn(),
    getForFailure: jest.fn((failure: TestFailure) =>
      trackedIssues.find(
        (issue) => issue.classname === failure.classname && issue.name === failure.name
      )
    ),
    addNewlyCreated: jest.fn((failure: TestFailure) => {
      trackedIssues.push(createExistingIssue(failure));
    }),
  };

  const params = {
    log: new ToolingLog(),
    existingIssues,
    buildUrl: 'https://build-url',
    githubApi: {},
    branch: 'main',
    pipeline: 'kibana-on-merge',
    prependTitle: '',
    updateGithub: true,
    indexInEs: true,
    reportUpdate: true,
    bkMeta: {},
  } as unknown as ProcessReportsParams;

  return { params, existingIssues };
};

beforeEach(() => {
  jest.clearAllMocks();
  readTestReport.mockResolvedValue({});
  getRootMetadata.mockReturnValue({});
  getReportMessageIter.mockReturnValue([]);
  createFailureIssue.mockResolvedValue({ html_url: 'https://github.com/issues/1' });
  updateFailureIssue.mockResolvedValue({ newBody: 'body', newCount: 2 });
});

describe('processJUnitReports one-failure-per-report (bail behavior)', () => {
  it('reports the single failure to GitHub as a new issue', async () => {
    getFailures.mockReturnValue([makeFailure(0)]);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    expect(updateFailureIssue).not.toHaveBeenCalled();
  });

  it('reports only the first failure and skips the rest when a report has multiple failures', async () => {
    const failures = [makeFailure(0), makeFailure(1)];
    getFailures.mockReturnValue(failures);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    // Only the first failure opens an issue, emulating `--bail`.
    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    // ES indexing and file reporting still run over every failure — that's real signal we keep.
    expect(reportFailuresToEs).toHaveBeenCalledTimes(1);
    expect(reportFailuresToEs.mock.calls[0][1]).toHaveLength(2);
    expect(reportFailuresToFile).toHaveBeenCalledTimes(1);
    expect(reportFailuresToFile.mock.calls[0][1]).toHaveLength(2);
  });

  it('updates a tracked failure and still creates an issue for the first new failure', async () => {
    const failures = [makeFailure(0), makeFailure(1)];
    getFailures.mockReturnValue(failures);

    // failure-0 is tracked; failure-1 is the first new failure and should still open an issue.
    const { params } = createParams([createExistingIssue(failures[0])]);

    await processJUnitReports(['report.xml'], params);

    expect(updateFailureIssue).toHaveBeenCalledTimes(1);
    expect(createFailureIssue).toHaveBeenCalledTimes(1);
  });

  it('updates a tracked failure even when a new issue was already created in the same report', async () => {
    const failures = [makeFailure(0), makeFailure(1)];
    getFailures.mockReturnValue(failures);

    // failure-0 is new (creates an issue); failure-1 is tracked and must still be updated.
    const { params } = createParams([createExistingIssue(failures[1])]);

    await processJUnitReports(['report.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    expect(updateFailureIssue).toHaveBeenCalledTimes(1);
  });

  it('does not count duplicate classname+name entries toward the new-issue cap', async () => {
    const failures = [
      makeFailure(0),
      { ...makeFailure(0), failure: 'another failure entry for the same test' },
    ];
    getFailures.mockReturnValue(failures);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    // The second entry is a duplicate (same classname+name); it is silently skipped.
    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    expect(updateFailureIssue).not.toHaveBeenCalled();
  });

  it('does not consume the report slot on likely-irrelevant failures', async () => {
    const failures = [makeFailure(0), makeFailure(1)];
    // The first failure is irrelevant, so the second failure is the first one reported to GitHub.
    failures[0].likelyIrrelevant = true;
    getFailures.mockReturnValue(failures);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(1);
  });

  it('resets the one-failure budget for each report path', async () => {
    getFailures.mockReturnValueOnce([makeFailure(0)]).mockReturnValueOnce([makeFailure(1)]);
    const { params } = createParams();

    await processJUnitReports(['report-1.xml', 'report-2.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(2);
  });
});

describe('processJUnitReports cascading failures', () => {
  const makeCascade = () => {
    const rootCause = makeFailure(0);
    const cascading = [
      { ...makeFailure(1), cascading: true },
      { ...makeFailure(2), cascading: true },
    ];
    return { rootCause, cascading, failures: [rootCause, ...cascading] };
  };

  it('reports only the failure that aborted the run to GitHub', async () => {
    const { rootCause, failures } = makeCascade();
    getFailures.mockReturnValue(failures);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    expect(createFailureIssue.mock.calls[0][1]).toBe(rootCause);
  });

  it('does not update tracked issues for cascading failures', async () => {
    const { cascading, failures } = makeCascade();
    getFailures.mockReturnValue(failures);
    // every cascading failure is already tracked, so without the guard each would be bumped
    const { params } = createParams(cascading.map(createExistingIssue));

    await processJUnitReports(['report.xml'], params);

    expect(updateFailureIssue).not.toHaveBeenCalled();
  });

  it('does not consume the new-issue slot', async () => {
    const { cascading } = makeCascade();
    const lateFailure = makeFailure(3);
    getFailures.mockReturnValue([...cascading, lateFailure]);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    expect(createFailureIssue).toHaveBeenCalledTimes(1);
    expect(createFailureIssue.mock.calls[0][1]).toBe(lateFailure);
  });

  it('still indexes them and hands them to the file reporter', async () => {
    const { failures } = makeCascade();
    getFailures.mockReturnValue(failures);
    const { params } = createParams();

    await processJUnitReports(['report.xml'], params);

    expect(reportFailuresToEs.mock.calls[0][1]).toHaveLength(3);
    expect(reportFailuresToFile.mock.calls[0][1]).toHaveLength(3);
  });
});
