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

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(createEvaluateDataset({ chatClient, evaluators, executorClient, traceEsClient, log }));
    },
    { scope: 'test' },
  ],
});

/**
 * Routing-only tests — no seeded fixtures required. The primary assertions are the deterministic
 * `expectedSkill` / `expectedToolId` / `shouldNotActivateSkill` metadata fields. LLM-judged scores
 * are informational only for routing tests.
 *
 * Diagnosis quality (did the skill produce the right answer?) lives in investigate_rule_diagnosis.spec.ts.
 */
evaluate.describe(
  'Security Skills - Investigate Rule (routing)',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate(
      'FP and noise queries activate investigate-rule and call the right first tool',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-investigate-rule-routing-positive',
            description:
              'Validates that investigate-rule activates for single-rule FP/noise queries and calls ' +
              'the correct first tool. When no attachment exists and the user supplies a UUID, ' +
              'resolve_rule_attachment must be called first. For noise questions without a UUID, ' +
              'security.alerts is the first tool.',
            examples: [
              {
                // Rule referenced by UUID with no prior attachment — skill must call
                // resolve_rule_attachment before it can fetch alerts.
                input: {
                  question:
                    'Rule d4b14cb2-3c4e-4d7a-8b02-d3a1e5f9c7e1 is generating a huge number of ' +
                    'alerts every day and most look like false positives. Can you investigate?',
                },
                output: {
                  expected:
                    'Load rule d4b14cb2-3c4e-4d7a-8b02-d3a1e5f9c7e1 from the saved-objects layer, ' +
                    'then fetch its recent alerts to identify the false-positive pattern.',
                },
                metadata: {
                  query_intent: 'UUID with no attachment — resolve_rule_attachment first',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'investigate-rule.resolve_rule_attachment',
                },
              },
              {
                // Noise complaint by rule name with no UUID — skill should call security.alerts.
                input: {
                  question:
                    'Why is the "Unusual Process by Web Server" rule so noisy? ' +
                    'I get hundreds of alerts a day and almost all of them look benign.',
                },
                output: {
                  expected:
                    'Fetch recent alerts for this rule and analyse the top contributing entities ' +
                    'to classify the root cause as benign activity or an over-broad query.',
                },
                metadata: {
                  query_intent: 'Rule name noise complaint — security.alerts',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
              {
                // User asks for an extended window — skill should use time_window_hours, not 24h default.
                input: {
                  question:
                    'The "Linux Sudo Privilege Escalation" rule has been noisy for the past week. ' +
                    'Can you look at the alert pattern over the last 7 days?',
                },
                output: {
                  expected:
                    'Fetch alerts for this rule over the past 7 days and analyse the top entities ' +
                    'and timing patterns to identify what is driving the noise.',
                },
                metadata: {
                  query_intent: 'Extended 7-day window',
                  expectedSkill: 'investigate-rule',
                  expectedToolId: 'security.alerts',
                },
              },
            ],
          },
        });
      }
    );

    evaluate('non-FP queries do not activate investigate-rule', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'agent builder: security-investigate-rule-routing-negative',
          description:
            'Validates that rule-execution failures, coverage gaps, and plural-list requests ' +
            'do NOT route to investigate-rule, which is scoped to single-rule FP/noise only.',
          examples: [
            {
              // Execution health — the rule failed to run. investigate-rule does not cover this.
              input: {
                question:
                  'My "Windows Defender Tampering" rule shows execution errors in the log. ' +
                  'It failed to run three times in the last hour. Why?',
              },
              output: {
                expected:
                  'Check the rule execution logs to identify the error class and determine ' +
                  'whether this is an index, permission, or engine-wide issue.',
              },
              metadata: {
                query_intent: 'Execution health — not FP/noise',
                shouldNotActivateSkill: 'investigate-rule',
              },
            },
            {
              // Gap analysis — rule is healthy but silent. Not a noise problem.
              input: {
                question:
                  "My 'Suspicious File Download' rule hasn't produced any alerts in 3 days " +
                  'even though I know matching events exist. Why is it quiet?',
              },
              output: {
                expected:
                  'Check whether the rule is executing successfully and examine the query logic ' +
                  'and index patterns to determine why no alerts are being produced.',
              },
              metadata: {
                query_intent: 'Gap analysis — not FP/noise',
                shouldNotActivateSkill: 'investigate-rule',
              },
            },
            {
              // Plural list/rank request — belongs to find-security-rules.
              input: {
                question:
                  'Which of my detection rules are generating the most false positives? ' +
                  'Give me the top 5 by alert volume.',
              },
              output: {
                expected:
                  'This is a plural ranking request across multiple rules and should be handled ' +
                  'by the find-security-rules skill, not the single-rule investigate-rule skill.',
              },
              metadata: {
                query_intent: 'Plural list — belongs to find-security-rules',
                shouldNotActivateSkill: 'investigate-rule',
              },
            },
          ],
        },
      });
    });
  }
);
