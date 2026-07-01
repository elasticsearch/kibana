/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import type { EvaluationDataset } from '@kbn/evals';
import { selectEvaluators } from '@kbn/evals';
import { evaluate as base } from '../src/evaluate';
import type { WorkflowEditExample, WorkflowTaskOutput } from '../src/types';
import {
  createToolUsageEvaluator,
  createEditSuccessEvaluator,
  createValidationPassEvaluator,
  createNoErrorsEvaluator,
  createCriteriaEvaluator,
  createStructuralCorrectnessEvaluator,
  createEditPreservationEvaluator,
  createLiquidCorrectnessEvaluator,
  createEfficiencyEvaluator,
  createToolTrajectoryEvaluator,
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

const skip = <E extends WorkflowEditExample>(e: Parameters<typeof skipInfraErrors<E>>[0]) =>
  skipInfraErrors(skipNegativeCases(e));

const evaluate = base.extend<
  {
    evaluateEditDataset: (opts: {
      dataset: EvaluationDataset<WorkflowEditExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateEditDataset: [
    async ({ chatClient, evaluators, executorClient }, use) => {
      await use(async ({ dataset }) => {
        await executorClient.runExperiment(
          {
            datasets: [dataset],
            task: async ({ input }) => {
              const startMs = Date.now();
              const response = await chatClient.converse({
                messages: [{ message: input.instruction }],
                attachments: [
                  {
                    type: WORKFLOW_YAML_ATTACHMENT_TYPE,
                    data: { yaml: input.initialYaml },
                  },
                ],
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
          selectEvaluators<WorkflowEditExample, WorkflowTaskOutput>([
            skip(createNoErrorsEvaluator()),
            skip(skipCompositeMode(createEditSuccessEvaluator())),
            skip(createValidationPassEvaluator()),
            skip(skipCompositeMode(createToolUsageEvaluator())),
            skip(createStructuralCorrectnessEvaluator()),
            skip(createEditPreservationEvaluator()),
            liquid,
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
  'Workflow editing via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('inserts a new step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing: insert-step',
          description: 'Evaluate the ability to insert new steps into an existing workflow',
          examples: [
            {
              input: {
                instruction: 'Add a Slack notification at the end saying the data fetch is done',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'A new step was added to the workflow.',
                  'The new step sends a message indicating that the data fetch is done or complete.',
                ],
                expectedToolIds: ['platform.core.generate_workflow'],
                expectedStepCount: { min: 4, max: 4 },
                preservedStepNames: ['log_start', 'fetch_data', 'log_end'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'insert-step' },
            },
            {
              input: {
                instruction:
                  'Add a step between fetch_data and log_end that searches the logs-* index',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'A new Elasticsearch search step was added to the workflow.',
                  'The new step queries the "logs-*" index.',
                ],
                expectedStepCount: { min: 4, max: 4 },
                expectedStepTypes: ['elasticsearch.search'],
                preservedStepNames: ['log_start', 'fetch_data', 'log_end'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'insert-step' },
            },
          ],
        },
      });
    });

    evaluate('modifies an existing step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing: modify-step',
          description: 'Evaluate the ability to modify existing workflow steps',
          examples: [
            {
              input: {
                instruction: 'Switch fetch_data to POST and add a body with a test query',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The fetch_data step was modified.',
                  'The method is now POST.',
                  'The request body contains {"query": "test"} or equivalent.',
                ],
                expectedStepCount: 3,
                preservedStepNames: ['log_start', 'log_end'],
                expectedMaxToolCalls: 3,
              },
              metadata: { category: 'modify-step' },
            },
          ],
        },
      });
    });

    evaluate('deletes a step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing: delete-step',
          description: 'Evaluate the ability to delete steps from a workflow',
          examples: [
            {
              input: {
                instruction: 'Remove the log_end step from the workflow.',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The log_end step was removed from the workflow.',
                  'The remaining steps (log_start, fetch_data) are intact.',
                ],
                expectedToolIds: ['platform.core.generate_workflow'],
                expectedStepCount: 2,
                expectedStepNames: ['log_start', 'fetch_data'],
                preservedStepNames: ['log_start', 'fetch_data'],
                expectedMaxToolCalls: 2,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'delete-step' },
            },
          ],
        },
      });
    });

    evaluate('modifies a top-level property', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing: modify-property',
          description: 'Evaluate the ability to modify top-level workflow properties',
          examples: [
            {
              input: {
                instruction:
                  'Rename this workflow to "Data Processing Pipeline" and update the description to match',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The workflow name was changed to "Data Processing Pipeline".',
                  'The workflow description was updated accordingly.',
                ],
                expectedStepCount: 3,
                preservedStepNames: ['log_start', 'fetch_data', 'log_end'],
                expectedMaxToolCalls: 3,
                expectedToolSequence: [
                  'platform.core.generate_workflow',
                  'platform.core.generate_workflow',
                ],
              },
              metadata: { category: 'modify-property' },
            },
          ],
        },
      });
    });

    evaluate('performs multi-step edits', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing: multi-step-edits',
          description:
            'Evaluate the ability to perform multiple edits in a single conversation turn',
          examples: [
            {
              input: {
                instruction:
                  'Rename workflow to "Enhanced Pipeline", drop the log_end step, and add retries to fetch_data',
                initialYaml: baseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The workflow was renamed to "Enhanced Pipeline".',
                  'The log_end step was removed.',
                  'The fetch_data step has error handling with retry configured to 3 attempts.',
                ],
                expectedStepCount: 2,
                expectedStepNames: ['log_start', 'fetch_data'],
                preservedStepNames: ['log_start'],
                expectedMaxToolCalls: 5,
                expectedToolSequence: [
                  'platform.core.generate_workflow',
                  'platform.core.generate_workflow',
                ],
              },
              metadata: { category: 'multi-step' },
            },
          ],
        },
      });
    });
  }
);

