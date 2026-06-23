#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { buildTriageUserPrompt, runTriageModelStructured } = require('./failure_context_helpers');

async function summarizeFailuresWithModel(context) {
  const failingProjects = Array.isArray(context.failingProjects) ? context.failingProjects : [];

  const userPrompt = buildTriageUserPrompt(context, {
    suiteName: String(context.suiteName || context.suiteId || ''),
    suiteId: String(context.suiteId || ''),
    buildUrl: typeof context.buildUrl === 'string' ? context.buildUrl : undefined,
    buildId: typeof context.buildId === 'string' ? context.buildId : undefined,
    failingProjects,
  });

  return runTriageModelStructured(userPrompt);
}

module.exports = { summarizeFailuresWithModel };
