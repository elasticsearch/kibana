/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import os from 'os';
import Path from 'path';

import { ToolingLog } from '@kbn/tooling-log';

import { generateScoutTestFailureArtifacts } from './generate_scout_test_failure_artifacts';
import { SCOUT_GITHUB_ISSUES_FILENAME } from './process_scout_reports';

const REPORT_DIR = Path.join(
  '.scout',
  'reports',
  'scout-playwright-test-failures-2024-01-01T00-00-00'
);

const FAILURE_HTML = '<html><body>failure report</body></html>';

const readArtifactFor = (name: string) => {
  const dir = Path.join('target', 'test_failures');
  const jsonFiles = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  for (const file of jsonFiles) {
    const content = JSON.parse(fs.readFileSync(Path.join(dir, file), 'utf-8'));
    if (content.name === name) {
      return content;
    }
  }
  throw new Error(`No artifact found for "${name}"`);
};

describe('generateScoutTestFailureArtifacts', () => {
  let tempDir: string;
  let prevCwd: string;
  let reportDir: string;

  const log = new ToolingLog();

  beforeEach(() => {
    prevCwd = process.cwd();
    tempDir = fs.mkdtempSync(Path.join(os.tmpdir(), 'scout-artifacts-'));
    process.chdir(tempDir);

    reportDir = Path.join(tempDir, REPORT_DIR);
    fs.mkdirSync(reportDir, { recursive: true });

    fs.writeFileSync(Path.join(reportDir, 'with-issue.html'), FAILURE_HTML, 'utf-8');
    fs.writeFileSync(Path.join(reportDir, 'without-issue.html'), FAILURE_HTML, 'utf-8');
    fs.writeFileSync(
      Path.join(reportDir, 'test-failures-summary.json'),
      JSON.stringify([
        { name: 'suite - tracked failure', htmlReportFilename: 'with-issue.html' },
        { name: 'suite - untracked failure', htmlReportFilename: 'without-issue.html' },
      ]),
      'utf-8'
    );
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('carries the GitHub issue link and failure count into the artifact', async () => {
    // `processScoutReports` persists this sidecar keyed by failure id (the html filename stem).
    fs.writeFileSync(
      Path.join(reportDir, SCOUT_GITHUB_ISSUES_FILENAME),
      JSON.stringify({
        'with-issue': {
          githubIssue: 'https://github.com/elastic/kibana/issues/123',
          failureCount: 6,
        },
      }),
      'utf-8'
    );

    await generateScoutTestFailureArtifacts({ log, bkMeta: {} });

    const artifact = readArtifactFor('suite - tracked failure');
    expect(artifact.githubIssue).toBe('https://github.com/elastic/kibana/issues/123');
    expect(artifact.failureCount).toBe(6);
  });

  it('omits the GitHub fields when there is no tracked issue for the failure', async () => {
    await generateScoutTestFailureArtifacts({ log, bkMeta: {} });

    const artifact = readArtifactFor('suite - untracked failure');
    expect(artifact).not.toHaveProperty('githubIssue');
    expect(artifact).not.toHaveProperty('failureCount');
  });
});
