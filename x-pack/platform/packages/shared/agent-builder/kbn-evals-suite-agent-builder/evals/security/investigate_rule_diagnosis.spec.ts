/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate as base } from '../../src/evaluate';
import type { EvaluateDataset } from '../../src/evaluate_dataset';
import { createEvaluateDataset } from '../../src/evaluate_dataset';
import {
  seedInvestigateRuleFixtures,
  type InvestigateRuleFixtures,
} from './investigate_rule_fixtures';

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(createEvaluateDataset({ chatClient, evaluators, executorClient, traceEsClient, log }));
    },
    { scope: 'test' },
  ],
});

/**
 * Diagnosis quality — four noisy rules seeded, one per diagnostic branch:
 *
 *   A. benign-concentration  — 32/40 alerts on one host, all closed benign_positive
 *   B. confirmed-FP-spread   — 36/40 alerts closed false_positive across 12 hosts
 *   C. open-diffuse          — 40 open, undispositioned, spread across 10 hosts
 *   E. concentrated-open     — 30/34 open alerts from one user, no dispositions
 *
 * Scored the same way as the other security suites (see find_rules.spec.ts): an
 * `evaluateDataset` run with a faithful natural-language gold per scenario. Each gold
 * states the key facts a correct answer must contain — disposition, dominant entity,
 * recommended action — and the `metadata` drives the deterministic skill/tool routing
 * checks (expectedSkill, expectedToolId). Groundedness is the primary quality metric;
 * Factuality is informational (it is bimodal across runs for the hedged C/E answers).
 *
 * Skill routing (which skill/tool activates) lives in investigate_rule_fp.spec.ts.
 */
evaluate.describe(
  'Security Skills - Investigate Rule (diagnosis quality)',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    let fixtures: InvestigateRuleFixtures | undefined;

    evaluate.beforeAll(async ({ kbnClient, esClient, log }) => {
      fixtures = await seedInvestigateRuleFixtures({ kbnClient, esClient, log });
    });

    evaluate.afterAll(async () => {
      if (fixtures) await fixtures.cleanup();
    });

    evaluate(
      'investigate-rule diagnosis: quality and remediation across the four seeded scenarios',
      async ({ evaluateDataset }) => {
        if (!fixtures) throw new Error('Fixtures not seeded');
        const a = fixtures.benignConcentration;
        const b = fixtures.falsePositive;
        const c = fixtures.openDiffuse;
        const e = fixtures.concentratedOpen;

        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-investigate-rule-diagnosis-quality',
            description:
              'LLM-judged quality across four seeded noise patterns. Each gold states the key ' +
              'facts — disposition, entity, recommended action. Groundedness is the primary metric.',
            examples: [
              {
                input: {
                  question:
                    `Detection rule ${a.rule.ruleId} is generating a lot of alerts. ` +
                    `Most look like noise. Can you investigate?`,
                },
                output: {
                  expected:
                    `${a.dominantCount} of ${a.totalAlerts} alerts are from host "${a.dominantHost}", ` +
                    `all closed as benign_positive — analyst-confirmed expected activity from a build host. ` +
                    `Add an exception for host "${a.dominantHost}" in the Detection Rules UI ` +
                    `(alert suppression is a reasonable alternative). Read-only — skill does not modify the rule.`,
                },
                metadata: {
                  query_intent: 'A — benign concentration → exception',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
              {
                input: {
                  question:
                    `Rule ${b.rule.ruleId} keeps firing and my analysts keep closing its alerts. ` +
                    `What is going on and how should I fix it?`,
                },
                output: {
                  expected:
                    `${b.fpCount} of ${b.totalAlerts} alerts are closed as false_positive, spread across ` +
                    `many hosts with no dominant entity. Analyst-confirmed false positives. ` +
                    `Lead with exceptions for the confirmed patterns in Detection Rules UI. ` +
                    `Because FPs span many hosts, narrowing the query is a reasonable secondary option.`,
                },
                metadata: {
                  query_intent: 'B — confirmed FP spread → exception-led, query optional',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
              {
                input: {
                  question:
                    `Rule ${c.rule.ruleId} is producing a lot of alerts across many hosts. ` +
                    `Are these false positives, and what should I do?`,
                },
                output: {
                  expected:
                    `All ${c.totalAlerts} alerts are open and undispositioned, spread across ${c.hostCount} hosts. ` +
                    `No analyst has confirmed these as false positives. Cannot conclude they are noise from volume alone. ` +
                    `Use the alert-analysis skill to adjudicate a sample before tuning the rule.`,
                },
                metadata: {
                  query_intent: 'C — open diffuse → defer, no verdict',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
              {
                input: {
                  question:
                    `Rule ${e.rule.ruleId} is extremely noisy and almost all alerts are from ` +
                    `user ${e.dominantUser}. None have been triaged yet. What should I do?`,
                },
                output: {
                  expected:
                    `${e.dominantCount} of ${e.totalAlerts} alerts are from user "${e.dominantUser}", ` +
                    `all open and unconfirmed (no analyst dispositions). Concentrated but unconfirmed. ` +
                    `Recommend alert suppression on user.name "${e.dominantUser}" (reduces noise while ` +
                    `preserving coverage) rather than a permanent exception. ` +
                    `Offer alert-analysis for per-alert verdicts.`,
                },
                metadata: {
                  query_intent: 'E — concentrated open → suppression, not exception',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
            ],
          },
        });
      }
    );
  }
);
