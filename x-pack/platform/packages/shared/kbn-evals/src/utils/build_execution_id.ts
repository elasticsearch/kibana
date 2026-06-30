/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

interface BuildExecutionIdArgs {
  baseExecutionId?: string;
  suiteId?: string;
  modelId?: string;
}

/**
 * Composes the `metadata.execution_id` used to group score documents into a
 * single experiment row on the Experiments listing page.
 *
 * The suite id must be part of the key: in CI, `baseExecutionId` is derived from
 * `bk-${BUILDKITE_BUILD_ID}`, which is shared by every suite step in the same
 * build. Without the suite, two suites that run against the same task model in
 * one build would collapse into a single row. Including the suite id gives each
 * `(build, suite, model)` tuple its own execution id, and therefore its own row.
 *
 * `suiteId` and `modelId` are both optional — e.g. in-tool evals run without an
 * `EVAL_SUITE_ID`. Missing segments are dropped, so a run without a suite yields
 * `${baseExecutionId}::${modelId}` and a run without a model yields
 * `${baseExecutionId}::${suiteId}`.
 *
 * Returns `baseExecutionId` unchanged when it is not set (e.g. local runs), which
 * lets downstream code fall back to a random per-task experiment id.
 */
export function buildExecutionId({
  baseExecutionId,
  suiteId,
  modelId,
}: BuildExecutionIdArgs): string | undefined {
  if (!baseExecutionId) {
    return baseExecutionId;
  }

  return [baseExecutionId, suiteId, modelId]
    .filter((part): part is string => Boolean(part))
    .join('::');
}
