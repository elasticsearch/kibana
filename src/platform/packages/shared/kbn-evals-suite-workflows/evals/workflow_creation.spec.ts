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
import type { WorkflowCreateExample, WorkflowTaskOutput } from '../src/types';
import {
  createEditSuccessEvaluator,
  createValidationPassEvaluator,
  createNoErrorsEvaluator,
  createRejectionEvaluator,
  createCriteriaEvaluator,
  createStructuralCorrectnessEvaluator,
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

const skip = <E extends WorkflowCreateExample>(e: Parameters<typeof skipInfraErrors<E>>[0]) =>
  skipInfraErrors(skipNegativeCases(e));

const skipTrajectory = <E extends WorkflowCreateExample>(
  e: Parameters<typeof skipInfraErrors<E>>[0]
) => skipInfraErrors(skipNegativeCases(skipCompositeMode(e)));

const liquid = skipInfraErrors(skipNegativeCases(createLiquidCorrectnessEvaluator()));

const evaluate = base.extend<
  {
    evaluateCreateDataset: (opts: {
      dataset: EvaluationDataset<WorkflowCreateExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateCreateDataset: [
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
            skipTrajectory(createEditSuccessEvaluator()),
            skip(createValidationPassEvaluator()),
            skip(createStructuralCorrectnessEvaluator()),
            liquid,
            skipTrajectory(createEfficiencyEvaluator()),
            skipTrajectory(createToolTrajectoryEvaluator()),
            skip(createLatencyEvaluator()),
            skipInfraErrors(createCriteriaEvaluator({ evaluators })),
            skipInfraErrors(createRejectionEvaluator()),
          ])
        );
      });
    },
    { scope: 'test' },
  ],
});

evaluate.describe(
  'Workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a simple workflow from scratch', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation: simple',
          description: 'Evaluate the ability to create simple workflows from natural language',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Health Check" workflow that pings https://api.example.com/health every 5 minutes',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Health Check".',
                  'The workflow has a scheduled trigger set to every 5 minutes.',
                  'The workflow contains a step that makes an HTTP GET request to https://api.example.com/health.',
                ],
                expectedStepCount: { min: 1, max: 2 },
                expectedStepTypes: ['http'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'simple-creation' },
            },
            {
              input: {
                instruction:
                  'Make a simple "Alert Logger" workflow, manual trigger, just logs "Alert received" to console',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Alert Logger".',
                  'The workflow has a manual trigger.',
                  'The workflow contains a console step that logs "Alert received".',
                ],
                expectedStepCount: 1,
                expectedStepTypes: ['console'],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'simple-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a workflow with conditional logic', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation: conditional',
          description: 'Evaluate the ability to create workflows with conditional branching',
          examples: [
            {
              input: {
                instruction:
                  'I need a "Conditional Router" workflow that checks https://api.example.com/status and logs whether the system is OK or degraded based on the response',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Conditional Router".',
                  'The workflow has a manual trigger.',
                  'There is an HTTP step that fetches a status endpoint.',
                  'There is a conditional (if) step that branches based on a health/status check.',
                  'One branch logs a success message and the other logs a degraded/failure message.',
                ],
                expectedStepTypes: ['http', 'console'],
                expectedStepCount: { min: 4, max: 5 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'conditional-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a workflow with a loop', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation: loop',
          description: 'Evaluate the ability to create workflows with foreach loops',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Batch Processor" workflow that loops over a list of items and logs each one to console, manual trigger',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Batch Processor".',
                  'The workflow has a manual trigger.',
                  'There is a step that defines or stores a list of items.',
                  'There is a loop that iterates over the items.',
                  'Inside the loop, each item is logged to the console.',
                ],
                expectedStepTypes: ['foreach', 'console'],
                expectedStepCount: { min: 2, max: 5 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'loop-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a workflow with error handling', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation: error-handling',
          description: 'Evaluate the ability to create workflows with error handling and retries',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Resilient Fetcher" workflow that fetches https://api.example.com/data every 10 minutes with retries, and logs a failure message if it still can\'t reach the endpoint',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Resilient Fetcher".',
                  'The workflow has a scheduled trigger set to every 10 minutes.',
                  'The HTTP step has on-failure retry configuration with 3 attempts.',
                  'The retry delay is set to 5 seconds.',
                  'There is a fallback step that logs a failure message.',
                ],
                expectedStepTypes: ['http'],
                expectedStepCount: { min: 1, max: 3 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'error-handling-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a multi-step workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation: multi-step',
          description: 'Evaluate the ability to create complex multi-step workflows',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Data Pipeline" workflow that fetches users from https://api.example.com/users, counts them, and logs the result. Should log start/end messages too. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Data Pipeline".',
                  'The workflow has a manual trigger.',
                  'There is a console step that logs a start message.',
                  'There is an HTTP step that fetches user data.',
                  'There is a step that stores or captures the user count.',
                  'There is a final console step that logs the count of processed users.',
                  'The steps are in a logical order.',
                ],
                expectedStepTypes: ['console', 'http', 'data.set'],
                expectedStepCount: 4,
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'multi-step-creation' },
            },
          ],
        },
      });
    });
  }
);

