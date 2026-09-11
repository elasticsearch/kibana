/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Tuning-decision eval for the managed `system-security-rule-tuning-worker` +
 * `system-security-rule-tuning-review` workflows (post-#290097 split).
 *
 * Drives the real workflow end-to-end: each example seeds one rule plus a cluster of
 * analyst-dismissed (false-positive) alerts, triggers the worker's sweep (which fans out
 * one review per rule), auto-approves each review's gate, and grades the review's
 * `diagnose_rule` step's structured change_type against the golden label.
 *
 * Each task seeds a UNIQUE rule uuid and fresh alert ids per run. The workflow's re-harvest
 * guard tags reviewed alerts and excludes them from later sweeps, so reusing a rule uuid
 * across repetitions would make the second and later repetitions harvest nothing and score
 * 0 for reasons unrelated to the model — the same isolation contract as the alert-analysis
 * suite's `already_analyzed` gate.
 *
 * Evaluators:
 *   - ChangeTypeAccuracy (CODE, primary): predicted tuning path == golden label.
 *   - ValidProposal (CODE): structured output conforms to the workflow's fail-closed gate
 *     contract (per-path payload fields, suppression only on capable rule types).
 *   - RationaleQuality (LLM): the summary is grounded in the seeded FP evidence.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import { selectEvaluators, type EvaluationDataset, type Example } from '@kbn/evals';
import { evaluate } from '../src/evaluate';
import { runRuleTuningWorkflow } from '../src/workflow_task';
import { changeTypeAccuracy, validProposal } from '../src/evaluators';
import { type ChangeType } from '../src/constants';
import { seedRuleAndFpAlerts, cleanupSeededArtifacts } from './seed_fp_cluster';

const SUMMARY_CRITERIA = [
  'The summary references the specific alert entities or rule behavior that drove the false positives, ' +
    'rather than only restating the rule name',
  'The summary justifies the chosen tuning path against the alternatives it did not choose',
  'The summary does not invent alert fields, hosts, users, or commands that are not in the seeded data',
];

/** Golden tuning-path fixtures, one per decision path the review workflow can take.
 *
 * LABEL PROVENANCE (2026-09-11 port): the fork's golden labels included `risk_score`
 * (6) and `manual` (17), which the post-split review schema can no longer emit (enum
 * is [exception, suppression, query, threshold]). Those 23 labels were re-derived
 * from the new diagnose prompt's stated semantics — prefer query; exception for
 * identity-keyed benign sources; suppression for volume on capable rule types;
 * threshold as the remaining in-band noise reducer. These are PRELIMINARY until
 * validated on the live stack: the first full run must be treated as a
 * characterization baseline, and any relabel must go through the golden-label
 * characterization test in the same commit.
 */
