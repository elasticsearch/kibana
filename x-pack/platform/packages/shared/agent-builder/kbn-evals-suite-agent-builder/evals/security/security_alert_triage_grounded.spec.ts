/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Grounded-output evals for the alert-triage skill.
 *
 * Unlike the routing evals in security_skills.spec.ts (which only validate skill/tool selection),
 * these evals seed deterministic alert data into the security alerts index, invoke the triage skill,
 * and verify that the highest-priority alert ID appears in the final model response.
 *
 * Evaluators used:
 *   - RequiredAlertIdsInResponse (CODE): asserts the seeded top-priority alert _id is in the answer
 *   - Factuality / Groundedness (LLM-judge): qualitative response quality checks
 *   - ExpectedSkillInvocation (CODE): confirms the alert-triage skill was activated
 *   - ToolUsageOnly (CODE): confirms only the prioritize-alerts tool was called
 *
 * The seeding and cleanup are handled in beforeAll / afterAll. If the alerts index does not exist
 * or seeding fails (e.g. the environment is not running Kibana Security), the eval degrades
 * gracefully: RequiredAlertIdsInResponse skips (empty requiredAlertIds → score 1) and only the
 * LLM judges run against the expected description.
 */

import { tags } from '@kbn/scout';
import { evaluate as base } from '../../src/evaluate';
import type { EvaluateDataset } from '../../src/evaluate_dataset';
import { createEvaluateDataset } from '../../src/evaluate_dataset';

const ALERTS_INDEX = '.alerts-security.alerts-default';

/** Marker used in deleteByQuery cleanup so we never touch real alert data. */
const EVAL_TAG = 'alert-triage-eval-seed';

interface SeededAlertIds {
  /** The critical Lateral Movement alert (_id): expected score = risk_score(99) + boost(30) = 129 */
  critical: string;
  /** The high Credential Access alert (_id): expected score = risk_score(75) + boost(20) = 95 */
  high: string;
  /** The medium Discovery alert (_id): expected score = risk_score(40) + boost(0) = 40 */
  medium: string;
}

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(
        createEvaluateDataset({
          chatClient,
          evaluators,
          executorClient,
          traceEsClient,
          log,
        })
      );
    },
    { scope: 'test' },
  ],
});

