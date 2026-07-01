/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Multi-turn workflow editing evals.
 *
 * The existing suite is single-turn: each example sends one instruction and
 * scores the final YAML. Production users iterate ("add retries", "swap the
 * condition", "actually rename that step") — these examples capture that
 * conversational behavior.
 *
 * Each example sends a sequence of user turns inside one conversation, threading
 * the server-side conversationId between turns via chatClient.converseMultiTurn.
 * Evaluators run on the *final* YAML.
 *
 * Per security-team#17191.
 */

import { tags } from '@kbn/scout';
import type { EvaluationDataset } from '@kbn/evals';
import { selectEvaluators } from '@kbn/evals';
import { evaluate as base } from '../src/evaluate';
import type { MultiTurnWorkflowEditExample, WorkflowTaskOutput } from '../src/types';
import {
  createEditSuccessEvaluator,
  createValidationPassEvaluator,
  createNoErrorsEvaluator,
  createCriteriaEvaluator,
  createStructuralCorrectnessEvaluator,
  createEditPreservationEvaluator,
  createLiquidCorrectnessEvaluator,
  createEfficiencyEvaluator,
  createLatencyEvaluator,
  skipCompositeMode,
  skipInfraErrors,
  skipNegativeCases,
  extractResultYaml,
  extractYamlFromAttachments,
} from '../src/evaluators';

const liquid = skipInfraErrors(skipNegativeCases(createLiquidCorrectnessEvaluator()));

const WORKFLOW_YAML_ATTACHMENT_TYPE = 'workflow.yaml';

const baseWorkflowYaml = `version: '1'
name: Test Workflow
description: A workflow for testing edits
enabled: true
tags:
  - test

triggers:
  - type: manual

steps:
  - name: log_start
    type: console
    with:
      message: "Workflow started"
  - name: fetch_data
    type: http
    with:
      method: GET
      url: "https://api.example.com/data"
  - name: log_end
    type: console
    with:
      message: "Workflow completed"
`;

const skip = <E extends MultiTurnWorkflowEditExample>(
  e: Parameters<typeof skipInfraErrors<E>>[0]
) => skipInfraErrors(skipNegativeCases(e));

const evaluate = base.extend<
  {
    evaluateMultiTurnEditDataset: (opts: {
      dataset: EvaluationDataset<MultiTurnWorkflowEditExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateMultiTurnEditDataset: [
    async ({ chatClient, evaluators, executorClient }, use) => {
      await use(async ({ dataset }) => {
        await executorClient.runExperiment(
          {
            datasets: [dataset],
            task: async ({ input }) => {
              const startMs = Date.now();
              const response = await chatClient.converseMultiTurn({
                turns: input.turns.map((turn, idx) => ({
                  message: turn.instruction,
                  // Only attach the initial YAML on the first turn; subsequent
                  // turns rely on server-side conversation history.
                  ...(idx === 0
                    ? {
                        attachments: [
                          {
                            type: WORKFLOW_YAML_ATTACHMENT_TYPE,
                            data: { yaml: input.initialYaml },
                          },
                        ],
                      }
                    : {}),
                })),
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
          selectEvaluators<MultiTurnWorkflowEditExample, WorkflowTaskOutput>([
            skip(createNoErrorsEvaluator()),
            skip(skipCompositeMode(createEditSuccessEvaluator())),
            skip(createValidationPassEvaluator()),
            skip(createStructuralCorrectnessEvaluator()),
            skip(createEditPreservationEvaluator()),
            liquid,
            skip(skipCompositeMode(createEfficiencyEvaluator())),
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
  'Multi-turn workflow editing',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('three-turn scaffold → add → revisit', async ({ evaluateMultiTurnEditDataset }) => {
      await evaluateMultiTurnEditDataset({
        dataset: {
          name: 'workflow-editing-multiturn: three-turn',
          description:
            'Three-turn conversation where turn 3 IMPLICITLY contradicts turn 2 — the user ' +
            'never says "drop the time filter", but the new request is incompatible with ' +
            'the 24-hour window from turn 2. Tests whether the agent notices and rebuilds.',
          examples: [
            {
              input: {
                initialYaml: baseWorkflowYaml,
                turns: [
                  {
                    instruction:
                      'Add a new Elasticsearch search step between fetch_data and log_end that queries the logs-* index.',
                  },
                  {
                    instruction:
                      'Make that search only return documents from the last 24 hours where level is error.',
                  },
                  {
                    instruction:
                      "We're investigating a regression that started about three weeks ago. Make sure the search covers that whole window so we can see the errors leading up to today.",
                  },
                ],
              },
              output: {
                criteria: [
                  'A single elasticsearch.search step exists between fetch_data and log_end (no duplicate search steps were created in turn 3).',
                  'The search queries the logs-* index.',
                  'The query filters for level: error (the turn-2 filter was preserved).',
                  'The time range now covers roughly the last three weeks (e.g. now-21d, now-3w, or an explicit start ~21 days ago); it is NOT still 24h and NOT unbounded.',
                  'The time range is bounded — there is both a lower bound (~21 days ago) AND an upper bound (now/today); it is NOT an open-ended gte query.',
                  'The agent acknowledged in chat that the new time window REPLACES the prior 24-hour filter (it must explain it noticed the conflict between turn 2 and turn 3, not silently overwrite).',
                  'The agent did NOT add a new step in turn 3 — the existing search step was modified in place.',
                  'No reference to the old 24h literal remains anywhere in the workflow (no leftover comment, no commented-out clause, no consts.window = 24h).',
                ],
                expectedStepCount: 4,
                expectedStepTypes: ['elasticsearch.search'],
                preservedStepNames: ['log_start', 'fetch_data', 'log_end'],
                expectedMaxToolCalls: 4,
              },
              metadata: { category: 'multi-turn-three-turn' },
            },
          ],
        },
      });
    });

    evaluate(
      'mixed insert / delete / modify across turns',
      async ({ evaluateMultiTurnEditDataset }) => {
        await evaluateMultiTurnEditDataset({
          dataset: {
            name: 'workflow-editing-multiturn: mixed-operations',
            description:
              'Five-turn conversation: insert + delete + modify, then a class-based cleanup, ' +
              'then a turn that reintroduces something previously deleted in a different ' +
              'position. Tests memory of earlier state + spatial reasoning across turns.',
            examples: [
              {
                input: {
                  initialYaml: baseWorkflowYaml,
                  turns: [
                    {
                      instruction:
                        'Add a console step at the very beginning that logs "Starting pipeline".',
                    },
                    { instruction: 'Drop the log_end step — we no longer need it.' },
                    {
                      instruction:
                        'Change fetch_data to use POST with an empty JSON body instead of GET.',
                    },
                    {
                      instruction:
                        "Actually the workflow's pretty chatty in our logs — strip out anything that's just logging to the console. Keep only the actual HTTP work.",
                    },
                    {
                      instruction:
                        'On second thought we DO need an audit trail — add back a console log at the end recording the HTTP response status, similar to what log_end used to do but with the new POST response.',
                    },
                  ],
                },
                output: {
                  criteria: [
                    'The final workflow contains exactly two steps.',
                    'The first step is the modified fetch_data (type http, method POST, with a JSON body).',
                    'The second step is a console step that runs AFTER fetch_data (not before, not in parallel) and logs the HTTP response status via a Liquid reference to steps.fetch_data.output.',
                    'No remnants of the original log_start step or the turn-1 "Starting pipeline" console step exist (those were removed in turn 4 and not reintroduced).',
                    "The new audit step references steps.fetch_data.output (not foreach.item, not a hardcoded string) — proving the agent threaded turn 3's POST output through to turn 5's logging.",
                  ],
                  expectedStepCount: { min: 2, max: 2 },
                  preservedStepNames: [],
                  expectedMaxToolCalls: 9,
                },
                metadata: { category: 'multi-turn-mixed' },
              },
            ],
          },
        });
      }
    );
  }
);
