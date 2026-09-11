/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { MatrixConfig } from './load_matrix_config';
import type { AggregatedModelScores } from './query_matrix_scores';

/**
 * Warn when a column's configured evaluator or suite names match nothing in the
 * fetched scores.
 *
 * A column that names an evaluator no score document carries does not fail: the
 * allowlist simply skips every evaluator it does not recognise and averages
 * whatever is left. The attack-discovery column asked for `Rubric` and
 * `StrictTrajectory` while the suite writes `AttackDiscoveryRubric` and no
 * strict-trajectory evaluator at all, so it silently averaged two of three
 * evaluators and published 10.0 where the honest figure was 6.67.
 *
 * Names are compared against the data actually returned, so a typo, a renamed
 * evaluator, or a suite that stopped emitting one all surface the same way.
 */
export function warnOnConfiguredNamesMissingFromData(
  config: MatrixConfig,
  aggregated: AggregatedModelScores[],
  log: ToolingLog
): void {
  const evaluatorsInData = new Set<string>();
  const suitesInData = new Set<string>();

  for (const model of aggregated) {
    for (const suite of model.suites) {
      suitesInData.add(suite.suiteId);
      for (const dataset of suite.datasets) {
        for (const evaluator of dataset.evaluators) {
          evaluatorsInData.add(evaluator.evaluatorName);
        }
      }
    }
  }

  // Nothing came back at all: the caller already fails on an empty match, and
  // reporting every configured name as missing would bury that.
  if (evaluatorsInData.size === 0) {
    return;
  }

  for (const column of config.columns) {
    const missingEvaluators = (column.evaluators ?? []).filter(
      (name) => !evaluatorsInData.has(name)
    );
    const missingSuites = (column.suites ?? []).filter((id) => !suitesInData.has(id));

    if (missingEvaluators.length > 0) {
      log.warning(
        `column '${column.id}' names evaluator(s) absent from every score document: ` +
          `${missingEvaluators.join(', ')} -- the column still scores, but only over the ` +
          `evaluators that did match, so its value is an average of a subset. ` +
          `Evaluators present: ${[...evaluatorsInData].sort().join(', ')}`
      );
    }

    if (missingSuites.length > 0) {
      log.warning(
        `column '${column.id}' names suite(s) with no scores in this window: ` +
          `${missingSuites.join(', ')}`
      );
    }
  }
}

/**
 * Warn when a column's freshest data is inside the lookback window but close to
 * falling out of it.
 *
 * A branch pin freezes a column on a run that never gets newer, so the window
 * slides toward it. Nothing fails when it crosses: `pickLatestExperimentPerModel`
 * simply stops selecting the experiment and the column goes blank, which reads
 * as "the model was never evaluated" rather than "the data aged out". The
 * migrations columns are pinned to a branch last written 2026-07-30, so on a
 * 45-day window they blank on 2026-09-13 with no other signal.
 *
 * Warn only for data still IN the window: a column that already aged out is
 * blank today, and a future-tense warning would misdescribe it.
 */
export function warnOnDataAboutToLeaveLookback(
  config: MatrixConfig,
  aggregated: AggregatedModelScores[],
  log: ToolingLog,
  { now = Date.now(), warnWithinDays = 14 }: { now?: number; warnWithinDays?: number } = {}
): void {
  const lookbackDays = config.lookbackDays;
  if (!lookbackDays) {
    return;
  }

  // Freshest run per suite: that is what decides how long the column survives.
  const newestBySuite = new Map<string, number>();
  for (const model of aggregated) {
    for (const suite of model.suites) {
      if (!suite.timestamp) {
        continue;
      }
      const ts = Date.parse(suite.timestamp);
      if (Number.isNaN(ts)) {
        continue;
      }
      newestBySuite.set(suite.suiteId, Math.max(newestBySuite.get(suite.suiteId) ?? 0, ts));
    }
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const [suiteId, newest] of newestBySuite) {
    const ageDays = (now - newest) / DAY_MS;
    const daysLeft = Math.floor(lookbackDays - ageDays);
    if (daysLeft < 0 || daysLeft > warnWithinDays) {
      continue;
    }

    const columns = config.columns
      .filter((column) => column.suites.includes(suiteId))
      .map((column) => column.id);

    log.warning(
      `Suite \`${suiteId}\` has no run newer than ${new Date(newest)
        .toISOString()
        .slice(0, 10)}; it leaves the ${lookbackDays}-day lookback in ${daysLeft} day(s), after ` +
        `which these columns go blank with no other signal: ${
          columns.length ? columns.join(', ') : '(none)'
        }. Re-run the suite or pin the column to a branch with fresher data.`
    );
  }
}
