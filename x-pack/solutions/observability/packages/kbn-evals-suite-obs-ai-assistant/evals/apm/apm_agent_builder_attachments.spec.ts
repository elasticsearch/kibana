/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Eval coverage for Agent Builder APM attachment types:
 *   - `observability.service-map`  (renders service topology with RED metrics)
 *   - `observability.apm-metrics`  (current-vs-baseline comparison card)
 *   - `observability.apm-timeseries` (latency/error-rate/throughput chart over time)
 *
 * Run with:
 *   EVALUATION_CLIENT=agent_builder \
 *   AGENT_BUILDER_AGENT_ID=<agent-id> \
 *   EVALUATION_CONNECTOR_ID=<judge-connector-id> \
 *   node scripts/playwright test \
 *     --config x-pack/solutions/observability/packages/kbn-evals-suite-obs-ai-assistant/playwright.config.ts \
 *     evals/apm/apm_agent_builder_attachments.spec.ts \
 *     --project="<model-connector>"
 *
 * Note: this spec is NOT mirrored in the legacy evaluation framework — it covers
 * Agent Builder-specific behavior that the legacy framework does not support.
 */

import { tags } from '@kbn/scout';
import { evaluate } from '../../src/evaluate';
import {
  generateAIAssistantApmScenario,
  generateApmAttachmentEvalScenario,
} from '../../src/data_generators/apm';

evaluate.describe(
  'APM Agent Builder Attachments',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate.beforeAll(async ({ apmSynthtraceEsClient }) => {
      await apmSynthtraceEsClient.clean();
      // Base service-map topology (ai-assistant-service-front → ai-assistant-service-back)
      await generateAIAssistantApmScenario({ apmSynthtraceEsClient });
      // Latency-spike scenario for metrics card and timeseries chart evaluations
      await generateApmAttachmentEvalScenario({ apmSynthtraceEsClient });
    });

    // ─── Service map attachment ───────────────────────────────────────────────

    evaluate('service map attachment — topology rendering', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'apm attachments: service map topology',
          description:
            'Validates that the agent produces a service-map attachment that captures the known service dependency topology and RED metrics on each edge.',
          examples: [
            {
              input: {
                question:
                  'Show me a service map for ai-assistant-service-front in the test environment.',
              },
              output: {
                criteria: [
                  'Calls the service-map skill or get_service_topology tool',
                  'Produces an observability.service-map attachment',
                  'The attachment data contains a connection from ai-assistant-service-front to ai-assistant-service-back',
                  'The attachment includes RED metrics (latency, throughput, or error rate) on the connection',
                ],
              },
              metadata: {},
            },
          ],
        },
      });
    });

    evaluate(
      'service map attachment — service with alert and SLO badges',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm attachments: service map with badge metadata',
            description:
              'Validates that the service-map attachment can carry alert count and SLO status per node when the agent supplies that metadata.',
            examples: [
              {
                input: {
                  question:
                    'Show me the service map for ai-assistant-service-front with active alert and SLO health information on each service node.',
                },
                output: {
                  criteria: [
                    'Calls the get_service_topology tool',
                    'Produces an observability.service-map attachment',
                    'Passes the nodeMetadata returned by get_service_topology into the attachment (the map can show alertsCount / sloStatus badges per service when that data is available)',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    // ─── APM metrics comparison card attachment ────────────────────────────────

    evaluate(
      'apm metrics attachment — current vs baseline comparison',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm attachments: metrics comparison card',
            description:
              'Validates that the agent produces an apm-metrics comparison card comparing current (alert window) vs baseline metrics for the eval-payment service.',
            examples: [
              {
                input: {
                  question:
                    'Compare the current APM metrics for eval-payment over the last 15 minutes against the previous 15 minutes as a baseline. Show latency, error rate, and throughput.',
                },
                output: {
                  criteria: [
                    'Calls the get_apm_metrics tool with both a current window and a baseline window',
                    'Produces an observability.apm-metrics attachment',
                    'The attachment contains a serviceName of "eval-payment"',
                    'The attachment includes both current and baseline metric snapshots',
                    'The response describes that latency is significantly higher in the current window compared to baseline (current ~800ms vs baseline ~100ms)',
                    // errorRate in apm-metrics attachment is a percentage (0–100): baseline ~1–3%, current ~20%+
                    'The response describes that error rate is significantly higher in the current window (e.g. around 20%) compared to baseline (e.g. around 1–3%)',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    // ─── APM timeseries chart attachment ──────────────────────────────────────

    evaluate('apm timeseries attachment — latency over time', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'apm attachments: timeseries chart latency',
          description:
            'Validates that the agent produces an apm-timeseries attachment showing latency over time for eval-payment, making the spike visible.',
          examples: [
            {
              input: {
                question:
                  'Show me the latency over time for eval-payment over the last 30 minutes as a chart.',
              },
              output: {
                criteria: [
                  'Calls the get_apm_timeseries tool with metric "latency"',
                  'Produces an observability.apm-timeseries attachment',
                  'The attachment data contains the service name "eval-payment"',
                  'The metric type is latency',
                  'The attachment data points span approximately 30 minutes',
                  'The data shows a clear latency increase in the second half of the time range, reflecting the spike from ~100ms to ~800ms',
                ],
              },
              metadata: {},
            },
          ],
        },
      });
    });

    evaluate(
      'apm timeseries attachment — error rate with threshold',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'apm attachments: timeseries chart error rate with threshold',
            description:
              'Validates that the agent includes an alert threshold in the timeseries attachment when the question references an alert rule.',
            examples: [
              {
                input: {
                  question:
                    'Show me the error rate over time for eval-payment over the last 30 minutes. The alert threshold is 10%.',
                },
                output: {
                  criteria: [
                    'Calls the get_apm_timeseries tool with metric "failedTransactionRate"',
                    'Produces an observability.apm-timeseries attachment',
                    'The attachment metric type is failedTransactionRate',
                    // Unit is '%' and values are 0–100, so a 10% threshold is stored as 10 (not 0.1)
                    'The attachment includes a threshold value of 10 (representing 10%)',
                    'The data shows the error rate exceeding the threshold in the last 15 minutes',
                  ],
                },
                metadata: {},
              },
            ],
          },
        });
      }
    );

    evaluate.afterAll(async ({ apmSynthtraceEsClient }) => {
      await apmSynthtraceEsClient.clean();
    });
  }
);
