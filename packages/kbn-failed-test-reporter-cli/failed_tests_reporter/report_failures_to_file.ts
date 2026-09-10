/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';
import { createHash } from 'crypto';

import globby from 'globby';
import type { ToolingLog } from '@kbn/tooling-log';
import { REPO_ROOT } from '@kbn/repo-info';
import { escape } from 'he';
import { FtrScreenshotFilename } from '@kbn/ftr-screenshot-filename';
import { JourneyScreenshots } from '@kbn/journeys';

import type { BuildkiteMetadata } from './buildkite_metadata';
import {
  NOT_AVAILABLE,
  formatDurationFromTime,
  formatOwners,
  getConfigPathFromCommandLine,
} from './failure_details';
import { trimFailureText } from './failure_text';
import type { TestFailure } from './get_failures';
import { getReportNameFromClassname } from './get_failures';

interface JourneyMeta {
  journeyName: string;
}
function getJourneyMetadata(rootMeta: Record<string, unknown>): JourneyMeta | undefined {
  const { journeyName } = rootMeta;
  if (typeof journeyName === 'string') {
    return { journeyName };
  }

  return undefined;
}

async function getJourneySnapshotHtml(log: ToolingLog, journeyMeta: JourneyMeta) {
  let screenshots;
  try {
    screenshots = await JourneyScreenshots.load(journeyMeta.journeyName);
  } catch (error) {
    log.error(`Failed to load journey screenshots: ${error.message}`);
    return '';
  }

  return [
    '<section>',
    '<h2>Steps</h2>',
    ...screenshots.get().flatMap(({ title, path, fullscreenPath }) => {
      const base64 = Fs.readFileSync(path, 'base64');
      const fullscreenBase64 = Fs.readFileSync(fullscreenPath, 'base64');

      return [
        `<p><strong>${escape(title)}</strong></p>`,
        `<div class="screenshotContainer">
          <img class="screenshot img-fluid img-thumbnail" src="data:image/png;base64,${base64}" />
          <img class="screenshot img-fluid img-thumbnail fs" src="data:image/png;base64,${fullscreenBase64}" />
          <button type="button" class="toggleFs on" title="Expand screenshot to full page">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrows-expand" viewBox="0 0 16 16">
              <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8zM7.646.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 1.707V5.5a.5.5 0 0 1-1 0V1.707L6.354 2.854a.5.5 0 1 1-.708-.708l2-2zM8 10a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 .708-.708L7.5 14.293V10.5A.5.5 0 0 1 8 10z"/>
            </svg>
          </button>
          <button type="button" class="toggleFs off" title="Restrict screenshot to content visible in the viewport">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrows-collapse" viewBox="0 0 16 16">
              <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8zm7-8a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 4.293V.5A.5.5 0 0 1 8 0zm-.5 11.707-1.146 1.147a.5.5 0 0 1-.708-.708l2-2a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 11.707V15.5a.5.5 0 0 1-1 0v-3.793z"/>
            </svg>
          </button>
        </div>`,
      ];
    }),
    '</section>',
  ].join('\n');
}

let _allScreenshotsCache: Array<{ path: string; name: string }> | undefined;
function getAllScreenshots(log: ToolingLog) {
  return (_allScreenshotsCache ??= findAllScreenshots(log));
}
function findAllScreenshots(log: ToolingLog) {
  try {
    return globby
      .sync(
        [
          'src/platform/test/functional/**/screenshots/failure/*.png',
          'x-pack/platform/test/functional/**/screenshots/failure/*.png',
        ],
        {
          cwd: REPO_ROOT,
          absolute: true,
        }
      )
      .map((path) => ({
        path,
        name: Path.basename(path, Path.extname(path)),
      }));
  } catch (error) {
    log.error(`Failed to find screenshots: ${error.message}`);
    return [];
  }
}

