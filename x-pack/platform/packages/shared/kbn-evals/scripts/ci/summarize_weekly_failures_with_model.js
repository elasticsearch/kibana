#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { buildWeeklyRollupUserPrompt, runTriageModel } = require('./failure_context_helpers');

const maxOutputChars = Number(process.env.EVAL_WEEKLY_SUMMARY_MAX_CHARS || '900');

async function summarizeWeeklyFailures(suites, meta = {}) {
  return runTriageModel(buildWeeklyRollupUserPrompt(suites, meta), { maxChars: maxOutputChars });
}

module.exports = { summarizeWeeklyFailures };