const esBaseWorkflowYaml = `name: Data Indexing Pipeline
description: Indexes and searches data in Elasticsearch
enabled: true
triggers:
  - type: manual
steps:
  - name: create_index
    type: elasticsearch.indices.create
    with:
      index: "my-data-index"
      mappings:
        properties:
          name: { type: text }
          status: { type: keyword }
  - name: index_document
    type: elasticsearch.index
    with:
      index: "my-data-index"
      document:
        name: "Test Document"
        status: "active"
  - name: search_data
    type: elasticsearch.search
    with:
      index: "my-data-index"
      query:
        match_all: {}
  - name: log_results
    type: console
    with:
      message: "Found {{ steps.search_data.output.hits.total.value }} documents"
`;

evaluate.describe(
  'Elasticsearch workflow editing via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('modifies an Elasticsearch step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-es: modify-step',
          description: 'Evaluate the ability to modify Elasticsearch-specific workflow steps',
          examples: [
            {
              input: {
                instruction:
                  'Change search_data to only find documents where status is "active" instead of matching everything',
                initialYaml: esBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The search_data step query was changed from match_all to a term query.',
                  'The term query filters on the status field with value "active".',
                ],
                expectedStepCount: 4,
                preservedStepNames: ['create_index', 'index_document', 'log_results'],
                expectedMaxToolCalls: 3,
              },
              metadata: { category: 'modify-es-step' },
            },
          ],
        },
      });
    });

    evaluate('inserts an Elasticsearch step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-es: insert-step',
          description: 'Evaluate the ability to insert Elasticsearch-specific steps',
          examples: [
            {
              input: {
                instruction:
                  'Add an ES|QL step after search_data that counts active documents in my-data-index and logs the result',
                initialYaml: esBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'A new ES|QL query step was added after search_data.',
                  'The ES|QL query references the my-data-index index.',
                  'The query filters or aggregates data.',
                ],
                expectedToolIds: ['platform.core.generate_workflow'],
                expectedStepCount: { min: 5, max: 6 },
                expectedStepTypes: ['elasticsearch.esql.query'],
                preservedStepNames: ['create_index', 'index_document', 'search_data'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'insert-es-step' },
            },
          ],
        },
      });
    });

    evaluate('performs multi-step ES edits', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-es: multi-step-edits',
          description:
            'Evaluate the ability to perform multiple Elasticsearch-related edits at once',
          examples: [
            {
              input: {
                instruction:
                  'Rename the index to "production-data" everywhere, and add a check so the index only gets created if it doesn\'t already exist',
                initialYaml: esBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'All references to "my-data-index" were changed to "production-data".',
                  'The workflow ensures the index is only created if it does not already exist, either by adding an existence check step with conditional logic or by using an idempotent flag (such as ignore_if_exists) on the create step.',
                ],
                expectedStepCount: { min: 4, max: 7 },
                expectedMaxToolCalls: 6,
              },
              metadata: { category: 'multi-step-es' },
            },
          ],
        },
      });
    });
  }
);