function getFtrScreenshotHtml(log: ToolingLog, failureName: string) {
  const screenshots = getAllScreenshots(log).filter((s) =>
    s.name.startsWith(FtrScreenshotFilename.create(failureName, { ext: false }))
  );

  if (!screenshots.length) {
    return '';
  }

  return [
    '<section>',
    '<h2>Screenshots</h2>',
    ...screenshots.map((s) => {
      const base64 = Fs.readFileSync(s.path).toString('base64');
      return `
        <div class="screenshotContainer">
          <img class="screenshot img-fluid img-thumbnail" src="data:image/png;base64,${base64}" />
        </div>
      `;
    }),
    '</section>',
  ].join('\n');
}

const renderCopyable = (text: string) =>
  `<div class="copyable">
    <button type="button" class="copyBtn" title="Copy to clipboard">Copy</button>
    <pre>${escape(text)}</pre>
  </div>`;

const renderDetailsRow = (label: string, valueHtml: string) =>
  `<tr><th scope="row">${escape(label)}</th><td>${valueHtml}</td></tr>`;

// Without these hints the browser wraps long paths at the hyphen in `x-pack`, which reads like a
// typo; `word-break: keep-all` in the template then limits breaks to path separators.
const renderCode = (value: string) => `<code>${escape(value).replaceAll('/', '/<wbr />')}</code>`;

const renderLink = (href: string, text: string) => `<a href="${escape(href)}">${escape(text)}</a>`;

/** Issue URLs are long and all look alike, so link them by number. */
const renderIssueLink = (url: string) => {
  const number = url.match(/\/issues\/(\d+)/)?.[1];
  return renderLink(url, number ? `#${number}` : url);
};

const renderDetailsTable = (failure: TestFailure, bkMeta: BuildkiteMetadata) => {
  const location = failure.location && failure.location !== 'unknown' ? failure.location : '';
  const configPath = getConfigPathFromCommandLine(failure.commandLine);
  const failureCount = failure.failureCount || 0;

  return `<table class="table table-sm details">
    <tbody>
      ${[
        renderDetailsRow('Location', location ? renderCode(location) : NOT_AVAILABLE),
        renderDetailsRow('Test type', escape(failure.testType || NOT_AVAILABLE)),
        renderDetailsRow('Duration', escape(formatDurationFromTime(failure.time))),
        renderDetailsRow(
          'Config path',
          configPath === NOT_AVAILABLE ? NOT_AVAILABLE : renderCode(configPath)
        ),
        renderDetailsRow('Code owners', escape(formatOwners(failure.owners))),
        renderDetailsRow(
          'Failures in tracked branches',
          `<span class="badge rounded-pill bg-danger">${failureCount}</span>${
            failure.githubIssue ? ` ${renderIssueLink(failure.githubIssue)}` : ''
          }`
        ),
        renderDetailsRow(
          'Buildkite job',
          bkMeta.jobUrl ? renderLink(bkMeta.jobUrl, bkMeta.jobName || bkMeta.jobUrl) : NOT_AVAILABLE
        ),
      ].join('\n      ')}
    </tbody>
  </table>`;
};

const renderErrorSection = (failure: TestFailure) => {
  const { summary, trimmed } = trimFailureText(failure.failure);

  return `<section>
    <h2>Error</h2>
    ${renderCopyable(summary)}
    ${
      trimmed
        ? `<details>
             <summary>Full stack trace</summary>
             ${renderCopyable(failure.failure)}
           </details>`
        : ''
    }
  </section>`;
};

/** The cascade is all the same forced 1ms timeout, so the names are the only detail worth keeping. */
const renderAbortedRunSection = (cascading: TestFailure[]) => {
  if (!cascading.length) {
    return '';
  }

  return `<section>
    <h2>This failure aborted the run</h2>
    <p>
      This timeout aborted the config run, so the ${cascading.length} hook${
    cascading.length === 1 ? '' : 's'
  } below never ran:
      each was cancelled with a forced 1ms timeout. They are not tracked separately.
    </p>
    <ul class="aborted">
      ${cascading.map(({ name }) => `<li>${renderCode(name)}</li>`).join('\n      ')}
    </ul>
  </section>`;
};

const renderStdoutSection = (failure: TestFailure) => {
  const stdout = failure['system-out'];
  if (!stdout) {
    return '';
  }

  return `<details>
    <summary>Standard output</summary>
    ${renderCopyable(stdout)}
  </details>`;
};

