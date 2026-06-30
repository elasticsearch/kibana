/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Eval coverage for APM Agent Builder skill routing:
 *
 * The `investigate-apm-alert` skill should be selected when an APM alert is investigated
 * (rule types: apm.transaction_duration, apm.error_rate, apm.transaction_error_rate, apm.anomaly).
 * It must NOT be selected for non-APM alerts (SLO burn rate, custom threshold, log threshold, etc.).
 *
 * When selected, the skill enforces a mandatory three-attachment output contract:
 *   1. observability.apm-metrics
 *   2. observability.apm-timeseries
 *   3. observability.service-map
 *
 * Run with:
 *   EVALUATION_CLIENT=agent_builder \
 *   AGENT_BUILDER_AGENT_ID=<agent-id> \
 *   EVALUATION_CONNECTOR_ID=<judge-connector-id> \
 *   node scripts/playwright test \
 *     --config x-pack/solutions/observability/packages/kbn-evals-suite-obs-ai-assistant/playwright.config.ts \
 *     evals/apm/apm_agent_builder_skill_routing.spec.ts \
 *     --project="<model-connector>"
 */

import { tags } from '@kbn/scout';
import type { RuleResponse } from '@kbn/alerting-plugin/common/routes/rule/response/types/v1';
import { evaluate } from '../../src/evaluate';
import { generateApmAttachmentEvalScenario } from '../../src/data_generators/apm';
import {
  apmTransactionRateAIAssistant,
  customThresholdAIAssistantMetricAvg,
} from '../../src/alert_templates/alerts';

