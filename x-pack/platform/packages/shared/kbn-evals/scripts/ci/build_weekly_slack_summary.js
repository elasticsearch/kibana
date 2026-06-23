#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { readFileSync, writeFileSync } = require('fs');
const { extractSuiteRootCauseLine } = require('./failure_context_helpers');
const { summarizeWeeklyFailures } = require('./summarize_weekly_failures_with_model');

const contextPath = process.env.EVAL_WEEKLY_CONTEXT_PATH || '';
const outputPath = process.env.EVAL_WEEKLY_SUMMARY_PATH || '';

if (!contextPath || !outputPath) {
  console.error(
    'Usage: set EVAL_WEEKLY_CONTEXT_PATH (context.json) and EVAL_WEEKLY_SUMMARY_PATH (output.md).'
  );
  process.exit(1);
}

const MAX_SLACK_BODY_CHARS = Number(process.env.EVAL_WEEKLY_BODY_MAX_CHARS || '3500');

function renderChannelLink(suite) {
  const channel = String(suite.slackChannel || '').trim();
  const channelId = String(suite.slackChannelId || '').trim();
  if (!channel) {
    return '';
  }
  if (channelId) {
    return `<https://elastic.slack.com/archives/${channelId}|${channel}>`;
  }
  return channel;
}

function renderSuiteLine(suite) {
  const parts = [
    `\`${suite.suiteId}\``,
    (suite.failingProjects || []).map((project) => String(project)).join(', '),
  ];

  const rootCause = extractSuiteRootCauseLine(suite.triageBody);
  if (rootCause) {
    parts.push(rootCause);
  }

  const links = [];
  if (suite.jobUrl) {
    links.push(`<${suite.jobUrl}|job>`);
  }
  const channelLink = renderChannelLink(suite);
  if (channelLink) {
    links.push(channelLink);
  }
  if (links.length > 0) {
    parts.push(links.join(' · '));
  }

  return `• ${parts.join(' — ')}`;
}

async function main() {
  const context = JSON.parse(readFileSync(contextPath, 'utf8'));
  const suites = Array.isArray(context.suites) ? context.suites : [];

  const buildUrl = typeof context.buildUrl === 'string' ? context.buildUrl : '';
  const pipelineName =
    typeof context.pipelineName === 'string' ? context.pipelineName : 'Buildkite';
  const buildNumber = typeof context.buildNumber === 'string' ? context.buildNumber : '';
  const failingModelCount = suites.reduce(
    (sum, suite) => sum + (Array.isArray(suite.failingProjects) ? suite.failingProjects.length : 0),
    0
  );

  const header = `:rotating_light: *Weekly LLM evals* — ${suites.length} suites failed (${failingModelCount} model runs)`;

  const lines = [header];
  if (buildUrl) {
    lines.push('', `<${buildUrl}|${pipelineName} #${buildNumber}>`);
  }

  try {
    const result = await summarizeWeeklyFailures(suites, { buildUrl });
    lines.push('', '*Executive summary:*', result.summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`--- Weekly executive summary failed: ${message}`);
    lines.push(
      '',
      '*Executive summary:*',
      `_Could not be generated: ${message}. See per-suite triage below._`
    );
  }

  lines.push('', '*By suite:*');
  for (const suite of suites) {
    lines.push(renderSuiteLine(suite));
  }

  lines.push(
    '',
    '_Full per-suite triage posted to each team channel; see the build annotation for the complete detail._'
  );

  let body = lines.join('\n');
  if (body.length > MAX_SLACK_BODY_CHARS) {
    body = `${body.slice(0, MAX_SLACK_BODY_CHARS - 40)}\n\n_(truncated for Slack length limit)_`;
  }

  writeFileSync(outputPath, `${body}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