const casesBaseWorkflowYaml = `name: Case Manager
description: Creates and manages cases
enabled: true
triggers:
  - type: manual
steps:
  - name: create_case
    type: cases.createCase
    with:
      title: "New Alert Case"
      description: "Auto-generated case for alert triage"
      severity: low
      owner: securitySolution
      tags:
        - automated
  - name: log_case_id
    type: console
    with:
      message: "Created case: {{ steps.create_case.output.case.id }}"
`;

evaluate.describe(
  'Cases workflow editing via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('modifies a cases step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-cases: modify-step',
          description: 'Evaluate the ability to modify cases workflow steps',
          examples: [
            {
              input: {
                instruction: 'Bump the case severity to high',
                initialYaml: casesBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The create_case step severity was changed from "low" to "high".',
                  'All other create_case properties remain unchanged.',
                ],
                expectedStepCount: 2,
                preservedStepNames: ['log_case_id'],
                expectedMaxToolCalls: 3,
              },
              metadata: { category: 'modify-cases-step' },
            },
          ],
        },
      });
    });

    evaluate('inserts a cases step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-cases: insert-step',
          description: 'Evaluate the ability to insert cases-specific steps',
          examples: [
            {
              input: {
                instruction:
                  "Add a comment to the case after it's created saying triage has started",
                initialYaml: casesBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'A step that adds a comment was added after create_case.',
                  'The step references the created case ID from the previous step output.',
                  'The comment text is "Initial triage started" or similar.',
                ],
                expectedToolIds: ['platform.core.generate_workflow'],
                expectedStepCount: 3,
                expectedStepTypes: ['kibana.addCaseComment'],
                preservedStepNames: ['create_case', 'log_case_id'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'insert-cases-step' },
            },
          ],
        },
      });
    });

    evaluate('performs multi-step cases edits', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-cases: multi-step-edits',
          description: 'Evaluate the ability to perform multiple cases-related edits at once',
          examples: [
            {
              input: {
                instruction:
                  "After the case is created, loop through a few triage comments and add each one to the case. Then update the case title to show it's been triaged.",
                initialYaml: casesBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'A foreach loop was added that iterates over a list of comments.',
                  'Inside the loop, a step adds each comment to the case.',
                  'A step that updates the case was added at the end.',
                  'The update step changes the case title.',
                ],
                expectedStepTypes: [
                  'cases.addComment|kibana.addCaseComment|kibana.request',
                  'cases.updateCase|cases.setTitle|kibana.updateCase|kibana.request',
                ],
                expectedStepCount: { min: 5, max: 7 },
                preservedStepNames: ['create_case'],
                expectedMaxToolCalls: 8,
                expectedToolSequence: [
                  'platform.core.generate_workflow',
                  'platform.core.generate_workflow',
                ],
              },
              metadata: { category: 'multi-step-cases' },
            },
          ],
        },
      });
    });
  }
);

const connectorBaseWorkflowYaml = `name: Alert Notifier
description: Sends notifications when alerts are detected
enabled: true
triggers:
  - type: manual
steps:
  - name: fetch_alerts
    type: http
    with:
      method: GET
      url: "https://api.example.com/alerts"
  - name: notify_slack
    type: slack
    connector-id: my-slack-connector
    with:
      message: "New alert detected"
  - name: log_done
    type: console
    with:
      message: "Notification sent"
`;