evaluate.describe(
  'Security Skills - Alert Triage (Grounded Output)',
  { tag: [...tags.serverless.security.complete] },
  () => {
    let seededAlertIds: SeededAlertIds | undefined;

    evaluate.beforeAll(async ({ esClient, log }) => {
      const now = new Date().toISOString();

      try {
        const [criticalResult, highResult, mediumResult] = await Promise.all([
          // Critical alert: Lateral Movement tactic → score 99 + 30 = 129
          esClient.index({
            index: ALERTS_INDEX,
            document: {
              '@timestamp': now,
              'kibana.alert.risk_score': 99,
              'kibana.alert.severity': 'critical',
              'kibana.alert.workflow_status': 'open',
              'kibana.alert.rule.name': 'Remote Service Creation via Named Pipe',
              'kibana.alert.rule.uuid': 'alert-triage-eval-rule-lateral-001',
              'kibana.alert.rule.tags': [EVAL_TAG],
              'kibana.alert.rule.threat': [
                {
                  tactic: {
                    id: 'TA0008',
                    name: 'Lateral Movement',
                    reference: 'https://attack.mitre.org/tactics/TA0008/',
                  },
                },
              ],
              host: { name: 'EVAL-DC01' },
              user: { name: 'Administrator' },
            },
            refresh: 'true',
          }),
          // High alert: Credential Access tactic → score 75 + 20 = 95
          esClient.index({
            index: ALERTS_INDEX,
            document: {
              '@timestamp': now,
              'kibana.alert.risk_score': 75,
              'kibana.alert.severity': 'high',
              'kibana.alert.workflow_status': 'open',
              'kibana.alert.rule.name': 'Credential Access via LSASS Memory',
              'kibana.alert.rule.uuid': 'alert-triage-eval-rule-cred-002',
              'kibana.alert.rule.tags': [EVAL_TAG],
              'kibana.alert.rule.threat': [
                {
                  tactic: {
                    id: 'TA0006',
                    name: 'Credential Access',
                    reference: 'https://attack.mitre.org/tactics/TA0006/',
                  },
                },
              ],
              host: { name: 'EVAL-WORKSTATION-01' },
            },
            refresh: 'true',
          }),
          // Medium alert: Discovery tactic → score 40 + 0 = 40
          esClient.index({
            index: ALERTS_INDEX,
            document: {
              '@timestamp': now,
              'kibana.alert.risk_score': 40,
              'kibana.alert.severity': 'medium',
              'kibana.alert.workflow_status': 'open',
              'kibana.alert.rule.name': 'Network Port Scan Detected',
              'kibana.alert.rule.uuid': 'alert-triage-eval-rule-discovery-003',
              'kibana.alert.rule.tags': [EVAL_TAG],
              'kibana.alert.rule.threat': [
                {
                  tactic: {
                    id: 'TA0007',
                    name: 'Discovery',
                    reference: 'https://attack.mitre.org/tactics/TA0007/',
                  },
                },
              ],
              host: { name: 'EVAL-SCANNER-01' },
            },
            refresh: 'true',
          }),
        ]);

        seededAlertIds = {
          critical: criticalResult._id,
          high: highResult._id,
          medium: mediumResult._id,
        };

        log.info(
          `[alert-triage-grounded] seeded ${Object.keys(seededAlertIds).length} test alerts — ` +
            `critical=${seededAlertIds.critical}, high=${seededAlertIds.high}, medium=${seededAlertIds.medium}`
        );
      } catch (err) {
        log.warning(
          `[alert-triage-grounded] could not seed test alerts (index may not exist or environment ` +
            `is not running Kibana Security). RequiredAlertIdsInResponse evaluator will be skipped. ` +
            `Error: ${err instanceof Error ? err.message : String(err)}`
        );
        seededAlertIds = undefined;
      }
    });

    evaluate.afterAll(async ({ esClient, log }) => {
      if (!seededAlertIds) return;

      try {
        await esClient.deleteByQuery({
          index: ALERTS_INDEX,
          query: {
            ids: { values: Object.values(seededAlertIds) },
          },
          refresh: true,
          ignore_unavailable: true,
        });
        log.info('[alert-triage-grounded] cleaned up seeded test alerts');
      } catch (err) {
        log.warning(
          `[alert-triage-grounded] cleanup failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    });

    evaluate('triage response cites the highest-priority alert ID', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'agent builder: security-alert-triage-grounded-output',
          description:
            'Validates that the alert-triage skill response references the highest-priority seeded ' +
            'alert ID. The critical Lateral Movement alert (risk_score=99, MITRE boost=+30) should ' +
            'rank first and its _id must appear in the final response.',
          examples: [
            {
              input: {
                question: 'What should I focus on right now? Show me the current alert queue.',
              },
              output: {
                expected:
                  'The highest-priority group is on host EVAL-DC01 driven by a critical-severity ' +
                  'Lateral Movement alert (Remote Service Creation via Named Pipe) with a risk score ' +
                  'of 99 and a +30 MITRE tactic boost. The top alert ID for that group should be ' +
                  `${seededAlertIds?.critical ?? '<seeded-id>'}. ` +
                  'A second group on EVAL-WORKSTATION-01 involves Credential Access (LSASS Memory), ' +
                  'scoring 95. A lower-priority Discovery alert on EVAL-SCANNER-01 rounds out the queue.',
              },
              metadata: {
                query_intent: 'Alert Queue Triage - Grounded Output',
                expectedSkill: 'alert-triage',
                expectedOnlyToolId: 'security.alert-triage.prioritize-alerts',
                // The CODE evaluator checks this ID appears verbatim in the final response.
                // Empty array when seeding failed → evaluator skips with score 1.
                requiredAlertIds: seededAlertIds ? [seededAlertIds.critical] : [],
                // Regression guard for bug 1 (risk scores read as 0): the seeded base risk
                // score must surface in the response. Skipped (score 1) when seeding failed.
                requiredTerms: seededAlertIds ? ['99'] : [],
              },
            },
          ],
        },
      });
    });

    evaluate(
      'triage response cites the top two group alert IDs when asked for detail',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-alert-triage-grounded-output-top2',
            description:
              'Validates that the triage response references the IDs for both the critical and high ' +
              'priority seeded alerts when the user asks for a prioritized list with details.',
            examples: [
              {
                input: {
                  question:
                    'Prioritize the alert queue for the last 24 hours and list the top alert IDs I should investigate.',
                },
                output: {
                  expected:
                    'The two highest-priority alerts are: ' +
                    `(1) ${
                      seededAlertIds?.critical ?? '<critical-id>'
                    } — Lateral Movement on EVAL-DC01, ` +
                    `risk score 99 with a +30 MITRE boost (score 129); ` +
                    `(2) ${
                      seededAlertIds?.high ?? '<high-id>'
                    } — Credential Access on EVAL-WORKSTATION-01, ` +
                    `risk score 75 with a +20 MITRE boost (score 95). ` +
                    'Both should be investigated further with alert-analysis.',
                },
                metadata: {
                  query_intent: 'Alert Queue Triage - Grounded Output with IDs',
                  expectedSkill: 'alert-triage',
                  expectedOnlyToolId: 'security.alert-triage.prioritize-alerts',
                  requiredAlertIds: seededAlertIds
                    ? [seededAlertIds.critical, seededAlertIds.high]
                    : [],
                  // Regression guard for bug 1: both seeded base risk scores must surface.
                  requiredTerms: seededAlertIds ? ['99', '75'] : [],
                },
              },
            ],
          },
        });
      }
    );
  }
);