evaluate.describe(
  'Elasticsearch workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a workflow with Elasticsearch search', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-es: search',
          description: 'Evaluate the ability to create workflows with Elasticsearch search steps',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Error Log Monitor" workflow that searches logs-* for errors and prints how many were found. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Error Log Monitor".',
                  'The workflow has a manual trigger.',
                  'There is a step that searches the "logs-*" Elasticsearch index.',
                  'The search uses a term query filtering on level "error".',
                  'There is a console step that logs the number of hits.',
                ],
                expectedStepTypes: ['elasticsearch.search', 'console'],
                expectedStepCount: 2,
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'es-search-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a workflow with ES index management', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-es: index-management',
          description:
            'Evaluate the ability to create workflows with Elasticsearch index management steps',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Index Setup" workflow that creates an "app-data" index with fields for name, timestamp, and status if it doesn\'t already exist, then indexes a few sample documents. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Index Setup".',
                  'The workflow has a manual trigger.',
                  'There is a step that checks whether the "app-data" index exists.',
                  'There is conditional logic that creates the index only when it does not exist.',
                  'The index creation step defines mappings for name, timestamp, and status.',
                  'There is a bulk indexing step that indexes multiple documents.',
                ],
                expectedStepTypes: [
                  'elasticsearch.indices.exists',
                  'elasticsearch.indices.create',
                  'elasticsearch.bulk',
                ],
                expectedStepCount: { min: 4, max: 6 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'es-index-management-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a workflow with ES|QL', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-es: esql',
          description: 'Evaluate the ability to create workflows with ES|QL query steps',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Host CPU Report" workflow that runs every 10 minutes, gets average CPU usage from metrics-* grouped by host name using ES|QL, and prints the top results to console',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Host CPU Report".',
                  'The workflow has a scheduled trigger set to every 10 minutes.',
                  'There is a step that runs an ES|QL query.',
                  'The ES|QL query references the metrics-* index.',
                  'The query aggregates CPU usage by host and sorts/limits the results.',
                  'There is a console step that logs the results.',
                ],
                expectedStepTypes: ['elasticsearch.esql.query', 'console'],
                expectedStepCount: 2,
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'esql-creation' },
            },
          ],
        },
      });
    });
  }
);

evaluate.describe(
  'Cases workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a workflow with case management', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-cases: case-management',
          description:
            'Evaluate the ability to create workflows with case creation, comment addition, and case retrieval steps',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Incident Response" workflow with manual trigger that creates a high severity security case, adds an initial comment saying investigation has started, and then fetches the case back with its comments',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Incident Response".',
                  'The workflow has a manual trigger.',
                  'There is a step that creates a case (using cases.createCase, kibana.createCase, kibana.createCaseDefaultSpace, or kibana.request) with title "Security Incident" and severity "high".',
                  'There is a step that adds a comment to the created case.',
                  'The comment step references the case ID from the case creation step output.',
                  'There is a step that retrieves the case with include_comments (for example using cases.getCase or kibana.request).',
                ],
                expectedStepTypes: [
                  'kibana.createCase|cases.createCase|kibana.createCaseDefaultSpace',
                  'cases.addComment',
                  'cases.getCase',
                ],
                expectedStepCount: { min: 2, max: 4 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'cases-creation' },
            },
          ],
        },
      });
    });

    evaluate(
      'creates a workflow combining ES and cases steps',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-cases: es-and-cases',
            description:
              'Evaluate the ability to create workflows that combine Elasticsearch search with case creation',
            examples: [
              {
                input: {
                  instruction:
                    'Create a workflow that finds critical security alerts and creates a security case for each one, using the alert\'s rule name as the case title. Call it "Alert Case Creator", manual trigger.',
                },
                output: {
                  criteria: [
                    'A new workflow was created with the name "Alert Case Creator".',
                    'The workflow has a manual trigger.',
                    'There is a step that searches the ".alerts-security.alerts-default" Elasticsearch index.',
                    'The search uses a term query on severity "critical".',
                    'There is a foreach loop iterating over the search hits.',
                    'Inside the loop, a step creates a case for each alert (using cases.createCase, kibana.createCase, kibana.createCaseDefaultSpace, or kibana.request).',
                    'The case title is derived from the alert data.',
                  ],
                  expectedStepTypes: [
                    'elasticsearch.search',
                    'kibana.createCase|cases.createCase|kibana.createCaseDefaultSpace',
                  ],
                  expectedStepCount: { min: 3, max: 5 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-and-cases-creation' },
              },
            ],
          },
        });
      }
    );
  }
);

