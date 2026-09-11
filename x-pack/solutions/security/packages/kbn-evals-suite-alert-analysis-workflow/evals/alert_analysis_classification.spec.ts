/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Classification-accuracy eval for the managed `system-security-alert-analysis` workflow.
 *
 * Unlike a chat/agent eval, this drives the real workflow end-to-end: `beforeAll` points the
 * space's runtime config at the model under test, then each example indexes a fresh alert, runs
 * the workflow via its `alert` trigger, and grades the `ai.agent` step's structured verdict
 * against the golden label.
 *
 * Each task indexes a UNIQUE alert (fresh alert id, rule uuid, and entity-correlation fields) and
 * deletes it afterwards. Three independent reasons require the freshness:
 *   1. A unique alert `_id` keeps the workflow's `already_analyzed` tag gate from skipping a
 *      repetition (the workflow tags analyzed alerts and short-circuits on re-runs).
 *   2. A unique rule uuid keeps each run's rule-scoped enrichment isolated. The eval runner runs
 *      tasks concurrently (repetitions default to 5-way concurrency), and every rule-scoped
 *      enrichment query in the workflow (prevalence, noise signal, close history, rule metadata)
 *      filters on the alert's rule uuid. With a shared rule uuid, concurrent repetitions of the
 *      same base alert would count each other and feed nondeterministic context to the model under
 *      test.
 *   3. Unique `process.entity_id` and `host.id` keep `get_related_alerts` isolated. That step
 *      correlates alerts by entity fields within a time window, not by rule uuid, so concurrent
 *      repetitions of the same base alert would otherwise surface each other as Related Alerts.
 *
 * Evaluators:
 *   - ClassificationAccuracy (CODE, primary): predicted verdict == golden label.
 *   - ValidVerdict (CODE): structured output conforms (enum classification + confidence in [0,1]).
 *   - trajectory (CODE): zero-tool guardrail — agent must not call tools after pre-built context.
 *   - RationaleQuality (LLM): the rationale is grounded in the alert's observable evidence and
 *     names the decision gate / confidence tier it applied.
 *
 * Trace-based metrics (latency/tokens) are intentionally omitted for v1; whether the workflow's
 * `ai.agent` conversation emits joinable OTel spans is verified during the runtime gate.
 */

import { randomUUID } from 'crypto';
import { tags } from '@kbn/scout';
import type { EsClient } from '@kbn/scout';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import {
  selectEvaluators,
  type EvalConnector,
  type EvaluationDataset,
  type Example,
} from '@kbn/evals';
import { evaluate } from '../src/evaluate';
import { runAlertAnalysisWorkflow } from '../src/workflow_task';
import { configureAlertAnalysisWorkflow } from '../src/space_config';
import {
  classificationAccuracy,
  createAlertAnalysisTrajectoryEvaluator,
  validVerdict,
} from '../src/evaluators';
import { ALERT_ANALYSIS_EVAL_ALERTS } from '../src/synthetic_alerts';
import { ALERTS_INDEX } from '../src/constants';

/** Base label/doc keyed by the base alert id, so a task can rebuild a fresh doc per run. */
const ALERT_BY_ID = new Map(ALERT_ANALYSIS_EVAL_ALERTS.map((alert) => [alert.id, alert]));

const RATIONALE_CRITERIA = [
  'The rationale references specific observable fields from the alert (such as the process name, ' +
    'command line, code signature/signer, event.code, or file path) rather than only restating the rule name',
  'The rationale names the confidence tier or the decision gate it applied to reach the verdict',
  'The rationale does not invent alert fields, file paths, commands, or entities that are not present in the alert data',
];

interface AlertAnalysisExample extends Example {
  input: { alertId: string };
  output: { classification: string };
  metadata: { alertId: string; alertIndex: string; expected: string; description: string };
}

