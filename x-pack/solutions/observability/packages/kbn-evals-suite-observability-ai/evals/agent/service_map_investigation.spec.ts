/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Eval suite for the `investigate-service-map` skill introduced in #288581.
 *
 * The `payment-unreachable` snapshot already contains a realistic multi-service
 * topology (frontend → checkout → payment, plus cart / currency / shipping /
 * product-catalog) with a genuinely degraded payment service (connection refused,
 * 100% error rate on checkout's outbound calls) — exactly what the eval needs.
 *
 * Each example sends what the "Investigate map" button actually sends: the real
 * `observability.service-map-context` attachment carrying the view filters, plus
 * the button's auto-sent prompt. The skill activates on that attachment, so this
 * exercises routing as well as behaviour.
 */

import { tags } from '@kbn/scout';
import type { LoadResult } from '@kbn/es-snapshot-loader';
import {
  replayObservabilityDataStreams,
  cleanObservabilityDataStreams,
} from '../../src/data_generators/replay';
import { GCS_BUCKET } from '../../src/scenarios/constants';
import { evaluate } from './evaluate';

const PAYMENT_UNREACHABLE_GCS = {
  bucket: GCS_BUCKET,
  basePath: 'otel-demo/payment-unreachable',
};

const SNAPSHOT_NAME = 'payment-unreachable';

/** Tools the investigate-service-map skill must invoke for a whole-scope investigation. */
const INVESTIGATION_TOOLS = [
  'observability.get_services',
  'observability.get_alerts',
  'observability.get_service_topology',
  'attachments.add',
];

const SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE = 'observability.service-map-context';

/**
 * The prompt the "Investigate map" button auto-sends
 * (`serviceMapInvestigateButton.defaultPrompt`). The view filters travel in the
 * attachment, not in this text.
 */
const BUTTON_PROMPT =
  'Investigate the service map I am currently viewing. Identify services with problems — ' +
  'active alerts, violated or degrading SLOs, ML anomalies, or unusual error rates and latency ' +
  'between services — ordered by severity: active alerts first, then violated SLOs, ML anomalies, ' +
  'degrading SLOs, unusual error rates and latency, and finally structural observations such as ' +
  'isolated services. Explain the architecture and how the services connect, and give me links to ' +
  'the most problematic services and their alerts.';

/** Mirrors the attachment the button builds from the user's map view. */
function serviceMapContextAttachment(
  data: {
    timeRange?: { from: string; to: string };
    environment?: string;
    kuery?: string;
    highlightedServiceNames?: string[];
  } = {}
) {
  return [
    {
      type: SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
      data: {
        timeRange: { from: 'now-15m', to: 'now' },
        ...data,
      },
    },
  ];
}

evaluate.describe(
  'Investigate Service Map Skill (#288581)',
  { tag: tags.serverless.observability.complete },
  () => {
    let replayResult: LoadResult;

    evaluate.beforeAll(async ({ esClient, log }) => {
      log.info('Replaying payment-unreachable scenario data for investigate-service-map eval');
      replayResult = await replayObservabilityDataStreams(
        esClient,
        log,
        SNAPSHOT_NAME,
        PAYMENT_UNREACHABLE_GCS
      );
    });

    // ------------------------------------------------------------------
    // Example 1 — whole-scope investigation (simulates the button prompt)
    // ------------------------------------------------------------------
    evaluate(
      'investigates the full service map scope and surfaces the degraded payment service',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'service-map investigation — whole scope',
            description:
              'Validates that the investigate-service-map skill surveys all services, orders issues by severity, renders the service-map attachment, explains the architecture, and provides deep links. Uses the payment-unreachable snapshot where checkout degrades because payment is unreachable.',
            examples: [
              {
                input: {
                  question: BUTTON_PROMPT,
                  attachments: serviceMapContextAttachment(),
                },
                output: {
                  criteria: [
                    'Leads with an issues-by-severity section before describing architecture',
                    'Identifies the payment service as the primary problem (unreachable / high error rate) as the highest-severity issue',
                    'Identifies the checkout service as a secondary victim — it shows errors because payment is unreachable, not because checkout itself has a bug',
                    'Does not flag frontend, cart, currency, shipping, or product-catalog as having problems (they are healthy)',
                    'Explains the overall architecture: frontend as an entry point calling checkout, checkout fanning out to payment and other downstream services',
                    'Provides at least one concrete `/app/apm/` deep link to the payment or checkout service',
                    'Renders a service map attachment of the topology (not only a prose description)',
                    'Orders issues by severity — problem services appear before structural observations',
                    'Does not invent services, alerts, or anomalies that are not present in the data',
                  ],
                  expectedTools: INVESTIGATION_TOOLS,
                },
                metadata: { expectedSkill: 'investigate-service-map' },
              },
            ],
          },
        });
      }
    );

    // ------------------------------------------------------------------
    // Example 2 — user highlighted a healthy service
    // ------------------------------------------------------------------
    evaluate(
      'respects a highlighted healthy service and does not invent problems for it',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'service-map investigation — highlighted healthy service',
            description:
              'Validates that when the user has highlighted the frontend service (which is healthy), ' +
              'the agent investigates that service first, reports it as healthy, still surfaces the ' +
              'genuinely degraded payment service, and renders the service-map attachment.',
            examples: [
              {
                input: {
                  question: BUTTON_PROMPT,
                  attachments: serviceMapContextAttachment({
                    highlightedServiceNames: ['frontend'],
                  }),
                },
                output: {
                  criteria: [
                    "Addresses the frontend service first because it is the user's highlighted focus",
                    'Reports that the frontend service is healthy — no active alerts, no SLO violations, no significant anomalies',
                    'Still identifies the payment service as the primary problem in the wider map (its degradation is the most significant issue even though it is not the highlighted service)',
                    'Does not invent alerts, SLO violations, or anomalies for the frontend service',
                    'Renders a service map attachment of the topology',
                    'Provides at least one concrete `/app/apm/` deep link',
                  ],
                  expectedTools: INVESTIGATION_TOOLS,
                },
                metadata: { expectedSkill: 'investigate-service-map' },
              },
            ],
          },
        });
      }
    );

    evaluate.afterAll(async ({ esClient, log }) => {
      log.debug('Cleaning up payment-unreachable data');
      await cleanObservabilityDataStreams(esClient, replayResult, log);
    });
  }
);
