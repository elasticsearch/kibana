/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExistingFailedTestIssue } from './existing_failed_test_issues';
import {
  NOT_AVAILABLE,
  formatDurationFromTime,
  formatDurationSeconds,
  formatOwners,
  getConfigPathFromCommandLine,
} from './failure_details';
import type { TestFailure } from './get_failures';
import { getLocationFromClassname, getReportNameFromClassname } from './get_failures';
import type { ScoutTestFailureExtended } from './get_scout_failures';
import type { GithubApi, GithubIssueComment } from './github_api';
import { getIssueMetadata, updateIssueMetadata } from './issue_metadata';

function redactHostnameSuffix(text: string, suffix: string): string {
  const escaped = suffix.replace(/\./g, '\\.');
  return text.replace(
    new RegExp(
      `(?:https?:\\/\\/)?[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\\.${escaped}(?:[^\\s]*)?`,
      'g'
    ),
    () => `<redacted>.${suffix}`
  );
}

const REDACT_HOST_SUFFIXES = ['found.no', 'elastic.co', 'qa.elastic.cloud'] as const;

/**
 * Redacts emails and sensitive hostnames (e.g. *.found.no, *.elastic.co, *.qa.elastic.cloud) from text posted to public GitHub issues.
 */
export function redactSensitiveGithubFailureText(text: string): string {
  let out = text.replace(/\bconsole\.qa\.cld\.elstc\.co\b/g, '<redacted>');
  for (const suffix of REDACT_HOST_SUFFIXES) {
    out = redactHostnameSuffix(out, suffix);
  }
  return out.replace(/\S+@elastic\.co\b/g, '<redacted>@elastic.co');
}

function isScoutFailure(failure: TestFailure): failure is ScoutTestFailureExtended {
  return 'id' in failure && 'target' in failure && 'location' in failure;
}

function truncateFailureBody(failure: string, maxCharacters: number = 8192): string {
  return failure.length <= maxCharacters
    ? failure
    : [
        failure.substring(0, maxCharacters),
        `[report_failure] output truncated to ${maxCharacters} characters`,
      ].join('\n');
}

