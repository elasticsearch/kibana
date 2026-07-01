/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Long-workflow creation evals (10–20+ steps).
 *
 * The current suite caps at 4 steps — far short of production workflows
 * (automated_triaging.yaml is ~15 steps; infosec_demo.yaml is 1,556 lines).
 * These examples exercise from-scratch generation at realistic scale.
 *
 * Prompts are written in production-realistic phrasing (how a SOC analyst or
 * platform engineer would actually ask), not pre-decomposed step lists.
 * This makes them genuinely stretching, not just longer versions of easy cases.
 *
 * Per security-team#17191.
 */

import { tags } from '@kbn/scout';
import type { EvaluationDataset } from '@kbn/evals';
import { selectEvaluators } from '@kbn/evals';
import { evaluate as base } from '../src/evaluate';
import type { WorkflowCreateExample, WorkflowTaskOutput } from '../src/types';
import {
  createEditSuccessEvaluator,
  createValidationPassEvaluator,
  createNoErrorsEvaluator,
  createCriteriaEvaluator,
  createStructuralCorrectnessEvaluator,
  createLiquidCorrectnessEvaluator,
  createLiquidPresenceEvaluator,
  createEfficiencyEvaluator,
  createToolTrajectoryEvaluator,
  createLatencyEvaluator,
  skipCompositeMode,
  skipInfraErrors,
  skipNegativeCases,
  extractResultYaml,
  extractYamlFromAttachments,
} from '../src/evaluators';

const skip = <E extends WorkflowCreateExample>(e: Parameters<typeof skipInfraErrors<E>>[0]) =>
  skipInfraErrors(skipNegativeCases(e));

const liquid = skipInfraErrors(skipNegativeCases(createLiquidCorrectnessEvaluator()));
const liquidPresence = skipInfraErrors(skipNegativeCases(createLiquidPresenceEvaluator()));