evaluate.describe(
  'Alert Analysis Workflow — classification accuracy',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    // Alerts created by tasks, deleted after each run; afterAll sweeps any that slipped through.
    const createdAlertIds = new Set<string>();

    evaluate.beforeAll(
      async ({
        fetch,
        connector,
        log,
      }: {
        fetch: HttpHandler;
        connector: EvalConnector;
        log: ToolingLog;
      }) => {
        // Point this space's alert-analysis workflow at the connector under test so the
        // workflow's `ai.agent` step is routed to the model being evaluated.
        await configureAlertAnalysisWorkflow({
          fetch,
          log,
          connectorId: connector.id,
          agentId: agentBuilderDefaultAgentId,
        });
      }
    );

    evaluate.afterAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      if (createdAlertIds.size === 0) {
        return;
      }
      log.info(`Deleting ${createdAlertIds.size} leftover alert-analysis eval alerts`);
      await esClient.deleteByQuery({
        index: ALERTS_INDEX,
        query: { ids: { values: [...createdAlertIds] } },
        refresh: true,
        conflicts: 'proceed',
      });
    });

    evaluate(
      'classifies alerts with the expected true/false positive verdict',
      async ({ executorClient, evaluators, esClient, fetch, log, traceEsClient }) => {
        const examples: AlertAnalysisExample[] = ALERT_ANALYSIS_EVAL_ALERTS.map((alert) => ({
          id: alert.id,
          input: { alertId: alert.id },
          output: { classification: alert.expected },
          metadata: {
            alertId: alert.id,
            alertIndex: ALERTS_INDEX,
            expected: alert.expected,
            description: alert.description,
          },
        }));

        const selectedEvaluators = selectEvaluators([
          classificationAccuracy,
          validVerdict,
          createAlertAnalysisTrajectoryEvaluator(),
          evaluators.criteria(RATIONALE_CRITERIA),
        ]);

        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'security: alert-analysis-workflow-classification',
                description:
                  'Runs the managed system-security-alert-analysis workflow end-to-end against ' +
                  `${ALERT_ANALYSIS_EVAL_ALERTS.length} labeled synthetic alerts spanning the four ` +
                  'confidence tiers (Tier 1/2 → true_positive, Tier 3/4 → false_positive) and grades ' +
                  "the ai.agent step's classification against the golden label.",
                examples,
              } satisfies EvaluationDataset,
            ],
            task: async ({ metadata }) => {
              const { alertId, alertIndex } = metadata as {
                alertId: string;
                alertIndex: string;
              };
              const base = ALERT_BY_ID.get(alertId);
              if (!base) {
                throw new Error(`No synthetic alert found for id ${alertId}`);
              }

              // Fresh alert id, rule uuid, and entity ids per run so concurrent repetitions never
              // share state: the unique `_id` bypasses the workflow's `already_analyzed` tag gate,
              // the unique rule uuid (which `preprocessAlertInputs` maps to `event.rule.id`) scopes
              // rule-filtered enrichment queries, and unique entity ids keep `get_related_alerts`
              // from correlating in-flight repetitions of the same base alert. Overriding flattened
              // keys via spread is safe because `base.doc` stores dotted keys as top-level properties
              // (primitive values), so this clones without mutating the shared base document.
              const uniqueAlertId = `${alertId}-${randomUUID()}`;
              const uniqueRuleId = `${uniqueAlertId}-rule`;
              const document = {
                ...base.doc,
                'kibana.alert.uuid': uniqueAlertId,
                'kibana.alert.rule.uuid': uniqueRuleId,
                'kibana.alert.rule.rule_id': uniqueRuleId,
                // Break entity-graph correlation between concurrent repetitions of the same base
                // alert: get_related_alerts correlates on these (base-keyed) entity ids, not rule uuid.
                'process.entity_id': `entity-${uniqueAlertId}`,
                'host.id': `host-${uniqueAlertId}`,
              };
              createdAlertIds.add(uniqueAlertId);
              await esClient.index({
                index: alertIndex,
                id: uniqueAlertId,
                document,
                refresh: 'wait_for',
              });

              try {
                return await runAlertAnalysisWorkflow({
                  fetch,
                  log,
                  traceEsClient,
                  alertId: uniqueAlertId,
                  alertIndex,
                });
              } finally {
                await esClient
                  .delete({ index: alertIndex, id: uniqueAlertId, refresh: true })
                  .then(() => createdAlertIds.delete(uniqueAlertId))
                  .catch(() => {
                    // Leave it in createdAlertIds so afterAll sweeps it.
                  });
              }
            },
          },
          selectedEvaluators
        );
      }
    );
  }
);