evaluate.describe(
  'APM Agent Builder Skill Routing',
  { tag: tags.serverless.observability.complete },
  () => {
    const ruleIds: string[] = [];

    evaluate.beforeAll(async ({ apmSynthtraceEsClient, kbnClient, log }) => {
      await apmSynthtraceEsClient.clean();

      // Seed APM data: eval-payment service with a latency spike + high error rate in the last 15 min
      await generateApmAttachmentEvalScenario({ apmSynthtraceEsClient });

      // APM rule: apm.transaction_error_rate for eval-payment in production
      // Threshold of 10% — the spike scenario crosses ~20% so it should fire
      try {
        const { data: apmRule } = await kbnClient.request<RuleResponse>({
          method: 'POST',
          path: '/api/alerting/rule',
          body: apmTransactionRateAIAssistant.ruleParams,
        });
        ruleIds.push(apmRule.id);
        log.debug(`Created APM rule ${apmRule.id}`);

        await kbnClient.request<void>({
          method: 'POST',
          path: `/internal/alerting/rule/${apmRule.id}/_run_soon`,
        });
      } catch (e) {
        log.error(`Failed to create or fire APM rule: ${e}`);
      }

      // Non-APM rule: custom metric threshold — should NOT trigger investigate-apm-alert
      try {
        const { data: thresholdRule } = await kbnClient.request<RuleResponse>({
          method: 'POST',
          path: '/api/alerting/rule',
          body: customThresholdAIAssistantMetricAvg.ruleParams,
        });
        ruleIds.push(thresholdRule.id);
        log.debug(`Created custom threshold rule ${thresholdRule.id}`);

        await kbnClient.request<void>({
          method: 'POST',
          path: `/internal/alerting/rule/${thresholdRule.id}/_run_soon`,
        });
      } catch (e) {
        log.error(`Failed to create or fire custom threshold rule: ${e}`);
      }

      // Wait (bounded) for each rule to actually execute, rather than a blind fixed sleep.
      // Poll the rule's execution status until it leaves the initial `pending` state.
      const POLL_ATTEMPTS = 20;
      const POLL_INTERVAL_MS = 1000;
      for (const ruleId of ruleIds) {
        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
          try {
            const { data: rule } = await kbnClient.request<RuleResponse>({
              method: 'GET',
              path: `/api/alerting/rule/${ruleId}`,
            });
            if (rule.execution_status && rule.execution_status.status !== 'pending') {
              break;
            }
          } catch (e) {
            log.debug(`Polling status for rule ${ruleId} failed: ${e}`);
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }
    });

    // ─── APM alert → investigate-apm-alert skill selected ───────────────────

    evaluate(
      'APM alert investigation — uses investigate-apm-alert skill with all three attachments',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm skill routing: APM alert triggers investigate-apm-alert skill',
            description:
              'Validates that investigating an APM alert (apm.transaction_error_rate) selects the investigate-apm-alert skill and renders all three mandatory attachments: apm-metrics comparison card, apm-timeseries chart, and service-map.',
            examples: [
              {
                input: {
                  question:
                    'Investigate the active alert for the eval-payment service in the production environment.',
                },
                output: {
                  criteria: [
                    'Identifies an active APM alert for eval-payment with rule type apm.transaction_error_rate',
                    // The judge cannot reliably observe skill selection from the response text, so this
                    // is phrased around the observable output contract rather than the skill name.
                    'Follows the investigate-apm-alert output contract (metrics card, trend chart, and service map rendered before the prose analysis)',
                    'Produces an observability.apm-metrics attachment for eval-payment',
                    'Produces an observability.apm-timeseries attachment showing error rate or latency over time for eval-payment',
                    'Produces an observability.service-map attachment showing service topology for eval-payment',
                    'The response is structured with distinct sections for metrics, trend, blast radius, summary, and probable causes',
                    'Does NOT merely describe the metrics in prose — all three chart/card attachments are explicitly rendered',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    // ─── Non-APM alert → investigate-apm-alert skill NOT selected ───────────

    evaluate(
      'non-APM alert investigation — does NOT use investigate-apm-alert skill',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm skill routing: non-APM alert does not trigger investigate-apm-alert skill',
            description:
              'Validates that investigating a custom metric threshold alert (observability.rules.custom_threshold) does NOT select the investigate-apm-alert skill and does NOT render APM-specific attachments.',
            examples: [
              {
                input: {
                  question:
                    'Investigate the active alert for the metric_synth rule. The rule type is observability.rules.custom_threshold.',
                },
                output: {
                  criteria: [
                    'Identifies the alert as a custom threshold rule (observability.rules.custom_threshold), not an APM rule',
                    'Does NOT load the investigate-apm-alert skill for this non-APM alert',
                    'Does NOT produce an observability.apm-metrics attachment',
                    'Does NOT produce an observability.apm-timeseries attachment',
                    'Does NOT produce an observability.service-map attachment',
                    'Provides a relevant investigation response appropriate for a custom metric threshold alert',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    // ─── APM alert by rule type in question ─────────────────────────────────

    evaluate(
      'APM latency alert — apm.transaction_duration rule type triggers APM skill',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm skill routing: latency rule type description triggers APM skill',
            description:
              'Validates that when the user explicitly states the rule type is apm.transaction_duration, the agent selects the APM investigation skill.',
            examples: [
              {
                input: {
                  question:
                    'Triage this alert: the eval-payment service has a latency threshold breach. The rule type is apm.transaction_duration.',
                },
                output: {
                  criteria: [
                    'Recognises the alert rule type as apm.transaction_duration',
                    'Uses the APM investigation skill (investigate-apm-alert) or follows its output contract',
                    'Produces an observability.apm-metrics attachment',
                    'Produces an observability.apm-timeseries attachment with metric type latency',
                    'Produces an observability.service-map attachment',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    evaluate.afterAll(async ({ apmSynthtraceEsClient, kbnClient, log }) => {
      await apmSynthtraceEsClient.clean();

      for (const id of ruleIds) {
        try {
          await kbnClient.request({ method: 'DELETE', path: `/api/alerting/rule/${id}` });
          log.debug(`Deleted rule ${id}`);
        } catch (e) {
          log.error(`Failed to delete rule ${id}: ${e}`);
        }
      }
    });
  }
);
