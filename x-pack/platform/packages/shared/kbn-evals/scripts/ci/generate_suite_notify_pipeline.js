#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { readFileSync } = require('fs');
const { stringify } = require('yaml');

const summaryPath = process.env.EVAL_TRIAGE_SUMMARY_PATH || '';
const slackChannel = process.env.EVAL_SUITE_SLACK_CHANNEL || '';

if (!summaryPath || !slackChannel) {
  console.error(
    'Usage: set EVAL_TRIAGE_SUMMARY_PATH (summary.md) and EVAL_SUITE_SLACK_CHANNEL (slack channel).'
  );
  process.exit(1);
}

const message = readFileSync(summaryPath, 'utf8').trim();
const buildUrl = process.env.BUILDKITE_BUILD_URL || '';
const pipelineName = process.env.BUILDKITE_PIPELINE_NAME || 'Buildkite';
const buildNumber = process.env.BUILDKITE_BUILD_NUMBER || '';

const footer =
  buildUrl && !message.includes(buildUrl)
    ? `\n\n<${buildUrl}|${pipelineName} #${buildNumber}>`
    : '';

const pipeline = {
  steps: [
    {
      label: 'LLM Evals: suite owner Slack notify',
      command: 'true',
      notify: [
        {
          slack: {
            channels: [slackChannel],
            message: `${message}${footer}`,
          },
          if: 'step.outcome == "passed"',
        },
      ],
    },
  ],
};

process.stdout.write(stringify(pipeline));
