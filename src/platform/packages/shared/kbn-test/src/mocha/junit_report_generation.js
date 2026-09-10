/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';
import { getOwningTeamsForPath, getCodeOwnersEntries } from '@kbn/code-owners';
import { dirname, relative } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { inspect } from 'util';

import xmlBuilder from 'xmlbuilder';
import { getUniqueJunitReportPath } from '../report_path';

import { getSnapshotOfRunnableLogs } from './log_cache';
import { escapeCdata } from '../..';
import { prettifyCommandLine } from '../prettify_command_line';
import { isMochaTimeoutError } from './mocha_timeout';

const dateNow = Date.now.bind(Date);

export function setupJUnitReportGeneration(runner, options = {}) {
  const {
    reportName = 'Unnamed Mocha Tests',
    rootDirectory = REPO_ROOT,
    getTestMetadata = () => ({}),
    metadata,
  } = options;

  const stats = {};
  const results = [];

  // The first Mocha timeout aborts the config run (see `registerAbortOnTimeout`) and every remaining
  // runnable is then forced to fail with a 1ms timeout. Tagging those trailing failures lets
  // reporters fold them into the timeout that caused them.
  // See https://github.com/elastic/apps-dx/issues/37.
  let sawMochaTimeout = false;

  const getDuration = (node) =>
    node.startTime && node.endTime ? ((node.endTime - node.startTime) / 1000).toFixed(3) : null;

  const findAllTests = (suite) =>
    suite.suites.reduce((acc, suite) => acc.concat(findAllTests(suite)), suite.tests);

  const setStartTime = (node) => {
    node.startTime = dateNow();
  };

  const setEndTime = (node) => {
    node.endTime = dateNow();
  };

  const getFullTitle = (node) => {
    const parentTitle = node.parent && getFullTitle(node.parent);
    return parentTitle ? `${parentTitle} ${node.title}` : node.title;
  };

  const getPath = (node) => {
    if (node.file) {
      return relative(rootDirectory, node.file);
    }

    if (node.parent) {
      return getPath(node.parent);
    }

    return 'unknown';
  };

  runner.on('start', () => setStartTime(stats));
  runner.on('suite', setStartTime);
  runner.on('hook', setStartTime);
  runner.on('hook end', setEndTime);
  runner.on('test', setStartTime);
  runner.on('pass', (node) => results.push({ node }));
  runner.on('pass', setEndTime);
  runner.on('fail', (node, error) => {
    results.push({ failed: true, error, node, cascading: sawMochaTimeout });
    sawMochaTimeout = sawMochaTimeout || isMochaTimeoutError(error);
  });
  runner.on('fail', setEndTime);
  runner.on('suite end', () => setEndTime(stats));

  runner.on('end', () => {
    // crawl the test graph to collect all defined tests
    const allTests = findAllTests(runner.suite);
    if (!allTests.length) {
      return;
    }

    // filter out just the failures
    const failures = results.filter((result) => result.failed);

    // any failure that isn't for a test is for a hook
    const failedHooks = failures.filter((result) => !allTests.includes(result.node));

    // mocha doesn't emit 'pass' or 'fail' when it skips a test
    // or a test is pending, so we find them ourselves
    const skippedResults = allTests
      .filter((node) => node.pending || !results.find((result) => result.node === node))
      .map((node) => ({ skipped: true, node }));

    // cache codeowner entries for quicker lookup
    let codeOwnersEntries = [];
    try {
      codeOwnersEntries = getCodeOwnersEntries();
    } catch {
      /* no-op */
    }

    const commandLine = prettifyCommandLine(process.argv);

    const root = xmlBuilder.create(
      'testsuites',
      { encoding: 'utf-8' },
      {},
      { skipNullAttributes: true }
    );

    root.att({
      name: 'ftr',
      time: getDuration(stats),
      tests: allTests.length + failedHooks.length,
      failures: failures.length,
      skipped: skippedResults.length,
      'command-line': commandLine,
    });

    const testsuitesEl = root.ele('testsuite', {
      name: reportName,
      timestamp: new Date(stats.startTime).toISOString().slice(0, -5),
      time: getDuration(stats),
      tests: allTests.length + failedHooks.length,
      failures: failures.length,
      skipped: skippedResults.length,
      'metadata-json': JSON.stringify(metadata ?? {}),
      'command-line': commandLine,
    });

    function addTestcaseEl(node, failed, cascading) {
      const attrs = {
        name: getFullTitle(node),
        classname: `${reportName}.${getPath(node).replace(/\./g, '·')}`,
        time: getDuration(node),
        'metadata-json': JSON.stringify(getTestMetadata(node) || {}),
      };

      // adding code owners only for the failed test case
      if (failed) {
        const testCaseRelativePath = getPath(node);

        // Comma-separated list of owners. Empty string if no owners are found.
        attrs.owners = getOwningTeamsForPath(testCaseRelativePath, codeOwnersEntries).join(',');

        if (cascading) {
          attrs['cascading-failure'] = 'true';
        }
      }

      return testsuitesEl.ele('testcase', attrs);
    }

    [...results, ...skippedResults].forEach((result) => {
      const el = addTestcaseEl(result.node, result.failed, result.cascading);

      if (result.failed) {
        el.ele('system-out').dat(escapeCdata(getSnapshotOfRunnableLogs(result.node) || ''));
        el.ele('failure').dat(escapeCdata(inspect(result.error)));
        return;
      }

      el.ele('system-out').dat('-- logs are only reported for failed tests --');

      if (result.skipped) {
        el.ele('skipped');
      }
    });

    const reportPath = getUniqueJunitReportPath(rootDirectory, reportName);
    const reportXML = root.end();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, reportXML, 'utf8');
  });
}