evaluate.describe(
  'Connector workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a Slack notification workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-connector: slack',
          description: 'Evaluate the ability to create workflows with Slack connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Create an "API Status Notifier" workflow that checks https://api.example.com/status every 5 minutes and posts the result to Slack',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "API Status Notifier".',
                  'The workflow has a scheduled trigger set to every 5 minutes.',
                  'There is an HTTP step that fetches the status endpoint.',
                  'There is a slack step that sends a message.',
                  'The Slack message references data from the HTTP step output.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepTypes: ['http', 'slack'],
                expectedStepCount: 2,
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'slack-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a multi-channel notification workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-connector: multi-channel',
          description: 'Evaluate the ability to create workflows with multiple connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Alert Broadcaster" workflow with manual trigger that logs a message, sends a Slack alert, and also emails oncall@example.com about the critical alert',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Alert Broadcaster".',
                  'The workflow has a manual trigger.',
                  'There is a console step that logs a message.',
                  'There is a slack step that sends a notification message.',
                  'There is an email step that sends to "oncall@example.com".',
                  'The email has a subject related to alerts.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepTypes: ['console', 'slack', 'email'],
                expectedStepCount: 3,
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'multi-channel-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a Jira ticket workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-connector: jira',
          description: 'Evaluate the ability to create workflows with Jira connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Bug Reporter" workflow that searches for recent error logs in Elasticsearch and files a Jira ticket with the error details. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Bug Reporter".',
                  'The workflow has a manual trigger.',
                  'There is a step that searches Elasticsearch for error logs.',
                  'There is a step that creates a Jira ticket.',
                  'The Jira ticket title references the error summary from the search results.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepTypes: [
                  'elasticsearch.search|elasticsearch.esql.query',
                  'jira|jira.pushToService',
                ],
                expectedStepCount: { min: 2, max: 4 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'jira-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a PagerDuty incident workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-connector: pagerduty',
          description: 'Evaluate the ability to create workflows with PagerDuty connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Critical Alert Pager" workflow that checks an API endpoint every minute and pages PagerDuty if the status is critical',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Critical Alert Pager".',
                  'The workflow has a scheduled trigger set to every minute.',
                  'There is a step that checks an API endpoint.',
                  'There is conditional logic that only triggers PagerDuty when the status is critical.',
                  'There is a PagerDuty step with severity "critical".',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepTypes: ['http', 'pagerduty'],
                expectedStepCount: { min: 2, max: 4 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'pagerduty-creation' },
            },
          ],
        },
      });
    });

    evaluate('creates a Teams notification workflow', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-connector: teams',
          description:
            'Evaluate the ability to create workflows with Microsoft Teams connector steps',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Deploy Notifier" workflow that sends a Teams message announcing a deployment with the timestamp. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Deploy Notifier".',
                  'The workflow has a manual trigger.',
                  'There is a Teams step that sends a deployment announcement message.',
                  'The message includes the current timestamp or a time reference.',
                  'Connector steps include a connector-id field (either a real connector ID or a descriptive placeholder).',
                ],
                expectedStepTypes: ['teams'],
                expectedStepCount: { min: 1, max: 2 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'teams-creation' },
            },
          ],
        },
      });
    });
  }
);

evaluate.describe(
  'Built-in step workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a workflow with a wait step', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-builtin: wait',
          description: 'Evaluate the ability to create workflows with wait/delay steps',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Delayed Cleanup" workflow that logs a start message, waits 30 seconds, then deletes the "temp-data" index. Manual trigger.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Delayed Cleanup".',
                  'The workflow has a manual trigger.',
                  'There is a console step that logs "Starting cleanup".',
                  'There is a wait step with a 30-second duration.',
                  'There is a step that deletes the "temp-data" Elasticsearch index.',
                  'The steps are in the correct order: log, wait, delete.',
                ],
                expectedStepTypes: ['console', 'wait'],
                expectedStepCount: { min: 3, max: 4 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'wait-creation' },
            },
          ],
        },
      });
    });

    evaluate(
      'creates a workflow with switch/branching logic',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-builtin: switch',
            description:
              'Evaluate the ability to create workflows with switch/branching based on input',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "Priority Router" workflow that routes alerts by priority -- PagerDuty for critical, Slack for high, console log for low. Manual trigger.',
                },
                output: {
                  criteria: [
                    'A new workflow was created with the name "Priority Router".',
                    'The workflow has a manual trigger.',
                    'There is branching or routing logic based on a priority value.',
                    'The "critical" branch triggers a PagerDuty alert or notification.',
                    'The "high" branch sends a Slack message.',
                    'The "low" branch logs to console.',
                  ],
                  expectedStepTypes: ['console'],
                  expectedStepCount: { min: 4, max: 8 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'switch-creation' },
              },
            ],
          },
        });
      }
    );
  }
);

