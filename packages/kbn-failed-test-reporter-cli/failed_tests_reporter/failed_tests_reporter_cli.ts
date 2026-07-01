/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import { CiStatsReporter } from '@kbn/ci-stats-reporter';
import { createFailError, createFlagError } from '@kbn/dev-cli-errors';
import { run } from '@kbn/dev-cli-runner';
import { REPO_ROOT } from '@kbn/repo-info';
import globby from 'globby';
import normalize from 'normalize-path';
import { getBuildkiteMetadata } from './buildkite_metadata';
import { ExistingFailedTestIssues } from './existing_failed_test_issues';
import { generateScoutTestFailureArtifacts } from './generate_scout_test_failure_artifacts';
import { GithubApi } from './github_api';
import { processJUnitReports } from './process_junit_reports';
import type { ProcessReportsParams } from './process_reports_types';
import { processScoutReports } from './process_scout_reports';

const DEFAULT_PATTERNS = [Path.resolve(REPO_ROOT, 'target/junit/**/*.xml')];
const DISABLE_MISSING_TEST_REPORT_ERRORS =
  process.env.DISABLE_MISSING_TEST_REPORT_ERRORS === 'true';

export function runFailedTestsReporterCli() {
  run(
    async ({ log, flags }) => {
      const indexInEs = Boolean(flags['index-errors']);
      const reportUpdate = Boolean(flags['report-update']);

      let updateGithub = Boolean(flags['github-update']);
      if (updateGithub && !process.env.GITHUB_TOKEN) {
        throw createFailError(
          'GITHUB_TOKEN environment variable must be set, otherwise use --no-github-update flag'
        );
      }

      let branch: string = '';
      let pipeline: string = '';
      let prependTitle: string = '';
      if (updateGithub) {
        branch = process.env.BUILDKITE_BRANCH || '';
        pipeline = process.env.BUILDKITE_PIPELINE_SLUG || '';
        updateGithub = process.env.REPORT_FAILED_TESTS_TO_GITHUB === 'true';
        prependTitle = process.env.PREPEND_FAILURE_TITLE || '';

        if (!branch) {
          throw createFailError(
            'Unable to determine originating branch from job name or other environment variables'
          );
        }
      }

      const githubApi = new GithubApi({
        log,
        token: process.env.GITHUB_TOKEN,
        dryRun: !updateGithub,
      });

      const bkMeta = getBuildkiteMetadata();

      try {
        const buildUrl = flags['build-url'] || (updateGithub ? '' : 'http://buildUrl');
        if (typeof buildUrl !== 'string' || !buildUrl) {
          throw createFlagError('Missing --build-url or process.env.BUILD_URL');
        }

        const patterns = (flags._.length ? flags._ : DEFAULT_PATTERNS).map((p) =>
          normalize(Path.resolve(p))
        );
        log.info('Searching for reports at', patterns);
        const reportPaths = await globby(patterns, {
          absolute: true,
        });

        if (!reportPaths.length && DISABLE_MISSING_TEST_REPORT_ERRORS) {
          // it is fine for code coverage to not have test results
          return;
        }

        if (reportPaths.length) {
          log.info('found', reportPaths.length, 'reports', reportPaths);

          // Separate JUnit and Scout reports
          const junitReports = reportPaths.filter((p) => p.endsWith('.xml'));
          const scoutReports = reportPaths.filter((p) => p.endsWith('.ndjson'));

          log.info(
            'Processing',
            junitReports.length,
            'JUnit reports and',
            scoutReports.length,
            'Scout reports'
          );

          const existingIssues = new ExistingFailedTestIssues(log);

          const processParams: ProcessReportsParams = {
            log,
            existingIssues,
            buildUrl,
            githubApi,
            branch,
            pipeline,
            prependTitle,
            updateGithub,
            indexInEs,
            reportUpdate,
            bkMeta,
          };

          // Process FTR JUnit reports
          await processJUnitReports(junitReports, processParams);

          // Process Scout reports
          await processScoutReports(scoutReports, processParams);

          // Generate Scout test failure artifacts after reports are updated (GH issue info, html reports, etc.)
          await generateScoutTestFailureArtifacts({ log, bkMeta });
        }
      } finally {
        await CiStatsReporter.fromEnv(log).metrics([
          {
            group: 'github api request count',
            id: `failed test reporter`,
            value: githubApi.getRequestCount(),
            meta: Object.fromEntries(
              Object.entries(bkMeta).map(
                ([k, v]) => [`buildkite${k[0].toUpperCase()}${k.slice(1)}`, v] as const
              )
            ),
          },
        ]);
      }
    },
    {
      description: `a cli that opens issues or updates existing issues based on junit reports`,
      flags: {
        boolean: ['github-update', 'report-update'],
        string: ['build-url'],
        default: {
          'github-update': true,
          'report-update': true,
          'index-errors': true,
          'build-url': process.env.BUILD_URL,
        },
        help: `
        --no-github-update Execute the CLI without writing to Github
        --no-report-update Execute the CLI without writing to the JUnit reports
        --no-index-errors  Execute the CLI without indexing failures into Elasticsearch
        --build-url        URL of the failed build, defaults to process.env.BUILD_URL
      `,
      },
    }
  );
}
