/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Single-alert triage eval: exercises ALERT_ATTACHMENT_PROMPT via the Agent
 * Builder /converse endpoint with exactly one alert attachment.
 *
 * A single alert does NOT trigger summary mode (threshold >5 batches), so
 * expectedAttachmentReads is 0 and the attachment_read tool is not expected.
 *
 * The createSkillInvocationEvaluator trace check confirms that the
 * alert-analysis skill's SKILL.md was read during the session, ensuring the
 * trimmed prompt correctly delegates to the registered skill.
 */

import { tags } from '@kbn/scout';
import type { EsClient } from '@kbn/scout';
import {
  selectEvaluators,
  createSkillInvocationEvaluator,
  type DefaultEvaluators,
  type EvaluationDataset,
  type EvalsExecutorClient,
  type Example,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import { evaluate as base } from '../src/evaluate';
import { callConverse } from '../src/converse_task';
import { attachmentReadCompliance } from '../src/evaluators';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALERTS_INDEX = '.alerts-security.alerts-default';

const SINGLE_ALERT_ID = 'single-triage-eval-high-alert-001';

const SINGLE_ALERT_DOC = {
  '@timestamp': '2024-06-15T09:00:00.000Z',
  'kibana.alert.rule.name': 'Credential Dumping via LSASS Access',
  'kibana.alert.severity': 'high',
  'kibana.alert.risk_score': 73,
  'kibana.alert.uuid': SINGLE_ALERT_ID,
  'kibana.alert.workflow_status': 'open',
  'kibana.alert.rule.category': 'Custom Query',
  'kibana.alert.reason': 'Credential Dumping via LSASS Access triggered on workstation-finance-03',
  'host.name': 'workstation-finance-03',
  'user.name': 'carol.white',
  'threat.tactic.name': 'Credential Access',
  'threat.technique.name': 'OS Credential Dumping',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SingleAlertEvalExample extends Example {
  input: { question: string };
  output: { expected: string };
  metadata?: {
    attachments?: Array<{ type: string; data?: unknown }>;
    expectedAttachmentReads?: number;
  };
}

// ── Fixture factory ───────────────────────────────────────────────────────────

function createEvaluateSingleAlertTriage({
  fetch,
  connector,
  evaluators,
  executorClient,
  traceEsClient,
  log,
}: {
  fetch: HttpHandler;
  connector: { id: string };
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  traceEsClient: EsClient;
  log: ToolingLog;
}) {
  return async function evaluateSingleAlertTriage({
    dataset,
    criteria,
  }: {
    dataset: { name: string; description: string; examples: SingleAlertEvalExample[] };
    criteria: string[];
  }) {
    const selectedEvaluators = selectEvaluators([
      evaluators.criteria(criteria),
      attachmentReadCompliance,
      createSkillInvocationEvaluator({ traceEsClient, log, skillName: 'alert-analysis' }),
      ...Object.values(evaluators.traceBasedEvaluators),
    ]);

    await executorClient.runExperiment(
      {
        datasets: [
          {
            name: dataset.name,
            description: dataset.description,
            examples: dataset.examples,
          } satisfies EvaluationDataset,
        ],
        task: async ({ input, metadata }) => {
          const { attachments = [] } = metadata ?? {};
          return callConverse({
            fetch,
            connectorId: connector.id,
            question: input.question,
            attachments,
            log,
          });
        },
      },
      selectedEvaluators
    );
  };
}

// ── Evaluate fixture extension ─────────────────────────────────────────────────

type EvaluateSingleAlertTriage = ReturnType<typeof createEvaluateSingleAlertTriage>;

const evaluate = base.extend<{ evaluateSingleAlertTriage: EvaluateSingleAlertTriage }, {}>({
  evaluateSingleAlertTriage: [
    ({ fetch, connector, evaluators, executorClient, traceEsClient, log }, use) => {
      use(
        createEvaluateSingleAlertTriage({
          fetch,
          connector,
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

// ── Eval spec ─────────────────────────────────────────────────────────────────

evaluate.describe(
  'Security Alert Triage — single alert',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate.beforeAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      log.info(`Indexing single triage eval alert ${SINGLE_ALERT_ID} into ${ALERTS_INDEX}`);

      const response = await esClient.bulk({
        refresh: 'wait_for',
        operations: [{ index: { _index: ALERTS_INDEX, _id: SINGLE_ALERT_ID } }, SINGLE_ALERT_DOC],
      });

      if (response.errors) {
        const failed = response.items.filter((item) => item.index?.error);
        throw new Error(
          `Failed to set up single triage eval alert: ${JSON.stringify(
            failed.map((f) => f.index?.error)
          )}`
        );
      }

      log.info(`Successfully indexed single triage eval alert ${SINGLE_ALERT_ID}`);
    });

    evaluate.afterAll(async ({ esClient, log }: { esClient: EsClient; log: ToolingLog }) => {
      log.info(`Deleting single triage eval alert ${SINGLE_ALERT_ID}`);

      await esClient.deleteByQuery({
        index: ALERTS_INDEX,
        query: { ids: { values: [SINGLE_ALERT_ID] } },
      });
    });

    evaluate(
      'Single alert — markdown disposition recommendation invoking alert-analysis skill',
      async ({ evaluateSingleAlertTriage }) => {
        await evaluateSingleAlertTriage({
          dataset: {
            name: 'agent builder: security-alert-triage-single-alert',
            description:
              'Tests that the LLM produces a markdown-formatted triage for a single high-severity ' +
              'alert, includes a disposition recommendation (acknowledge, close, or escalate), ' +
              'references the rule name and entity names present in the alert, and does not ' +
              'hallucinate hostnames or usernames. Also verifies that the alert-analysis skill ' +
              'is invoked via the registered SKILL.md.',
            examples: [
              {
                input: {
                  question: 'Help me triage this alert and decide what to do with it.',
                },
                output: {
                  expected:
                    'The response should be formatted in markdown, include a disposition ' +
                    'recommendation (acknowledge, close, or escalate), mention the rule name ' +
                    '"Credential Dumping via LSASS Access", reference host workstation-finance-03 ' +
                    'or user carol.white, and not reference any host or user not in the alert.',
                },
                metadata: {
                  attachments: [
                    {
                      type: 'security.alerts',
                      data: { alertIds: [SINGLE_ALERT_ID] },
                    },
                  ],
                  expectedAttachmentReads: 0,
                },
              },
            ],
          },
          criteria: [
            'The response is formatted in markdown with headers or bullet points',
            'The response includes a disposition recommendation — one of: acknowledge, close, or escalate',
            'The response mentions the rule name "Credential Dumping via LSASS Access" from the alert data',
            'The response mentions at least one of the entity names present in the alert data (workstation-finance-03 or carol.white)',
            'The response does not reference any hostname or username that is not present in the attached alert data',
          ],
        });
      }
    );
  }
);