function getCodeBlocksFromText(text: string): string[] {
  const blocks: string[] = [];
  const codeBlockRe = /```[\r\n]+([\s\S]*?)[\r\n]+```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRe.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * JUnit failure text is a single blob combining the error message and the stack
 * trace. Extract just the message, i.e. everything before the first stack-frame
 * line, falling back to the full blob when the heuristic yields nothing.
 */
export function extractErrorMessage(failureText: string): string {
  const lines = failureText.split('\n');
  const firstStackFrame = lines.findIndex((line) => /^\s+at /.test(line));
  if (firstStackFrame === -1) {
    return failureText.trim();
  }
  const message = lines.slice(0, firstStackFrame).join('\n').trim();
  return message || failureText.trim();
}

interface ErrorMessageForComment {
  /** redacted, truncated message to post; only set when the message is truly new */
  newErrorMessage?: string;
  /** true when the message is already present on the issue (body or a previous comment) */
  alreadyReported: boolean;
}

/**
 * Decide whether the current error message should be posted in the follow-up
 * comment. It is included only when it is truly new: not already contained in
 * any code block of the issue body or of any previous comment. When the
 * message is a known one, `alreadyReported` lets the comment say so instead of
 * silently omitting it.
 */
function getErrorMessageForComment(
  issueBody: string,
  comments: GithubIssueComment[],
  errorMessage: string | undefined
): ErrorMessageForComment {
  const currentErrorMsg = errorMessage ? truncateFailureBody(errorMessage).trim() : '';
  if (!currentErrorMsg) {
    return { alreadyReported: false };
  }

  const redactedCurrent = redactSensitiveGithubFailureText(currentErrorMsg);
  // The current message from CI is raw. Historical blocks are usually already
  // redacted (we redact before posting), but older issues may still hold raw
  // text. Redacting them again is idempotent.
  const alreadyReported = [issueBody, ...comments.map((comment) => comment.body)]
    .flatMap(getCodeBlocksFromText)
    .some((block) => redactSensitiveGithubFailureText(block).includes(redactedCurrent));

  return alreadyReported
    ? { alreadyReported }
    : { newErrorMessage: redactedCurrent, alreadyReported };
}

const ALREADY_REPORTED_NOTE = 'Error message matches a failure already reported on this issue.';

/**
 * Render the part of a follow-up comment below the build link: the error
 * message when it is new to this issue, a short note when it is a repeat of a
 * known one, or nothing when no message was available to compare.
 */
function renderErrorMessageSection({
  newErrorMessage,
  alreadyReported,
}: ErrorMessageForComment): string {
  if (newErrorMessage) {
    return `\n\nNew error message:\n\`\`\`\n${newErrorMessage}\n\`\`\``;
  }
  if (alreadyReported) {
    return `\n\n${ALREADY_REPORTED_NOTE}`;
  }
  return '';
}

/**
 * Render a `| Field | Value |` markdown table. Shared by all test types so the
 * issue format stays aligned.
 */
function renderDetailsTable(rows: Array<[string, string]>): string[] {
  return [
    '| Field | Value |',
    '|-------|-------|',
    ...rows.map(([field, value]) => `| ${field} | ${value || NOT_AVAILABLE} |`),
  ];
}

/*
 * The `JUnit` functions below handle every failure that arrives as JUnit XML —
 * FTR, Jest, and Cypress — as opposed to the `Scout` ones, which handle Scout's
 * NDJSON failure reports.
 */

function createJUnitTitle(failure: TestFailure, prependTitle: string): string {
  if (prependTitle && prependTitle.trim() !== '') {
    return `Failing test: ${prependTitle} ${failure.classname} - ${failure.name}`;
  }
  return `Failing test: ${failure.classname} - ${failure.name}`;
}

function createScoutTitle(failure: ScoutTestFailureExtended): string {
  return `Failing test: ${failure.classname} - ${failure.name}`;
}

function createJUnitBody(
  failure: TestFailure,
  buildUrl: string,
  branch: string,
  pipeline: string
): string {
  const failureBody = redactSensitiveGithubFailureText(truncateFailureBody(failure.failure));

  const location = failure.location ?? getLocationFromClassname(failure.classname);
  const detailsTable = renderDetailsTable([
    ['Report name', getReportNameFromClassname(failure.classname)],
    ['Location', location === 'unknown' ? '' : location],
    ['Duration', formatDurationFromTime(failure.time)],
    ['Config path', getConfigPathFromCommandLine(failure.commandLine)],
    ['Code Owners', formatOwners(failure.owners)],
  ]);

  const bodyContent = [
    'A test failed on a tracked branch',
    '',
    '**Test Details:**',
    '',
    ...detailsTable,
    '',
    '```',
    failureBody,
    '```',
    '',
    `First failure: [${pipeline || 'CI Build'} - ${branch}](${buildUrl})`,
  ];

  const metadata: Record<string, string | number> = {
    'test.class': failure.classname,
    'test.name': failure.name,
    'test.failCount': 1,
  };
  if (failure.testType) {
    metadata['test.type'] = failure.testType;
  }

  return updateIssueMetadata(bodyContent.join('\n'), metadata);
}

/**
 * Create issue body for Scout failures
 */
function createScoutBody(
  failure: ScoutTestFailureExtended,
  buildUrl: string,
  branch: string,
  pipeline: string
): string {
  const failureBody = redactSensitiveGithubFailureText(truncateFailureBody(failure.failure));

  // Create table format for Scout test details
  const scoutDetailsTable = renderDetailsTable([
    ['Test ID', failure.id],
    ['Target', failure.target],
    ['Location', failure.location],
    ['Duration', formatDurationSeconds(failure.duration / 1000)],
    [
      'Module',
      failure.kibanaModule ? `${failure.kibanaModule.id} (${failure.kibanaModule.type})` : '',
    ],
    ['Config path', getConfigPathFromCommandLine(failure.commandLine)],
    ['Code Owners', formatOwners(failure.owners)],
  ]);

  const bodyContent = [
    'A test failed on a tracked branch',
    '',
    '**Scout Test Details:**',
    '',
    ...scoutDetailsTable,
    '',
    '```',
    failureBody,
    '```',
    '',
    `First failure: [${pipeline || 'CI Build'} - ${branch}](${buildUrl})`,
  ];

  // Add screenshot information if available
  if (failure.attachments && failure.attachments.length > 0) {
    const hasScreenshots = failure.attachments.some((attachment) =>
      attachment.contentType.startsWith('image/')
    );

    if (hasScreenshots) {
      bodyContent.push(
        '',
        'Failure screenshots are available in the Buildkite HTML report and artifacts.'
      );
    }
  }

  return updateIssueMetadata(bodyContent.join('\n'), {
    'test.class': failure.classname,
    'test.name': failure.name,
    'test.failCount': 1,
    'test.type': 'scout',
  });
}

async function createJUnitFailureIssue(
  buildUrl: string,
  failure: TestFailure,
  api: GithubApi,
  branch: string,
  pipeline: string,
  prependTitle: string
) {
  const title = createJUnitTitle(failure, prependTitle);
  const body = createJUnitBody(failure, buildUrl, branch, pipeline);
  const labels = ['failed-test'];

  return await api.createIssue(title, body, labels);
}

async function createScoutFailureIssue(
  buildUrl: string,
  failure: ScoutTestFailureExtended,
  api: GithubApi,
  branch: string,
  pipeline: string
) {
  const title = createScoutTitle(failure);
  const body = createScoutBody(failure, buildUrl, branch, pipeline);
  const labels = ['failed-test', 'scout-playwright'];

  return await api.createIssue(title, body, labels);
}

export async function createFailureIssue(
  buildUrl: string,
  failure: TestFailure | ScoutTestFailureExtended,
  api: GithubApi,
  branch: string,
  pipeline: string,
  prependTitle: string = ''
) {
  if (isScoutFailure(failure)) {
    return createScoutFailureIssue(buildUrl, failure, api, branch, pipeline);
  } else {
    return createJUnitFailureIssue(buildUrl, failure, api, branch, pipeline, prependTitle);
  }
}

function createJUnitComment(
  buildUrl: string,
  branch: string,
  pipeline: string,
  errorMessage: ErrorMessageForComment
): string {
  /*
   * The error message is only included when it has not been reported on the
   * issue before (see getErrorMessageForComment), so repeat failures with a
   * known error stay compact while genuinely new errors surface immediately.
   */
  return `New failure: [${
    pipeline || 'CI Build'
  } - ${branch}](${buildUrl})${renderErrorMessageSection(errorMessage)}`;
}

function createScoutComment(
  failure: ScoutTestFailureExtended,
  buildUrl: string,
  branch: string,
  pipeline: string,
  errorMessage: ErrorMessageForComment
): string {
  /*
   * When there's a new error message, include it in the comment. This provides
   * more context on how the failure has changed since the issue was opened or
   * last updated. Example:
   *
   * New failure for "local-serverless-observability_complete" target: [kibana-on-merge - main](https://buildkite.com/elastic/kibana-on-merge/builds/123456)
   *
   * New error message:
   * ```
   * Error: expect(locator).toBeEnabled() failed
   *
   * Locator: locator('notExist')
   * Expected: enabled
   * Timeout: 10000ms
   * Error: element(s) not found
   *
   * Call log:
   *   - Expect "toBeEnabled" with timeout 10000ms
   *   - waiting for locator('notExist')
   * ```
   *
   * When the error message was already reported on this issue (body or any
   * previous comment), a short note replaces the code block. When no message
   * was available to compare, only the link line is posted.
   */
  return `New failure for "${failure.target}" target: [${
    pipeline || 'CI Build'
  } - ${branch}](${buildUrl})${renderErrorMessageSection(errorMessage)}`;
}

async function updateJUnitFailureIssue(
  buildUrl: string,
  issue: ExistingFailedTestIssue,
  api: GithubApi,
  branch: string,
  pipeline: string,
  failure?: TestFailure
) {
  const newCount = getIssueMetadata(issue.github.body, 'test.failCount', 0) + 1;
  const newBody = updateIssueMetadata(issue.github.body, {
    'test.failCount': newCount,
  });

  await api.editIssueBodyAndEnsureOpen(issue.github.number, newBody);

  let errorMessage: ErrorMessageForComment = { alreadyReported: false };
  if (failure) {
    const comments = await api.getIssueComments(issue.github.number);
    errorMessage = getErrorMessageForComment(
      issue.github.body,
      comments,
      extractErrorMessage(failure.failure)
    );
  }

  const commentText = createJUnitComment(buildUrl, branch, pipeline, errorMessage);
  await api.addIssueComment(issue.github.number, commentText);

  return { newBody, newCount };
}

async function updateScoutFailureIssue(
  buildUrl: string,
  issue: ExistingFailedTestIssue,
  api: GithubApi,
  branch: string,
  pipeline: string,
  failure: ScoutTestFailureExtended
) {
  const newCount = getIssueMetadata(issue.github.body, 'test.failCount', 0) + 1;
  const newBody = updateIssueMetadata(issue.github.body, {
    'test.failCount': newCount,
  });

  await api.editIssueBodyAndEnsureOpen(issue.github.number, newBody);

  const comments = await api.getIssueComments(issue.github.number);
  const errorMessage = getErrorMessageForComment(issue.github.body, comments, failure.errorMessage);

  const commentText = createScoutComment(failure, buildUrl, branch, pipeline, errorMessage);
  await api.addIssueComment(issue.github.number, commentText);

  return { newBody, newCount };
}

export async function updateFailureIssue(
  buildUrl: string,
  issue: ExistingFailedTestIssue,
  api: GithubApi,
  branch: string,
  pipeline: string,
  failure?: TestFailure | ScoutTestFailureExtended
) {
  if (failure && isScoutFailure(failure)) {
    return updateScoutFailureIssue(buildUrl, issue, api, branch, pipeline, failure);
  } else {
    return updateJUnitFailureIssue(buildUrl, issue, api, branch, pipeline, failure);
  }
}