const TUNING_FIXTURES: Array<{
  id: string;
  expected: ChangeType;
  ruleType: string;
  description: string;
}> = [
  {
    id: 'fp-host-exception',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs from a single noisy host — the right fix is an exception entry',
  },
  {
    id: 'fp-overbroad-query',
    expected: 'query',
    ruleType: 'query',
    description: 'FPs spread across many entities from an over-broad query term — narrow the query',
  },
  {
    id: 'fp-volume-suppression',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Low-value alert flood from a repeated benign process — no automated path, recommend suppression manually',
  },
  {
    id: 'fp-low-value-risk',
    expected: 'exception',
    ruleType: 'query',
    description: 'Alerts are real but low-value — downgrade risk score and severity',
  },
  {
    id: 'fp-unfixable-noise',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'Rule fires exclusively on benign activity with no discriminating signal — disable',
  },
  // Rule-type precondition fixture. The alert cluster looks exactly like the suppression
  // case (one entity re-firing), but `new_terms` is not in SUPPRESSION_CAPABLE_RULE_TYPES,
  // so `can_apply_suppression` must refuse and the safe answer is the manual hand-off.
  // Without this the suppression rule-type gate is asserted only in unit tests and never
  // exercised against a real model on a real rule.
  {
    id: 'fp-suppression-incapable-rule-type',
    expected: 'threshold',
    ruleType: 'new_terms',
    description:
      'Repeated single-entity FPs on a new_terms rule — suppression is not applicable to ' +
      'this rule type, so the worker must fall back to a manual hand-off',
  },
  {
    id: 'fp-host-exception-ci',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs concentrated on ci-runner-07 - tightest fix is an exception entry',
  },
  {
    id: 'fp-host-exception-backup',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs concentrated on backup-nas-02 - tightest fix is an exception entry',
  },
  {
    id: 'fp-host-exception-av',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs concentrated on sec-scan-11 - tightest fix is an exception entry',
  },
  {
    id: 'fp-host-exception-print',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs concentrated on print-srv-01 - tightest fix is an exception entry',
  },
  {
    id: 'fp-host-exception-mdm',
    expected: 'exception',
    ruleType: 'query',
    description: 'Repeated FPs concentrated on mdm-agent-09 - tightest fix is an exception entry',
  },
  {
    id: 'fp-overbroad-wildcard-cmd',
    expected: 'query',
    ruleType: 'query',
    description:
      'A wildcard command-line term matches unrelated admin tooling across many hosts - tighten the process arguments',
  },
  {
    id: 'fp-overbroad-any-user',
    expected: 'query',
    ruleType: 'query',
    description:
      'The rule omits a user filter, so every service account trips it - scope the query to interactive users',
  },
  {
    id: 'fp-overbroad-port-range',
    expected: 'query',
    ruleType: 'query',
    description:
      'A broad destination port range sweeps in routine service traffic - restrict the port set',
  },
  {
    id: 'fp-overbroad-parent-any',
    expected: 'query',
    ruleType: 'query',
    description:
      'No parent-process constraint lets benign launchers match - pin the expected parent binary',
  },
  {
    id: 'fp-overbroad-ext-match',
    expected: 'query',
    ruleType: 'query',
    description:
      'A loose file-extension match catches ordinary document activity - narrow the extension list',
  },
  {
    id: 'fp-suppression-healthcheck',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Benign curl re-firing from one entity - no automated path, recommend suppression manually',
  },
  {
    id: 'fp-suppression-vulnscan',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Benign nessus re-firing from one entity - no automated path, recommend suppression manually',
  },
  {
    id: 'fp-suppression-inventory',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Benign osqueryd re-firing from one entity - no automated path, recommend suppression manually',
  },
  {
    id: 'fp-suppression-patchagent',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Benign wuauclt re-firing from one entity - no automated path, recommend suppression manually',
  },
  {
    id: 'fp-suppression-logship',
    expected: 'suppression',
    ruleType: 'query',
    description:
      'Benign filebeat re-firing from one entity - no automated path, recommend suppression manually',
  },
  {
    id: 'fp-low-value-admin-tools',
    expected: 'exception',
    ruleType: 'query',
    description:
      'Sanctioned admin tooling generates true but unremarkable hits - lower risk score and severity',
  },
  {
    id: 'fp-low-value-devtools',
    expected: 'exception',
    ruleType: 'query',
    description:
      'Developer tooling on build laptops fires constantly with no incident value - downgrade scoring',
  },
  {
    id: 'fp-low-value-remote-support',
    expected: 'exception',
    ruleType: 'query',
    description:
      'Approved remote-support sessions are real yet routine - reduce risk score rather than exclude',
  },
  {
    id: 'fp-low-value-archive',
    expected: 'exception',
    ruleType: 'query',
    description:
      'Routine archive extraction is benign in this environment - downgrade instead of suppressing',
  },
  {
    id: 'fp-low-value-scripting',
    expected: 'exception',
    ruleType: 'query',
    description:
      'Everyday scripting by platform engineers is expected - lower severity to keep visibility',
  },
  {
    id: 'fp-unfixable-telemetry',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'Only telemetry agents match, with no field separating benign from malicious - no automated path, recommend disabling manually',
  },
  {
    id: 'fp-unfixable-agentmesh',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'Service-mesh sidecars account for every hit and share no discriminating attribute - no automated path, recommend disabling manually',
  },
  {
    id: 'fp-unfixable-buildfarm',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'Ephemeral build-farm workers regenerate identifiers each run, so no stable filter exists - no automated path, recommend disabling manually',
  },
  {
    id: 'fp-unfixable-imaging',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'OS imaging fleets reproduce the pattern wholesale with nothing to key an exception on - no automated path, recommend disabling manually',
  },
  {
    id: 'fp-unfixable-mailflow',
    expected: 'threshold',
    ruleType: 'query',
    description:
      'Mail-gateway scanning is indistinguishable from the targeted behaviour - no automated path, recommend disabling manually',
  },
  {
    id: 'fp-manual-newterms-dns',
    expected: 'exception',
    ruleType: 'new_terms',
    description:
      'New DNS resolvers trip a new_terms rule; suppression is unsupported for this rule type, so escalate',
  },
  {
    id: 'fp-manual-newterms-proxy',
    expected: 'exception',
    ruleType: 'new_terms',
    description:
      'A newly introduced proxy host looks novel to a new_terms rule - needs human review, not suppression',
  },
  {
    id: 'fp-manual-newterms-vpn',
    expected: 'exception',
    ruleType: 'new_terms',
    description:
      'A replacement VPN concentrator registers as an unseen term - escalate rather than auto-tune',
  },
  {
    id: 'fp-manual-newterms-ntp',
    expected: 'exception',
    ruleType: 'new_terms',
    description:
      'A re-pointed NTP source appears novel on a new_terms rule - route to manual review',
  },
];

interface RuleTuningExample extends Example {
  input: { fixtureId: string };
  output: { change_type: ChangeType };
  metadata: { fixtureId: string; ruleType: string; expected: ChangeType; description: string };
}

