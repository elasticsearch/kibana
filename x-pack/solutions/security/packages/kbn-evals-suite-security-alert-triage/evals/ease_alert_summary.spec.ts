/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * EASE alert summary eval: verifies the structural JSON contract of
 * ALERT_SUMMARY_SYSTEM_PROMPT via the actions/connector execute route.
 *
 * The EASE flyout silently falls back to raw text when JSON.parse fails,
 * dropping recommendedActions entirely. This eval catches any prompt change
 * that breaks the JSON contract before it reaches production.
 *
 * Uses a CODE-only evaluator — no LLM judge. The actions/connector execute
 * route does not emit a trace_id in the same shape as Agent Builder, so
 * traceBasedEvaluators are excluded.
 *
 * No Elasticsearch fixture insertion is needed — the alert context is passed
 * as plain text in the message body, matching how the EASE flyout constructs
 * its request.
 */

import { tags } from '@kbn/scout';
import {
  selectEvaluators,
  type EvaluationDataset,
  type EvalsExecutorClient,
  type Example,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import { evaluate as base } from '../src/evaluate';
import { callEaseSummary } from '../src/ease_summary_task';

// ── CODE evaluator ────────────────────────────────────────────────────────────

const easeJsonCompliance = {
  name: 'EaseJsonCompliance',
  kind: 'CODE' as const,
  evaluate: async ({ output }: { output: unknown; metadata: unknown }) => {
    const rawResponse = (output as { rawResponse?: string })?.rawResponse ?? '';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResponse) as Record<string, unknown>;
    } catch (e) {
      return {
        score: 0,
        explanation: `Response is not valid JSON: ${(e as Error).message}`,
      };
    }

    if (typeof parsed.summary !== 'string' || parsed.summary.length === 0) {
      return {
        score: 0,
        explanation: `parsed.summary is missing or empty (got: ${JSON.stringify(parsed.summary)})`,
      };
    }

    if (typeof parsed.recommendedActions !== 'string' || parsed.recommendedActions.length === 0) {
      return {
        score: 0,
        explanation: `parsed.recommendedActions is missing or empty (got: ${JSON.stringify(
          parsed.recommendedActions
        )})`,
      };
    }

    return { score: 1 };
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface EaseSummaryExample extends Example {
  input: { alertContext: string };
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ── Fixture factory ───────────────────────────────────────────────────────────

function createEvaluateEaseSummary({
  fetch,
  connector,
  executorClient,
  log,
}: {
  fetch: HttpHandler;
  connector: { id: string };
  executorClient: EvalsExecutorClient;
  log: ToolingLog;
}) {
  return async function evaluateEaseSummary({
    dataset,
  }: {
    dataset: { name: string; description: string; examples: EaseSummaryExample[] };
  }) {
    const selectedEvaluators = selectEvaluators([easeJsonCompliance]);

    await executorClient.runExperiment(
      {
        datasets: [
          {
            name: dataset.name,
            description: dataset.description,
            examples: dataset.examples,
          } satisfies EvaluationDataset,
        ],
        task: async ({ input }) => {
          return callEaseSummary({
            fetch,
            connectorId: connector.id,
            alertContext: (input as EaseSummaryExample['input']).alertContext,
            log,
          });
        },
      },
      selectedEvaluators
    );
  };
}

// ── Evaluate fixture extension ─────────────────────────────────────────────────

type EvaluateEaseSummary = ReturnType<typeof createEvaluateEaseSummary>;

const evaluate = base.extend<{ evaluateEaseSummary: EvaluateEaseSummary }, {}>({
  evaluateEaseSummary: [
    ({ fetch, connector, executorClient, log }, use) => {
      use(createEvaluateEaseSummary({ fetch, connector, executorClient, log }));
    },
    { scope: 'test' },
  ],
});

// ── Eval spec ─────────────────────────────────────────────────────────────────

evaluate.describe(
  'EASE Alert Summary — JSON contract',
  { tag: [...tags.serverless.security.ease] },
  () => {
    evaluate(
      'EASE alert summary — response is parseable JSON with non-empty summary and recommendedActions',
      async ({ evaluateEaseSummary }) => {
        await evaluateEaseSummary({
          dataset: {
            name: 'ease: alert-summary-json-contract',
            description:
              'Tests that ALERT_SUMMARY_SYSTEM_PROMPT returns parseable JSON with non-empty ' +
              'summary and recommendedActions keys. Exercises the actions/connector execute ' +
              'route with EASE prompt IDs, catching silent JSON.parse failures in the flyout.',
            examples: [
              {
                input: {
                  alertContext:
                    'Rule: Credential Dumping via LSASS Access\n' +
                    'Severity: high\n' +
                    'Host: workstation-finance-03\n' +
                    'Reason: Suspicious access to LSASS memory detected, indicating potential credential theft.',
                },
              },
            ],
          },
        });
      }
    );
  }
);