evaluate.describe(
  'Connector workflow editing via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('modifies a connector step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-connector: modify-step',
          description: 'Evaluate the ability to modify connector workflow steps',
          examples: [
            {
              input: {
                instruction: 'Update the Slack message to include how many alerts were found',
                initialYaml: connectorBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The notify_slack step message was updated.',
                  'The new message references data from the fetch_alerts step output.',
                ],
                expectedStepCount: 3,
                preservedStepNames: ['fetch_alerts', 'log_done'],
                expectedMaxToolCalls: 3,
              },
              metadata: { category: 'modify-connector-step' },
            },
          ],
        },
      });
    });

    evaluate('inserts a connector step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-connector: insert-step',
          description: 'Evaluate the ability to insert connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Add an email to oncall@example.com after the Slack step with an alert summary',
                initialYaml: connectorBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'An email step was added after the notify_slack step.',
                  'The email is sent to "oncall@example.com".',
                  'The email has a subject of "Alert Summary" or similar.',
                  'The message body references the alert data from a previous step.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedToolIds: ['platform.core.generate_workflow'],
                expectedStepCount: 4,
                preservedStepNames: ['fetch_alerts', 'notify_slack', 'log_done'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'insert-connector-step' },
            },
          ],
        },
      });
    });

    evaluate('replaces a connector step', async ({ evaluateEditDataset }) => {
      await evaluateEditDataset({
        dataset: {
          name: 'workflow-editing-connector: replace-step',
          description: 'Evaluate the ability to replace one connector step with another',
          examples: [
            {
              input: {
                instruction:
                  'Replace the Slack notification with an email to alerts@example.com instead, keep the same message',
                initialYaml: connectorBaseWorkflowYaml,
              },
              output: {
                criteria: [
                  'The notify_slack (slack) step was replaced with an email step.',
                  'The email is sent to "alerts@example.com".',
                  'The email subject is "New Alerts" or similar.',
                  'The notification message content is preserved.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepCount: 3,
                preservedStepNames: ['fetch_alerts', 'log_done'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'replace-connector-step' },
            },
          ],
        },
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Conditional indexing — "only index when fetch succeeded" requires an actual
// `if` that references the prior step's result, not just an empty no-op gate
// or a hard-coded `true`. Captured from a dogfood conversation where the
// agent flipped between step-level `if:` and an `if`-step-type, and the chosen
// KQL silently matched nothing.
// ---------------------------------------------------------------------------

const fetchAndIndexYaml = `version: '1'
name: Fetch and Index
description: Fetch records then write them to an index
enabled: true
tags:
  - test

triggers:
  - type: manual

steps:
  - name: fetch_records
    type: http
    with:
      method: GET
      url: "https://api.example.com/records"
  - name: index_records
    type: elasticsearch.index
    with:
      index: my-records
      document: "{{ steps.fetch_records.output.body }}"
`;

evaluate.describe(
  'Conditional gating: only act when the prior step actually produced data',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'index_records only runs when fetch_records succeeded',
      async ({ evaluateEditDataset }) => {
        await evaluateEditDataset({
          dataset: {
            name: 'workflow-editing: conditional-indexing-on-fetch-success',
            description:
              'A step-level `if:` referencing the prior step result — empty gates or hard-coded `true` should not pass.',
            examples: [
              {
                input: {
                  instruction:
                    'Only run the index_records step when the fetch_records step succeeded — if the API call failed or returned an empty body, skip indexing.',
                  initialYaml: fetchAndIndexYaml,
                },
                output: {
                  criteria: [
                    'The index_records step now has an `if:` (or equivalent conditional gating) that prevents it from running on a failed fetch.',
                    'The condition explicitly references the fetch_records step — either its status, error, output, or body — not a hard-coded literal like `true`, an empty string, or a constant Liquid expression that always resolves true.',
                    'The condition is correct: when fetch_records errors OR returns no/empty body, index_records is skipped; when fetch_records succeeds with a body, index_records runs.',
                    'The fetch_records step itself is preserved unchanged.',
                  ],
                  expectedStepCount: { min: 2, max: 4 },
                  preservedStepNames: ['fetch_records', 'index_records'],
                  expectedLiquidChains: [{ ref: 'steps.fetch_records', resolvesTo: 'step-output' }],
                  expectedMaxToolCalls: 4,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'conditional-edit' },
              },
            ],
          },
        });
      }
    );
  }
);