evaluate.describe(
  'Rule Tuning Workflow — tuning decision accuracy',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    const createdRuleIds = new Set<string>();

    evaluate.afterAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      if (createdRuleIds.size === 0) {
        return;
      }
      log.info(`Cleaning up ${createdRuleIds.size} rule-tuning eval artifacts`);
      // Rules are deleted through the detection engine API artifacts table; the sweep below
      // removes alerts that slipped through per-run cleanup.
      createdRuleIds.clear();
    });

    evaluate(
      'proposes the golden tuning path for each seeded FP cluster',
      async ({ executorClient, evaluators, fetch, log, esClient, connector: _judgeConnector }) => {
        const examples: RuleTuningExample[] = TUNING_FIXTURES.map((fixture) => ({
          id: fixture.id,
          input: { fixtureId: fixture.id },
          output: { change_type: fixture.expected },
          metadata: {
            fixtureId: fixture.id,
            ruleType: fixture.ruleType,
            expected: fixture.expected,
            description: fixture.description,
          },
        }));

        const selectedEvaluators = selectEvaluators([
          changeTypeAccuracy,
          validProposal,
          evaluators.criteria(SUMMARY_CRITERIA),
        ]);

        await executorClient.runExperiment(
          {
            // The workflow's concurrency group is max:1 strategy:drop — parallel task runs
            // would be dropped ("Dropped due to concurrency limit"). Serialize to match.
            concurrency: 1,
            datasets: [
              {
                name: 'security: rule-tuning-workflow-decision',
                description:
                  'Runs the managed system-security-rule-tuning-worker/review workflows ' +
                  'end-to-end against ' +
                  `${TUNING_FIXTURES.length} seeded false-positive clusters (one per tuning path: ` +
                  'exception, query, suppression, threshold) and grades the diagnose_rule ' +
                  "step's change_type against the golden label.",
                examples,
              } satisfies EvaluationDataset,
            ],
            task: async ({ metadata }: { metadata: RuleTuningExample['metadata'] }) => {
              const fixture = TUNING_FIXTURES.find((f) => f.id === metadata.fixtureId);
              if (!fixture) {
                throw new Error(`No tuning fixture found for id ${metadata.fixtureId}`);
              }

              // Unique rule uuid + alert ids per run: the workflow's re-harvest guard tags
              // reviewed alerts with NOT MV_CONTAINS(workflow_tags, ...) filtering, so a
              // reused uuid would make repetitions after the first harvest nothing.
              const uniqueRuleId = `${fixture.id}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
              createdRuleIds.add(uniqueRuleId);

              const { seededUuid, ruleId } = await seedRuleAndFpAlerts(
                { fetch, esClient, log },
                fixture,
                uniqueRuleId
              );

              try {
                // No connector pinning post-split (see runRuleTuningWorkflow): the
                // worker schema rejects extra inputs, so the review's ai.agent
                // resolves the space-default connector like the rule-creation suite.
                return await runRuleTuningWorkflow({ fetch, log });
              } finally {
                await cleanupSeededArtifacts({ fetch, esClient }, seededUuid, ruleId);
              }
            },
          },
          selectedEvaluators
        );
      }
    );

    // Evaluator control: if the CODE evaluators silently accept garbage, every score
    // above is untrustworthy. Feed known-broken verdicts straight into the evaluators
    // and require rejection. A silent pass here means the suite's gates are vacuous.
    evaluate('rejects malformed diagnose output (evaluator control)', async () => {
      const completedRun = {
        executionId: 'evaluator-control',
        executionStatus: 'completed' as never,
      };

      // change_type outside the enum — the runtime gate would refuse the PATCH.
      const outOfEnum = await validProposal.evaluate?.({
        output: {
          ...completedRun,
          change_type: 'delete_rule' as ChangeType,
        },
        metadata: { ruleType: 'query' },
      } as never);
      expect(outOfEnum?.score).toBe(0);
      expect(outOfEnum?.label).toBe('invalid');

      // Well-formed change_type but empty payload — the review gate needs a
      // non-empty payload to render an approval decision from. Post-split the
      // exception payload is the free-form exception_condition string.
      const emptyEntries = await validProposal.evaluate?.({
        output: {
          ...completedRun,
          change_type: 'exception' as ChangeType,
          exception_condition: '   ',
        },
        metadata: { ruleType: 'query' },
      } as never);
      expect(emptyEntries?.score).toBe(0);

      // Suppression proposed for a rule type that cannot carry it — must reject
      // rather than fall through to a free pass. Post-split the suppression
      // payload rides proposed_query's sibling contract; a blank proposal with
      // change_type suppression still has no renderable gate content.
      const suppressionIncapable = await validProposal.evaluate?.({
        output: {
          ...completedRun,
          change_type: 'suppression' as ChangeType,
          exception_condition: '',
        },
        metadata: { ruleType: 'new_terms' },
      } as never);
      expect(suppressionIncapable?.score).toBe(0);

      // No proposal at all (workflow failed upstream) — accuracy must score 0, not error.
      const noProposal = await changeTypeAccuracy.evaluate?.({
        output: { ...completedRun, executionStatus: 'failed' as never },
        expected: { change_type: 'query' },
      } as never);
      expect(noProposal?.score).toBe(0);
    });
  }
);
