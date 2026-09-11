/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Audits every evaluator in a golden extract and reports which ones can
 * actually separate models.
 *
 *   AGGREGATED_JSON=/tmp/aggregated_v5.json \
 *     node --require @kbn/setup-node-env scripts/audit_evaluator_health.ts
 *
 * Exits non-zero when a grader is constant or saturated, so it can be wired
 * into a run as a gate rather than staying a retrospective script.
 */

import fs from 'fs';
import {
  checkEvaluatorHealth,
  type EvaluatorObservation,
  type EvaluatorFinding,
} from '../src/matrix/evaluator_health';
import { resolveEvaluatorRole } from '../src/matrix/evaluator_roles';

/**
 * Roles are declared in evaluator_roles.ts, not inferred here. An earlier
 * version matched on evaluator names, which meant the list could be widened
 * until the audit passed -- the exact failure the audit exists to catch.
 */

/** Cost/latency metrics are not 0-1 scores and must not be audited as such. */
const NON_SCORE = /token|latency|cost per|duration|^Tool Calls$/i;

function main() {
  const path = process.env.AGGREGATED_JSON;
  if (!path) throw new Error('AGGREGATED_JSON is required');

  const models = JSON.parse(fs.readFileSync(path, 'utf8')) as any[];
  const bySuite = new Map<string, EvaluatorObservation[]>();
  const undeclared = new Set<string>();

  for (const model of models) {
    for (const suite of model.suites ?? []) {
      for (const dataset of suite.datasets ?? []) {
        for (const evaluator of dataset.evaluators ?? []) {
          const name: string = evaluator.evaluatorName;
          if (NON_SCALE(evaluator) || NON_SCORE.test(name)) continue;
          const role = resolveEvaluatorRole(name);
          if (role === 'unknown') undeclared.add(name);

          const list = bySuite.get(suite.suiteId) ?? [];
          list.push({
            evaluatorName: name,
            modelId: model.modelId,
            score: evaluator.mean,
            // `unknown` is reported, never guessed: see evaluator_roles.ts.
            role: role === 'unknown' ? undefined : role,
          });
          bySuite.set(suite.suiteId, list);
        }
      }
    }
  }

  let failed = false;
  for (const [suiteId, observations] of [...bySuite.entries()].sort()) {
    const report = checkEvaluatorHealth({ observations });
    failed ||= !report.ok;

    process.stdout.write(`\n=== ${suiteId}\n`);
    const order: Record<string, number> = { constant: 0, saturated: 1, 'gate-failing': 2 };
    const sorted = [...report.findings].sort(
      (a, b) => (order[a.classification] ?? 9) - (order[b.classification] ?? 9)
    );
    for (const f of sorted) process.stdout.write(line(f));
    process.stdout.write(
      `  composite-safe (${report.compositeSafe.length}/${report.findings.length}): ` +
        `${report.compositeSafe.join(', ') || 'none'}\n`
    );
  }

  if (undeclared.size > 0) {
    process.stdout.write(
      `\nUNDECLARED ROLE (${undeclared.size}): ${[...undeclared].join(', ')}\n` +
        `Add each to EVALUATOR_ROLES with a rationale. Until then they are audited as graders'\n` +
        `weaker cousin -- reported, but with no gate/grader expectation applied.\n`
    );
  }

  if (failed) {
    process.stdout.write(
      '\nFAIL: at least one grader cannot separate models. A rejudge will not fix this;\n' +
        'the rubric has to get finer-grained. See docs/rejudging_a_golden_column.md.\n'
    );
    process.exitCode = 1;
  }
}

const NON_SCALE = (evaluator: { mean: number; max?: number }) =>
  evaluator.mean > 1 || (evaluator.max ?? 0) > 1;

function line(f: EvaluatorFinding): string {
  const mark = {
    constant: 'DEAD',
    saturated: 'SAT ',
    'gate-failing': 'GATE',
    'insufficient-data': 'n/a ',
  }[f.classification as string];
  return (
    `  ${(mark ?? 'ok  ').padEnd(5)}${f.evaluatorName.padEnd(30)}` +
    `n=${String(f.observationCount).padEnd(5)}` +
    `distinct=${String(f.distinctValues).padEnd(4)}` +
    `@ceiling=${(f.ceilingShare * 100).toFixed(1)}%\n`
  );
}

main();