evaluate.describe(
  'Additional Elasticsearch workflow creation via natural language',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('creates a workflow with index cleanup', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-es: index-cleanup',
          description:
            'Evaluate the ability to create workflows with index existence checks and deletion',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Index Cleaner" workflow that runs daily, checks if the "temp-logs" index exists, and deletes it if so. Log when done.',
              },
              output: {
                criteria: [
                  'A new workflow was created with the name "Index Cleaner".',
                  'The workflow has a scheduled trigger set to daily.',
                  'There is a step that checks whether the "temp-logs" index exists.',
                  'There is conditional logic that deletes the index only when it exists.',
                  'There is a console step that logs "Cleanup complete" or similar.',
                ],
                expectedStepTypes: ['console'],
                expectedStepCount: { min: 2, max: 4 },
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'es-index-cleanup-creation' },
            },
          ],
        },
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Frontier-model challenge cases: prompts that look like routine workflow
// asks but encode hidden cross-step constraints, const-reuse density, or
// failure-branch requirements that Sonnet/Opus/Gemini Pro reliably skip.
// Calibrated against the 0.84-0.87 Criteria ceiling observed post-hardening
// — these target the slack between "perfect-looking output" and "actually
// satisfies all the implicit requirements."
// ---------------------------------------------------------------------------