export interface PartitionedFailures {
  /** failures that get a report of their own */
  reported: TestFailure[];
  /** failures folded into `rootCause`'s report */
  cascading: TestFailure[];
  /** the failure whose timeout aborted the run */
  rootCause?: TestFailure;
}

/**
 * Separate the failures worth their own artifacts from the ones that only happened because an
 * earlier Mocha timeout aborted the run. The cascade always trails the failure that caused it.
 */
export const partitionCascadingFailures = (failures: TestFailure[]): PartitionedFailures => {
  const firstCascading = failures.findIndex(({ cascading }) => cascading);

  // no cascade, or nothing to fold it into
  if (firstCascading < 1) {
    return { reported: failures, cascading: [] };
  }

  return {
    reported: failures.filter(({ cascading }) => !cascading),
    cascading: failures.filter(({ cascading }) => cascading),
    rootCause: failures[firstCascading - 1],
  };
};

export async function reportFailuresToFile(
  log: ToolingLog,
  failures: TestFailure[],
  bkMeta: BuildkiteMetadata,
  rootMeta: Record<string, unknown>
) {
  if (!failures?.length) {
    return;
  }

  const journeyMeta = getJourneyMetadata(rootMeta);
  const { reported, cascading, rootCause } = partitionCascadingFailures(failures);

  const template = Fs.readFileSync(
    require.resolve('./report_failures_to_file_html_template.html')
  ).toString();

  // Jest could, in theory, fail 1000s of tests and write 1000s of failures
  // So let's just write files for the first 20
  for (const failure of reported.slice(0, 20)) {
    const abortedRunnables = failure === rootCause ? cascading.map(({ name }) => name) : [];
    const hash = createHash('sha256').update(failure.name).digest('hex');
    const filenameBase = `${
      process.env.BUILDKITE_JOB_ID ? process.env.BUILDKITE_JOB_ID + '_' : ''
    }${hash}`;
    const dir = Path.join('target', 'test_failures');

    const failureLog = [
      ['Test:', '-----', failure.classname, failure.name, ''],
      ['Failure:', '--------', failure.failure],
      abortedRunnables.length
        ? [
            '',
            'Run aborted after this failure:',
            '-------------------------------',
            ...abortedRunnables,
          ]
        : [],
      failure['system-out'] ? ['', 'Standard Out:', '-------------', failure['system-out']] : [],
    ]
      .flat()
      .join('\n');

    const failureJSON = JSON.stringify(
      {
        ...failure,
        ...(abortedRunnables.length ? { abortedRunnables } : {}),
        hash,
        buildId: bkMeta.buildId,
        jobId: bkMeta.jobId,
        url: bkMeta.url,
        jobUrl: bkMeta.jobUrl,
        jobName: bkMeta.jobName,
      },
      null,
      2
    );

    const failureHTML = template.replace('$TITLE', escape(failure.name)).replace(
      '$MAIN',
      `
        <header>
          <p class="reportName">${escape(getReportNameFromClassname(failure.classname))}</p>
          <h1>${escape(failure.name)}</h1>
        </header>
        ${renderDetailsTable(failure, bkMeta)}
        ${
          failure.commandLine
            ? `<section>
                 <h2>Command line</h2>
                 ${renderCopyable(failure.commandLine)}
               </section>`
            : ''
        }
        ${renderErrorSection(failure)}
        ${failure === rootCause ? renderAbortedRunSection(cascading) : ''}
        ${
          journeyMeta
            ? await getJourneySnapshotHtml(log, journeyMeta)
            : getFtrScreenshotHtml(log, failure.name)
        }
        ${renderStdoutSection(failure)}
      `
    );

    Fs.mkdirSync(dir, { recursive: true });
    Fs.writeFileSync(Path.join(dir, `${filenameBase}.log`), failureLog, 'utf8');
    Fs.writeFileSync(Path.join(dir, `${filenameBase}.html`), failureHTML, 'utf8');
    Fs.writeFileSync(Path.join(dir, `${filenameBase}.json`), failureJSON, 'utf8');
  }
}
