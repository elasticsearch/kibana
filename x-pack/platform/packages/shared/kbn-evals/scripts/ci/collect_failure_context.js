#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { execFileSync } = require('child_process');
const {
  MAX_LOG_EXCERPT_CHARS,
  failureLogMetadataKey,
  truncateText,
} = require('./failure_context_helpers');

function getMetadata(key) {
  try {
    const stdout = execFileSync('buildkite-agent', ['meta-data', 'get', key], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    return String(stdout).trim();
  } catch {
    return '';
  }
}

/**
 * Build the LLM triage failure context for a suite from the per-model log
 * excerpts that run_suite.sh records in Buildkite metadata.
 *
 * @param {{ suiteId: string; suiteName: string; failingProjects: string[]; buildId?: string; buildUrl?: string }} options
 * @returns {{ suiteId: string; suiteName: string; buildId?: string; buildUrl?: string; failingProjects: string[]; models: Record<string, { logExcerpt?: string }> }}
 */
function collectFailureContext({ suiteId, suiteName, failingProjects, buildId, buildUrl }) {
  const models = {};

  for (const project of failingProjects) {
    const logExcerpt = truncateText(
      getMetadata(failureLogMetadataKey(suiteId, project)),
      MAX_LOG_EXCERPT_CHARS
    );
    models[project] = logExcerpt ? { logExcerpt } : {};
  }

  return {
    suiteId,
    suiteName,
    buildId: buildId || undefined,
    buildUrl: buildUrl || undefined,
    failingProjects,
    models,
  };
}

module.exports = { collectFailureContext };