evaluate.describe(
  'Hidden-constraint creation: top-tier challenge cases',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'reuses a const value across at least three steps instead of re-declaring it',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: const-reuse-density',
            description:
              'Frontier models often inline values they should hoist into `consts:`. Case requires a single threshold const referenced from three different steps.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "Latency Watchdog" workflow that runs every 5 minutes, searches apm-* for transactions where duration.us is above 2000000, logs each slow transaction\'s id to console, and sends a Slack message that includes the same 2000000 threshold so on-call knows the alert criterion. Use the threshold value exactly once in the workflow definition.',
                },
                output: {
                  criteria: [
                    'The workflow has a scheduled trigger every 5 minutes.',
                    'A top-level `consts:` block declares a threshold constant (e.g. `slow_threshold_us`) with the value 2000000.',
                    'The elasticsearch.search step references the const via `{{ consts.<name> }}` in its range filter rather than inlining 2000000.',
                    'The Slack message references the same const via `{{ consts.<name> }}` rather than inlining the number, so changing the const changes both places.',
                    'The literal `2000000` appears at MOST once in the produced YAML — anywhere else, the const must be used.',
                    'The step type is elasticsearch.search (not elasticsearch.query, elasticsearch.find, or another fictional type).',
                  ],
                  expectedStepTypes: ['elasticsearch.search', 'slack'],
                  expectedStepCount: { min: 3, max: 5 },
                  expectedLiquidChains: [{ ref: 'consts.', resolvesTo: 'consts' }],
                  expectedMaxToolCalls: 5,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-const-reuse' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'threads data from step N into step N+2 (not the immediate next step)',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: hidden-cross-step-dataflow',
            description:
              'A "look up X, transform it in step 2, then USE step 1 again in step 3" shape. Models often hand off only the most recent output and forget to thread step 1 forward.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "User Enrichment" workflow on manual trigger that fetches a user record from https://api.example.com/user/123, then asks https://api.example.com/geocode for the lat/lng of that user\'s address field, then sends a Slack message saying "{name} ({email}) is located at {lat},{lng}" where name and email come from the FIRST API call and lat/lng come from the second.',
                },
                output: {
                  criteria: [
                    'There are two HTTP steps and one Slack step, in that order.',
                    "The second HTTP step's body or query references the address field of the first step's response (e.g. via `{{ steps.fetch_user.output.body.address }}`).",
                    "The Slack message references BOTH the first step's output (name and email) AND the second step's output (lat and lng) — not just the most recent step.",
                    'Specifically, `{{ steps.<first_step_name>.output...name }}` and `{{ steps.<first_step_name>.output...email }}` appear in the Slack message body.',
                    'Specifically, `{{ steps.<second_step_name>.output...lat }}` and `{{ steps.<second_step_name>.output...lng }}` also appear in the Slack message body.',
                    'No fictional step type — uses http and slack.postMessage.',
                  ],
                  expectedStepTypes: ['http', 'slack'],
                  expectedStepCount: { min: 3, max: 4 },
                  expectedMaxToolCalls: 5,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-cross-step-dataflow' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'foreach over a nested list with per-item conditional action',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: foreach-with-per-item-condition',
            description:
              'foreach + per-item if: gating. Models often emit the foreach correctly but skip the conditional, processing every item regardless of state.',
            examples: [
              {
                input: {
                  instruction:
                    'Create an "Alert Auto-Acknowledge" workflow triggered by alerts. It should loop over event.alerts and, for each alert whose severity is "low", send a Slack message to #noise saying it was auto-acknowledged. High and medium severity alerts should NOT trigger a Slack message in this workflow.',
                },
                output: {
                  criteria: [
                    'The workflow has an alert trigger.',
                    'There is a foreach step iterating over `event.alerts`.',
                    'Inside the foreach, there is a slack.postMessage step targeting #noise.',
                    'The Slack step is gated by an `if:` (or equivalent step-level condition) that explicitly references the current item\'s severity field — e.g. `{{ foreach.item.severity }} == "low"` or `kibana.alert.severity` from the iterated alert.',
                    "The condition resolves to TRUE only for low-severity items — not always-true, not based on event.* aggregate fields that don't exist on the per-item scope.",
                    'High/medium-severity items must not produce a Slack message — the if must EXCLUDE them, not include all severities.',
                  ],
                  expectedStepTypes: ['foreach', 'slack'],
                  expectedStepCount: { min: 1, max: 3 },
                  expectedLiquidChains: [
                    { ref: 'event.alerts', resolvesTo: 'event-field' },
                    { ref: 'foreach.item', resolvesTo: 'foreach-item' },
                  ],
                  expectedMaxToolCalls: 5,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-foreach-condition' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'required on-failure branch with diagnostic context',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: failure-branch-required',
            description:
              'When the prompt asks for "robust" or "fault-tolerant" behaviour, models often add `on-failure: continue` and call it done. We want explicit failure branching with diagnostic context — the kind of resilience that surfaces problems, not the kind that silences them.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "Robust Daily Export" workflow on a daily schedule that runs an esql.query exporting yesterday\'s events to an external archive via HTTP POST. If either the query OR the export fails, the workflow should NOT silently succeed — it should log the failure with which step failed and why (the error message), then page on-call via PagerDuty including that same diagnostic detail.',
                },
                output: {
                  criteria: [
                    "There is an esql.query step exporting the previous day's events.",
                    'There is an http step doing the POST export.',
                    "There is explicit failure handling — NOT just `on-failure: continue` everywhere. Either an `on-failure:` block that runs a logging + PagerDuty step, or an `if:`-gated branch that reads the prior step's status/error.",
                    "The failure branch references the failing step's name AND its error message in the diagnostic content — `{{ steps.<name>.error }}` or `{{ steps.<name>.error.message }}` appears in the Slack/log/PagerDuty payload.",
                    'The PagerDuty step receives the same diagnostic detail (not a generic "workflow failed" message).',
                    'The workflow does NOT report success on failure — the chosen `on-failure` semantics must surface the error, not swallow it.',
                  ],
                  expectedStepTypes: ['elasticsearch.esql.query', 'http', 'pagerduty'],
                  expectedStepCount: { min: 4, max: 8 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-failure-branch' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'deceptive tool choice: the obvious step type is wrong',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: deceptive-tool-choice',
            description:
              'Prompt phrasing suggests one obvious step type, but the connector for it does not exist and the right answer is a different step. Tests whether the agent actually checks the schema before committing.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a workflow that "searches the Kibana fleet agents for ones in unhealthy state and sends a summary email." Trigger is daily.',
                },
                output: {
                  criteria: [
                    'The workflow uses the elasticsearch.search step against the .fleet-agents index (or fleet-agents data stream) rather than inventing a fictional `fleet.searchAgents` or `kibana.getFleetAgents` step type.',
                    'The query filters on the agent\'s health/status field (e.g. last_checkin_status, status, local_metadata.health.status) — not on a hand-waved "unhealthy" tag that does not exist on the document.',
                    'The agent EITHER called get_step_definitions for the relevant step type before generating, OR avoided fictional types in the produced YAML.',
                    "There is an email step that summarizes the search hits, referencing the search step's output.",
                    'The workflow has a daily scheduled trigger.',
                    'No fictional step types — only elasticsearch.search, email, console, schedule trigger are permitted.',
                  ],
                  expectedStepTypes: ['elasticsearch.search', 'email'],
                  expectedStepCount: { min: 2, max: 4 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['get_step_definitions', 'platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-deceptive-tool-choice' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Second wave of frontier-challenge cases. Each one uses a weighted criterion
// (score: 3) on the single "load-bearing" check the case is actually
// measuring — so a frontier model that nails the surrounding plumbing but
// misses THE point lands at ~0.4 instead of 0.85. Authoring shape:
//
//   criteria: [
//     'easy criterion the model always passes',
//     { text: 'load-bearing criterion the case is about', score: 3 },
//   ]
//
// Aggregation is sum(pass_weights) / sum(all_weights), so a 3-weighted miss
// against three 1-weighted passes scores 3/6 = 0.5, then the existing -0.15
// near-perfect clip floors it lower.
// ---------------------------------------------------------------------------

evaluate.describe(
  'Hidden-constraint creation: weighted frontier-challenge cases (wave 2)',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'schedule trigger uses cron with explicit timezone, not naive interval',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: schedule-with-timezone',
            description:
              'Daily-at-time schedules are timezone-sensitive. Models default to UTC interval triggers that silently drift on DST or run at the wrong wall-clock time.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "Morning Report" workflow that runs every weekday at 9:00 AM Europe/Berlin time, runs an esql.query against logs-* to count error events from the prior business day, and emails the summary to ops@example.com. The 9 AM Berlin time must hold across DST transitions.',
                },
                output: {
                  criteria: [
                    'The workflow has an esql.query step against logs-*.',
                    'There is an email step to ops@example.com.',
                    {
                      text: 'The trigger uses a scheduled cron expression (not a fixed-interval `every: 24h`) AND explicitly sets the timezone to Europe/Berlin (e.g. timezone: Europe/Berlin), so 9 AM Berlin time is preserved across DST. A naive UTC schedule or an `every: 24h` interval does NOT pass.',
                      score: 3,
                    },
                    {
                      text: 'The cron expression matches Monday-through-Friday only (not seven-day) and fires at 09:00 local — e.g. `0 9 * * 1-5` or equivalent, NOT `0 9 * * *` and NOT `0 0 * * *`.',
                      score: 3,
                    },
                  ],
                  expectedStepTypes: ['elasticsearch.esql.query', 'email'],
                  expectedStepCount: { min: 2, max: 4 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-schedule-timezone' },
              },
            ],
          },
        });
      }
    );

    evaluate('paginated API fetch with loop-until-empty', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-hard: paginated-fetch',
          description:
            'Pagination requires a loop that keeps fetching while the API returns more pages. Models often issue one fetch and call it done.',
          examples: [
            {
              input: {
                instruction:
                  'Create an "Issue Sync" workflow on manual trigger that pulls ALL open issues from https://api.example.com/issues (the API paginates with ?page=N&per_page=100 and returns an empty array when there are no more pages) and indexes each issue into the issues-mirror index. Make sure no page is skipped and the loop terminates correctly.',
              },
              output: {
                criteria: [
                  'There is an HTTP step that fetches from https://api.example.com/issues.',
                  'There is an indexing step (elasticsearch.index or elasticsearch.bulk) targeting issues-mirror.',
                  {
                    text: 'The workflow loops or iterates pagination so multiple pages are fetched — i.e. NOT a single HTTP call with `?page=1` and stop. Acceptable shapes: a foreach over a pre-computed page list, OR a recursive/until-empty pattern via a loop step with an exit condition on the previous response being empty.',
                    score: 3,
                  },
                  {
                    text: 'The pagination is correct: page number increments on each iteration (uses `{{ foreach.index + 1 }}` or equivalent), and the loop terminates when the API returns no more issues — not an infinite loop, not a hard-coded "fetch 5 pages".',
                    score: 3,
                  },
                ],
                expectedStepTypes: ['http'],
                expectedStepCount: { min: 3, max: 8 },
                expectedLiquidChains: [{ ref: 'foreach.', resolvesTo: 'foreach-item' }],
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'hard-pagination' },
            },
          ],
        },
      });
    });

    evaluate(
      'idempotent indexing uses deterministic _id (or pre-check)',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: idempotent-indexing',
            description:
              'A workflow that has to be re-runnable without duplicating documents. Models default to elasticsearch.index without _id which gives a fresh autogenerated id every run.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "User Mirror" workflow that runs daily, fetches the user list from https://api.example.com/users, and indexes each user into the users-mirror index. The workflow will run every day so re-runs must NOT create duplicate documents for the same user — running it twice in a row should leave exactly one document per user, not two.',
                },
                output: {
                  criteria: [
                    'There is an HTTP step fetching users.',
                    'There is a foreach (or batch) step processing the fetched users.',
                    'There is an indexing step targeting users-mirror.',
                    {
                      text: 'The indexing step uses a deterministic id derived from the user record — e.g. `id: "{{ foreach.item.id }}"` or `id: "{{ foreach.item.email }}"`. An auto-generated id (no id field) does NOT pass: it would create a new document on each re-run. Alternatively, a pre-check via elasticsearch.search-by-id + skip-if-exists pattern is acceptable.',
                      score: 3,
                    },
                  ],
                  expectedStepTypes: ['http', 'foreach'],
                  expectedStepCount: { min: 3, max: 5 },
                  expectedLiquidChains: [{ ref: 'foreach.item', resolvesTo: 'foreach-item' }],
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-idempotency' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'nested Liquid with default fallback when upstream may be missing',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: nested-liquid-default',
            description:
              'When a step may return a missing field, the downstream consumer needs a `| default:` fallback or an `if:` guard. Models often plumb the field through naively and emit "Hello, {{ undefined }}" at runtime.',
            examples: [
              {
                input: {
                  instruction:
                    'Create a "User Greeting" workflow on manual trigger that fetches a user record from https://api.example.com/user/123 (the API may or may not include a `nickname` field) and sends a Slack message that greets the user by nickname if it is set, otherwise by their first name (also from the user record). Do NOT send an empty greeting if both happen to be missing — log a console warning instead.',
                },
                output: {
                  criteria: [
                    'There is an HTTP step fetching the user.',
                    'There is a Slack step that sends the greeting.',
                    {
                      text: 'The Slack message uses a Liquid `default:` filter chain or equivalent fallback — e.g. `{{ steps.fetch.output.body.nickname | default: steps.fetch.output.body.first_name }}` — so a missing nickname falls back to first_name rather than literally rendering "undefined" or an empty value.',
                      score: 3,
                    },
                    {
                      text: 'There is a guard (an `if:` step-level condition OR a final `default:` after first_name) that prevents an empty greeting from being sent when BOTH fields are missing. A console warning step is logged in that case.',
                      score: 3,
                    },
                  ],
                  expectedStepTypes: ['http', 'slack', 'console'],
                  expectedStepCount: { min: 3, max: 5 },
                  expectedMaxToolCalls: 5,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-liquid-default' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'multi-channel routing via switch / nested if on a single key',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: multi-channel-switch',
            description:
              'A switch over a single tag/severity field is the right shape — not a chain of overlapping if-blocks that can match multiple branches at once.',
            examples: [
              {
                input: {
                  instruction:
                    'Create an "Alert Router" workflow triggered by alerts that, based on the alert\'s priority (P1, P2, P3, or other), sends to PagerDuty for P1, Slack for P2, email for P3, and console-log only for anything else. An alert should land in EXACTLY ONE channel — never two — and an alert with no priority field should still log to console.',
                },
                output: {
                  criteria: [
                    'The workflow has an alert trigger.',
                    {
                      text: 'The routing is mutually exclusive — exactly one channel fires per alert. Acceptable shapes: a single `switch` step on priority, OR a chain of `if/else-if` steps where each branch excludes the prior ones. A list of independent `if:` blocks each checking equality is NOT acceptable (an alert with priority="P1" must not also trigger Slack/email/console).',
                      score: 3,
                    },
                    'There is a PagerDuty step gated to fire only for P1.',
                    'There is a Slack step gated to fire only for P2.',
                    'There is an email step gated to fire only for P3.',
                    {
                      text: 'The "other / missing priority" fallback hits the console step. Specifically, an alert with no priority field (priority is undefined) routes to console, not to nothing. This requires either an explicit `else` branch or a default switch case — not just three positive equality checks.',
                      score: 3,
                    },
                  ],
                  expectedStepTypes: ['pagerduty', 'slack', 'email', 'console'],
                  expectedStepCount: { min: 4, max: 8 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-multi-channel-switch' },
              },
            ],
          },
        });
      }
    );

    evaluate('esql-based dedup before insert', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-hard: esql-dedup-then-insert',
          description:
            'An esql.query step needs to actually FILTER the incoming records, not just SELECT them all. Models often emit `FROM ... | LIMIT 1` (or just FROM) and call it deduplication.',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Webhook Sink" workflow on manual trigger that receives an event payload via HTTP, checks the events-archive index with an esql.query to see if an event with the same correlation_id already exists there, and only indexes the new event if it does NOT. If a match is found, log "duplicate, skipping" to console instead.',
              },
              output: {
                criteria: [
                  'There is an HTTP step receiving the payload.',
                  'There is an esql.query step against events-archive.',
                  {
                    text: 'The esql.query actually filters on correlation_id from the incoming payload via Liquid — e.g. `FROM events-archive | WHERE correlation_id == "{{ steps.<receive>.output.body.correlation_id }}" | STATS count = COUNT(*)`. A query that just selects everything (`FROM events-archive`) or selects without filtering on correlation_id does NOT pass.',
                    score: 3,
                  },
                  {
                    text: 'There is an `if:` gate (on a subsequent step) that branches on the query result: insert when the count is 0, log a "duplicate" console message when the count is > 0. Both branches must be present and the conditions must be mutually exclusive.',
                    score: 3,
                  },
                  'The insert path uses elasticsearch.index targeting events-archive.',
                ],
                expectedStepTypes: [
                  'http',
                  'elasticsearch.esql.query',
                  'elasticsearch.index',
                  'console',
                ],
                expectedStepCount: { min: 4, max: 7 },
                expectedLiquidChains: [{ ref: 'steps.', resolvesTo: 'step-output' }],
                expectedMaxToolCalls: 6,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'hard-esql-dedup' },
            },
          ],
        },
      });
    });

    evaluate(
      'alert trigger field-name precision (kibana.alert.* vs alert.*)',
      async ({ evaluateCreateDataset }) => {
        await evaluateCreateDataset({
          dataset: {
            name: 'workflow-creation-hard: alert-field-name-precision',
            description:
              'In an alert-triggered workflow, the alert document fields are namespaced `kibana.alert.*` (not `alert.*` and not `event.alerts.<n>.alert.*`). Models pattern-match the wrong shape and the Liquid refs resolve to nothing at runtime.',
            examples: [
              {
                input: {
                  instruction:
                    'Create an "Alert Acknowledge" workflow triggered by Elastic Security alerts. When the alert fires, look up the alert\'s rule name, severity, and reason fields, and send a Slack message that includes all three. The Slack message must use the actual field names from the alert document, not made-up paths.',
                },
                output: {
                  criteria: [
                    'The workflow has an alert trigger.',
                    'There is a Slack step that sends the acknowledgment.',
                    {
                      text: 'The Slack message references the alert fields using the correct `kibana.alert.*` namespace via `{{ event.kibana.alert.rule.name }}` (or the equivalent path on the alert document) — NOT `{{ alert.rule.name }}`, NOT `{{ event.alert.rule.name }}`, NOT `{{ event.rule.name }}`. The rule_name field is at `kibana.alert.rule.name` (or `kibana.alert.rule.parameters.name`).',
                      score: 3,
                    },
                    {
                      text: 'The severity is referenced via `kibana.alert.severity` (NOT plain `severity`, NOT `event.severity`).',
                      score: 2,
                    },
                    {
                      text: 'The reason is referenced via `kibana.alert.reason` (NOT plain `reason`, NOT `event.reason`).',
                      score: 2,
                    },
                  ],
                  expectedStepTypes: ['slack'],
                  expectedStepCount: { min: 1, max: 3 },
                  expectedLiquidChains: [{ ref: 'kibana.alert', resolvesTo: 'event-field' }],
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'hard-alert-field-precision' },
              },
            ],
          },
        });
      }
    );

    evaluate('foreach iterator path read from a const', async ({ evaluateCreateDataset }) => {
      await evaluateCreateDataset({
        dataset: {
          name: 'workflow-creation-hard: foreach-iterator-from-const',
          description:
            'A foreach whose iterator collection is declared in `consts:` so changing the const swaps the loop input. Models inline the literal array into foreach instead.',
          examples: [
            {
              input: {
                instruction:
                  'Create a "Region Healthcheck" workflow on a 10-minute schedule that pings the /health endpoint on a list of regions: us-east, us-west, eu-west, ap-south. Each region\'s endpoint is `https://{region}.api.example.com/health`. Use a configurable region list — declared once at the top of the workflow — so adding/removing regions is a single-line change. Log the result per region to console.',
              },
              output: {
                criteria: [
                  'The workflow has a scheduled trigger every 10 minutes.',
                  {
                    text: 'There is a top-level `consts:` block declaring the region list (e.g. `consts: { regions: [us-east, us-west, eu-west, ap-south] }`) — NOT a `data.set` step that builds the list at runtime, and NOT an inline array embedded directly in foreach.',
                    score: 3,
                  },
                  {
                    text: 'The foreach iterates via `{{ consts.regions }}` (or the equivalent const reference) — NOT `foreach: [us-east, us-west, ...]` with the literal list inlined.',
                    score: 3,
                  },
                  'The HTTP URL uses `{{ foreach.item }}` to construct the per-region endpoint.',
                  'There is a console step inside the loop logging the per-region result.',
                ],
                expectedStepTypes: ['foreach', 'http', 'console'],
                expectedStepCount: { min: 1, max: 3 },
                expectedLiquidChains: [
                  { ref: 'consts.regions', resolvesTo: 'consts' },
                  { ref: 'foreach.item', resolvesTo: 'foreach-item' },
                ],
                expectedMaxToolCalls: 5,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'hard-foreach-from-const' },
            },
          ],
        },
      });
    });
  }
);