const evaluate = base.extend<
  {
    evaluateLongCreateDataset: (opts: {
      dataset: EvaluationDataset<WorkflowCreateExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateLongCreateDataset: [
    async ({ chatClient, evaluators, executorClient }, use) => {
      await use(async ({ dataset }) => {
        await executorClient.runExperiment(
          {
            datasets: [dataset],
            task: async ({ input }) => {
              const startMs = Date.now();
              const response = await chatClient.converse({
                messages: [{ message: input.instruction }],
              });
              const latencyMs = Date.now() - startMs;

              const taskOutput = {
                messages: response.messages,
                steps: response.steps,
                errors: response.errors,
              };

              let resultYaml = extractResultYaml(taskOutput);
              if (!resultYaml && response.conversationId) {
                const attachments = await chatClient.getConversationAttachments(
                  response.conversationId
                );
                resultYaml = extractYamlFromAttachments(attachments);
              }

              return {
                ...taskOutput,
                resultYaml,
                latencyMs,
              };
            },
          },
          selectEvaluators<WorkflowCreateExample, WorkflowTaskOutput>([
            skip(createNoErrorsEvaluator()),
            skip(skipCompositeMode(createEditSuccessEvaluator())),
            skip(createValidationPassEvaluator()),
            skip(createStructuralCorrectnessEvaluator()),
            liquid,
            liquidPresence,
            skip(skipCompositeMode(createEfficiencyEvaluator())),
            skip(skipCompositeMode(createToolTrajectoryEvaluator())),
            skip(createLatencyEvaluator()),
            skipInfraErrors(createCriteriaEvaluator({ evaluators })),
          ])
        );
      });
    },
    { scope: 'test' },
  ],
});

evaluate.describe(
  'Long workflow creation — scheduled data pipelines',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'creates a multi-source security metrics pipeline',
      async ({ evaluateLongCreateDataset }) => {
        await evaluateLongCreateDataset({
          dataset: {
            name: 'workflow-creation-long: multi-source-pipeline',
            description:
              'Evaluate creation of a 10–15-step scheduled pipeline: fetch from multiple HTTP sources, ' +
              'ES|QL aggregation, foreach transform, bulk index results, Slack summary.',
            examples: [
              {
                input: {
                  instruction:
                    'Set up a workflow that runs every hour and builds a security posture snapshot. ' +
                    'It should fetch the current open alert counts from three different API endpoints: ' +
                    'https://api.example.com/alerts/critical, /alerts/high, and /alerts/medium. ' +
                    'Then run an ES|QL query on metrics-security.* to get average response times grouped by rule category. ' +
                    'After that, loop over each alert severity bucket, build a summary document for each, and bulk-index them into a security-posture-snapshots index. ' +
                    'Finally, post a Slack message with the total open counts and top 3 slow rule categories.',
                },
                output: {
                  criteria: [
                    'The workflow has a scheduled trigger set to every 1 hour (cron or interval expression).',
                    'There are exactly three HTTP steps, one per severity endpoint (critical, high, medium).',
                    'There is an ES|QL step querying the metrics-security.* index, with both a STATS aggregation grouping by rule category AND a numeric percentile/avg over a response-time field.',
                    'The ES|QL output is sorted and limited so only the top 3 slow categories survive into downstream steps.',
                    'There is a foreach step iterating over severity buckets, and the bulk-indexed documents differ per iteration (severity-specific fields, not a single shared payload).',
                    'A bulk indexing step writes documents to the security-posture-snapshots index, with each document containing severity, count, and an @timestamp set to the workflow run time.',
                    'The Slack message body references at least three Liquid expressions across at least two distinct steps (one HTTP count and one ES|QL field).',
                    'Connector steps include a connector-id field.',
                    'There is no redundant HTTP wrapper around the ES|QL or bulk-index calls — the workflow uses the dedicated step types.',
                  ],
                  expectedStepCount: { min: 10, max: 14 },
                  expectedStepTypes: [
                    'http',
                    'elasticsearch.esql.query',
                    'foreach',
                    'elasticsearch.bulk',
                    'slack',
                  ],
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                  expectedLiquidChains: [
                    { ref: 'steps.critical_count.output', resolvesTo: 'step-output' },
                  ],
                },
                metadata: { category: 'long-creation' },
              },
            ],
          },
        });
      }
    );

    evaluate('creates a full incident response pipeline', async ({ evaluateLongCreateDataset }) => {
      await evaluateLongCreateDataset({
        dataset: {
          name: 'workflow-creation-long: full-incident-response',
          description:
            'Evaluate creation of a 14–20-step full incident response workflow: ' +
            'alert trigger, case creation, per-alert enrichment loop, conditional escalation, ' +
            'remediation action, cross-team notification, evidence preservation.',
          examples: [
            {
              input: {
                instruction:
                  'Our security team needs a full incident response workflow triggered by alerts. ' +
                  "Here's what it needs to do: " +
                  '1. Create a high-severity case immediately with the alert rule name and severity in the title. ' +
                  '2. For each alert in the batch, search the security alerts index for full details, then attach the alert to the case as a comment including the rule name and host. ' +
                  '3. Check if any alert is critical — if so, page the on-call team via PagerDuty with an incident summary. ' +
                  '4. Run an ES|QL query to find other recent alerts from the same hosts in the last 6 hours. ' +
                  '5. If related alerts are found, add them as a case comment. ' +
                  '6. Send a Slack message to #security-incidents with the case link, severity, and a brief summary. ' +
                  '7. Isolate the endpoint for any critical alert using the endpoint isolation API. ' +
                  '8. Log completion with the case ID. ' +
                  'Thread case IDs and alert IDs through Liquid between steps.',
              },
              output: {
                criteria: [
                  'The workflow uses an alert trigger.',
                  'A case is created immediately with alert data in the title (rule name, severity).',
                  'There is a foreach loop over the alerts in the batch.',
                  'Inside the loop, an Elasticsearch search fetches full alert details.',
                  'Each alert is attached to the case as a comment referencing the case ID from the case creation step.',
                  'There is a conditional step that checks for critical severity and triggers PagerDuty.',
                  'An ES|QL step queries for related alerts from the same hosts.',
                  'A conditional step adds related alerts as a case comment.',
                  'A Slack step sends a notification to a channel with the case summary.',
                  'An endpoint isolation step (kibana.request to the isolate API or equivalent) is present.',
                  'A console or logging step records completion.',
                  'Liquid expressions thread case IDs and alert IDs between steps (e.g. {{ steps.create_case.output.id }}).',
                ],
                expectedStepCount: { min: 14, max: 22 },
                expectedStepTypes: [
                  'kibana.createCase|cases.createCase|kibana.request',
                  'foreach',
                  'elasticsearch.search',
                  'if',
                  'pagerduty',
                  'elasticsearch.esql.query',
                  'slack',
                  'kibana.request',
                  'console',
                ],
                expectedMaxToolCalls: 10,
                expectedToolSequence: ['platform.core.generate_workflow'],
                expectedLiquidChains: [
                  { ref: 'event.alerts', resolvesTo: 'event-field' },
                  { ref: 'foreach.item', resolvesTo: 'foreach-item' },
                  { ref: 'steps.create_case.output.id', resolvesTo: 'step-output' },
                ],
              },
              metadata: { category: 'long-creation' },
            },
          ],
        },
      });
    });
  }
);
