/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Elasticsearch operation correctness evals.
 *
 * Two classes of hallucination are targeted:
 *
 * 1. Wrong parameters inside a correct step type:
 *    - elasticsearch.search with no query body (returns all docs silently)
 *    - Bulk insert with wrong body structure (missing action descriptors)
 *    - Delete or index with ID in body instead of URL path (no-op)
 *
 * 2. Invented step type names:
 *    - elasticsearch.bulk IS a real typed step (generated schema) — accept it alongside elasticsearch.request
 *    - elasticsearch.index IS a real typed step (generated schema, path params: index + id) — accept it alongside elasticsearch.request
 *    - elasticsearch.delete / elasticsearch.deleteDocument are NOT real — document deletion uses elasticsearch.request (DELETE) or elasticsearch.bulk
 *    - elasticsearch.put / elasticsearch.upsert are NOT real
 *
 * These failures are hard to catch without targeted evals because:
 *    - The YAML is syntactically valid and schema validation passes
 *    - The workflow runs without errors in many cases
 *    - Wrong behaviour only appears at runtime (wrong results, no-op deletes)
 *
 * Grounded against real production workflows in elastic/workflows:
 *    - data/getdocument.yaml          → elasticsearch.search with query.match
 *    - utilities/index-commits.yaml   → elasticsearch.request PUT /index/_doc/$id
 *    - security/response/ad-automated-triaging.yaml → foreach: event.alerts
 *    - security/response/case-workflow-prod.yaml    → deduplication via esql.query + if branch
 *
 * Each case has 3 examples chosen for maximum coverage: varied phrasings, indexes,
 * and domain contexts so a single lucky phrasing cannot carry the score.
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
  createEfficiencyEvaluator,
  createToolTrajectoryEvaluator,
  createLatencyEvaluator,
  skipInfraErrors,
  skipNegativeCases,
  extractResultYaml,
  extractYamlFromAttachments,
} from '../src/evaluators';

const skip = <E extends WorkflowCreateExample>(e: Parameters<typeof skipInfraErrors<E>>[0]) =>
  skipInfraErrors(skipNegativeCases(e));

const evaluate = base.extend<
  {
    evaluateEsOpsDataset: (opts: {
      dataset: EvaluationDataset<WorkflowCreateExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateEsOpsDataset: [
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
            skip(createEditSuccessEvaluator()),
            skip(createValidationPassEvaluator()),
            skip(createStructuralCorrectnessEvaluator()),
            skip(createEfficiencyEvaluator()),
            skip(createToolTrajectoryEvaluator()),
            skip(createLatencyEvaluator()),
            skipInfraErrors(createCriteriaEvaluator({ evaluators })),
          ])
        );
      });
    },
    { scope: 'test' },
  ],
});

// ---------------------------------------------------------------------------
// elasticsearch.search — query body must be present and specific
// ---------------------------------------------------------------------------

evaluate.describe(
  'ES search step correctness',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'search step includes a query with actual filter conditions',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-es-ops: search-with-query',
            description:
              'Model must include a query body in elasticsearch.search — omitting it returns all documents silently',
            examples: [
              {
                // Canonical: two filters (level + time range) on logs-*
                input: {
                  instruction:
                    'Create an "Error Monitor" workflow that runs every 10 minutes, searches logs-* for error-level log entries from the last hour, and prints how many were found.',
                },
                output: {
                  criteria: [
                    'There is an elasticsearch.search step targeting the logs-* index.',
                    'The search step has a query field containing actual filter conditions — it must NOT be missing and must NOT be just an empty object or match_all with no additional filters.',
                    'The query filters on a log level or severity field to select only error entries (e.g. term on log.level, level, or severity).',
                    'A time range filter is applied so only logs from the last hour are returned (e.g. range on @timestamp gte: now-1h).',
                    'A console step logs the number of hits from the search result.',
                    'The step type is elasticsearch.search — not a fictional type like elasticsearch.query or elasticsearch.find.',
                  ],
                  expectedStepTypes: ['elasticsearch.search', 'console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Different index (metrics-*) and numeric threshold query — not a term/level filter
                input: {
                  instruction:
                    'Set up an "Outage Detector" workflow on a 5-minute schedule that searches metrics-* for hosts with CPU above 90% in the last 10 minutes and logs the hostname of each one.',
                },
                output: {
                  criteria: [
                    'There is an elasticsearch.search step targeting the metrics-* index.',
                    'The search step has a query field with filter conditions — NOT missing and NOT an empty match_all.',
                    'The query filters on a CPU metric field with a threshold above 90.',
                    'A time range filter restricts results to the past 10 minutes.',
                    'A console step logs the result.',
                    'The step type is elasticsearch.search — not a fictional type like elasticsearch.query or elasticsearch.find.',
                  ],
                  expectedStepTypes: ['elasticsearch.search', 'console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Security domain: term query on a specific named field (not a range/level)
                input: {
                  instruction:
                    'Create a "Threat Indicator Scanner" workflow that runs every hour, searches logs-* for events where threat.indicator.type is domain, and logs how many were found in the last hour.',
                },
                output: {
                  criteria: [
                    'There is an elasticsearch.search step targeting the logs-* index.',
                    'The search step has a query field that filters on threat.indicator.type — NOT missing and NOT just match_all.',
                    'A time range filter restricts results to the past hour.',
                    'A console step logs the count.',
                    'The step type is elasticsearch.search — not a fictional type like elasticsearch.query or elasticsearch.find.',
                  ],
                  expectedStepTypes: ['elasticsearch.search', 'console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'search step uses term query to find a document by ID',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-es-ops: search-by-id',
            description:
              'Model must fetch a document by ID correctly — either via elasticsearch.search with a query, or elasticsearch.request GET to /<index>/_doc/{{ id }}',
            examples: [
              {
                // Canonical: explicit "document_id" input name
                input: {
                  instruction:
                    'Create a "Document Fetcher" workflow with manual trigger and an input called document_id. It should fetch the document with that ID from the my-records index and log the result.',
                },
                output: {
                  criteria: [
                    'There is a step that fetches a document from the my-records index using inputs.document_id.',
                    'The step is either: (a) elasticsearch.search with a query filtering on _id or a document ID field referencing inputs.document_id — the ID must NOT be a top-level parameter outside the query; or (b) elasticsearch.request GET to /my-records/_doc/{{ inputs.document_id }}.',
                    'A console step logs the result.',
                    'The step type is elasticsearch.search or elasticsearch.request — not a fictional type like elasticsearch.get or elasticsearch.getById.',
                  ],
                  expectedStepTypes: ['console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Different domain: users index, user_id
                input: {
                  instruction:
                    'Create a "User Profile Fetcher" workflow with a user_id input. It should retrieve the user document from the users index and log the user name.',
                },
                output: {
                  criteria: [
                    'There is a step that fetches a document from the users index using inputs.user_id.',
                    'The step is either: (a) elasticsearch.search with a query filtering on user_id referencing inputs.user_id — the ID must NOT be a top-level parameter outside the query; or (b) elasticsearch.request GET to /users/_doc/{{ inputs.user_id }}.',
                    'A console step logs a field from the result.',
                    'The step type is elasticsearch.search or elasticsearch.request — not a fictional type like elasticsearch.get or elasticsearch.getById.',
                  ],
                  expectedStepTypes: ['console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Non-"id" named key (product_code) — tests the pattern isn't just triggered by "id" suffix
                input: {
                  instruction:
                    'I need a workflow that looks up a product by its product_code input in the products-catalog index and logs the product details.',
                },
                output: {
                  criteria: [
                    'There is a step that fetches a document from the products-catalog index using inputs.product_code.',
                    'The step is either: (a) elasticsearch.search with a query filtering on product_code referencing inputs.product_code — the lookup value must be inside the query, NOT a top-level parameter; or (b) elasticsearch.request GET to /products-catalog/_doc/{{ inputs.product_code }}.',
                    'A console step logs the output.',
                    'The step type is elasticsearch.search or elasticsearch.request — not a fictional type like elasticsearch.get or elasticsearch.getById.',
                  ],
                  expectedStepTypes: ['console'],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Document indexing — ID must be in the path, not the body
// ---------------------------------------------------------------------------

evaluate.describe(
  'ES index/upsert step correctness',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'indexes a document with ID in the path not the body',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-es-ops: index-with-id-in-path',
            description:
              'When indexing a specific document by ID the ID must appear in the request path, not as a body field',
            examples: [
              {
                // Canonical: record_id + record_data
                input: {
                  instruction:
                    'Create a "Record Saver" workflow with manual trigger and inputs: record_id (string) and record_data (object). It should save the record_data into the my-records index using record_id as the document ID.',
                },
                output: {
                  criteria: [
                    'There is a step that writes a document to the my-records index.',
                    'The document ID (inputs.record_id) is provided as the id path parameter (for elasticsearch.index) or in the URL path like /my-records/_doc/{{ inputs.record_id }} (for elasticsearch.request) — NOT solely as a field inside the request body.',
                    'The body or document contains inputs.record_data.',
                    'The step uses an appropriate method: PUT for a specific ID or POST for auto-generated ID.',
                    'The step type is elasticsearch.index or elasticsearch.request — NOT a fictional type like elasticsearch.put or elasticsearch.upsert.',
                  ],
                  expectedStepCount: { min: 1, max: 2 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Non-id named key: config_key (tests that the pattern applies beyond "id" suffixes)
                input: {
                  instruction:
                    'Make a "Config Saver" workflow that accepts config_key and config_value inputs and writes the config to the app-configs index keyed by config_key.',
                },
                output: {
                  criteria: [
                    'There is a step that writes to the app-configs index.',
                    'The document ID (inputs.config_key) is provided as the id path parameter (for elasticsearch.index) or in the URL path (for elasticsearch.request) — NOT solely in the body.',
                    'The body contains inputs.config_value.',
                    'The HTTP method is PUT or POST.',
                    'The step type is elasticsearch.index or elasticsearch.request — NOT a fictional type like elasticsearch.put or elasticsearch.upsert.',
                  ],
                  expectedStepCount: { min: 1, max: 2 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Most non-standard naming: product_sku (not "id", not "key")
                input: {
                  instruction:
                    'I need a workflow that takes a product_sku input and saves product details (product_info input) to the catalog index with the SKU as the document ID.',
                },
                output: {
                  criteria: [
                    'There is a step that writes a document to the catalog index.',
                    'The document ID (inputs.product_sku) is provided as the id path parameter (for elasticsearch.index) or in the URL path (for elasticsearch.request) — NOT solely in the body.',
                    'The body contains inputs.product_info.',
                    'The HTTP method is PUT or POST.',
                    'The step type is elasticsearch.index or elasticsearch.request — NOT a fictional type like elasticsearch.put or elasticsearch.upsert.',
                  ],
                  expectedStepCount: { min: 1, max: 2 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Document deletion — ID must be in the path
// ---------------------------------------------------------------------------

evaluate.describe(
  'ES delete step correctness',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'delete step places document ID in the path not the body',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-es-ops: delete-id-in-path',
            description:
              'Document deletion requires the ID in the path — placing it only in the body is a no-op',
            examples: [
              {
                // Canonical: record_id + "Deleted" confirmation
                input: {
                  instruction:
                    'Create a "Record Deleter" workflow with manual trigger and an input called record_id. It should delete the document with that ID from the my-records index, then log "Deleted".',
                },
                output: {
                  criteria: [
                    'There is a step that deletes a document from the my-records index.',
                    'The document ID (inputs.record_id) appears in the request path — for example /my-records/_doc/{{ inputs.record_id }} — NOT only as a field in the request body.',
                    'The HTTP method used is DELETE.',
                    'A console step logs "Deleted" or similar after the deletion.',
                    'The step type is elasticsearch.request — NOT a fictional type like elasticsearch.delete or elasticsearch.deleteDocument.',
                  ],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Different domain + different confirmation message
                input: {
                  instruction:
                    'Build an "Order Canceller" workflow with a manual trigger. It takes an order_id input and deletes the matching document from the orders index, then logs "Cancelled".',
                },
                output: {
                  criteria: [
                    'There is a step that deletes a document from the orders index.',
                    'The document ID (inputs.order_id) appears in the request path — NOT only in the body.',
                    'The HTTP method is DELETE.',
                    'A console step logs "Cancelled" or similar.',
                    'The step type is elasticsearch.request — NOT a fictional type like elasticsearch.delete or elasticsearch.deleteDocument.',
                  ],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Non-id named key: config_key
                input: {
                  instruction:
                    'Make a "Stale Config Remover" workflow that takes a config_key input and deletes the config entry from the app-configs index, then logs "Removed".',
                },
                output: {
                  criteria: [
                    'There is a step that deletes a document from the app-configs index.',
                    'The document ID (inputs.config_key) appears in the request path — NOT only in the body.',
                    'The HTTP method is DELETE.',
                    'A console step logs "Removed" or similar.',
                    'The step type is elasticsearch.request — NOT a fictional type like elasticsearch.delete or elasticsearch.deleteDocument.',
                  ],
                  expectedStepCount: { min: 2, max: 3 },
                  expectedMaxToolCalls: 6,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Bulk insert — action+document pairs, not a flat array
// ---------------------------------------------------------------------------

evaluate.describe(
  'ES bulk insert correctness',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'bulk insert uses correct action+document structure',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-es-ops: bulk-insert-structure',
            description:
              'Bulk indexing requires alternating action + document lines — passing a flat array of documents is wrong',
            examples: [
              {
                // Canonical: fetch from API then bulk index
                input: {
                  instruction:
                    'Create a "Bulk Loader" workflow with manual trigger that fetches a list of records from https://api.example.com/records and indexes all of them into the my-records index in one bulk operation.',
                },
                output: {
                  criteria: [
                    'There is an HTTP step that fetches records from https://api.example.com/records.',
                    'There is a bulk indexing step that sends multiple documents to the my-records index.',
                    'If using elasticsearch.bulk, the documents are provided as a flat array under the operations field (the step handles NDJSON serialization automatically). If using elasticsearch.request, the body uses NDJSON action+document pairs — NOT a flat array of documents.',
                    'The bulk step uses the elasticsearch.bulk step type, or targets the _bulk endpoint with elasticsearch.request.',
                    'The documents come from the HTTP step output.',
                    'The step type is elasticsearch.bulk or elasticsearch.request — NOT a fictional type like elasticsearch.bulkInsert or elasticsearch.bulkIndex.',
                  ],
                  expectedStepTypes: ['http'],
                  expectedStepCount: { min: 2, max: 4 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Different domain: products index
                input: {
                  instruction:
                    'Create a "Product Sync" workflow that pulls product data from https://api.example.com/products and bulk-indexes it into the products index in one request.',
                },
                output: {
                  criteria: [
                    'There is an HTTP step fetching from https://api.example.com/products.',
                    'There is a bulk indexing step targeting the products index.',
                    'If using elasticsearch.bulk, the documents are provided as a flat array under the operations field (the step handles NDJSON serialization automatically). If using elasticsearch.request, the bulk body uses NDJSON action+document pairs — NOT a flat array of documents.',
                    'The bulk step uses the elasticsearch.bulk step type, or targets the _bulk endpoint with elasticsearch.request.',
                    'The step type is elasticsearch.bulk or elasticsearch.request — NOT a fictional type like elasticsearch.bulkInsert or elasticsearch.bulkIndex.',
                  ],
                  expectedStepTypes: ['http'],
                  expectedStepCount: { min: 2, max: 4 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
              {
                // Financial domain, casual phrasing ("bulk-inserts them")
                input: {
                  instruction:
                    'I need a workflow that retrieves a batch of transactions from https://api.example.com/transactions and bulk-inserts them into the transactions index.',
                },
                output: {
                  criteria: [
                    'There is an HTTP step fetching from https://api.example.com/transactions.',
                    'There is a bulk indexing step targeting the transactions index.',
                    'If using elasticsearch.bulk, the documents are provided as a flat array under the operations field (the step handles NDJSON serialization automatically). If using elasticsearch.request, the bulk body uses NDJSON action+document pairs — NOT a flat array of documents.',
                    'The bulk step uses the elasticsearch.bulk step type, or targets the _bulk endpoint with elasticsearch.request.',
                    'The step type is elasticsearch.bulk or elasticsearch.request — NOT a fictional type like elasticsearch.bulkInsert or elasticsearch.bulkIndex.',
                  ],
                  expectedStepTypes: ['http'],
                  expectedStepCount: { min: 2, max: 4 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'es-ops-correctness' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// event.rule.* — routing based on which rule fired, not alert severity
// ---------------------------------------------------------------------------

evaluate.describe(
  'Alert trigger: event.rule.* field usage',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('routes by rule owner using event.rule.consumer', async ({ evaluateEsOpsDataset }) => {
      await evaluateEsOpsDataset({
        dataset: {
          name: 'workflow-alert-rule: consumer-routing',
          description:
            'Routing by which team owns the rule requires event.rule.consumer — the model must not substitute alert severity',
          examples: [
            {
              // Canonical: Slack channel routing by consumer
              input: {
                instruction:
                  'Create a "Team Router" workflow triggered by alerts. If the rule belongs to the security team (consumer is "siem"), post to Slack channel #security-alerts. If it belongs to the observability team (consumer is "observability"), post to #ops-alerts instead.',
              },
              output: {
                criteria: [
                  'The trigger type is alert.',
                  'There is conditional logic that branches based on event.rule.consumer.',
                  'The "siem" branch sends a Slack message to #security-alerts or references that channel.',
                  'The "observability" branch sends a Slack message to #ops-alerts or references that channel.',
                  'The branching condition uses event.rule.consumer — NOT event.alerts[0].kibana.alert.severity or any other alert field.',
                ],
                expectedStepCount: { min: 2, max: 5 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'alert-rule-field-correctness' },
            },
            {
              // Different integration: Jira project routing
              input: {
                instruction:
                  'Create a workflow that posts to different Jira projects depending on which team owns the rule. If the rule consumer is "siem" create a ticket in the SEC project. If it is "observability" use the OPS project.',
              },
              output: {
                criteria: [
                  'The trigger type is alert.',
                  'There is conditional logic branching on event.rule.consumer.',
                  'The "siem" branch creates a Jira ticket in the SEC project.',
                  'The "observability" branch creates a Jira ticket in the OPS project.',
                  'The condition reads event.rule.consumer — NOT alert severity or any event.alerts field.',
                ],
                expectedStepCount: { min: 2, max: 5 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'alert-rule-field-correctness' },
            },
            {
              // Explicitly calls out the failure mode: "not based on alert severity"
              input: {
                instruction:
                  "I need a workflow that routes alerts to either #security or #platform Slack channels based on the rule's consumer field — not based on alert severity. Security rules go to #security, everything else goes to #platform.",
              },
              output: {
                criteria: [
                  'The trigger type is alert.',
                  'There is conditional logic branching on event.rule.consumer.',
                  'The security branch sends to #security.',
                  'The default or other branch sends to #platform.',
                  'The condition uses event.rule.consumer — NOT event.alerts[0].kibana.alert.severity or any severity field.',
                ],
                expectedStepCount: { min: 2, max: 5 },
                expectedMaxToolCalls: 8,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'alert-rule-field-correctness' },
            },
          ],
        },
      });
    });

    evaluate(
      'routes by rule type using event.rule.ruleTypeId',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-alert-rule: rule-type-routing',
            description:
              'Routing by detection rule type requires event.rule.ruleTypeId — the model must not use alert severity or rule name',
            examples: [
              {
                // Canonical 3-branch: thresholdRule→PagerDuty, ml→console, else→Slack
                input: {
                  instruction:
                    'Create a "Rule Type Router" workflow triggered by security alerts. Threshold rules (ruleTypeId is "siem.thresholdRule") are likely brute force — page PagerDuty immediately with critical severity. ML anomaly rules (ruleTypeId is "ml") may be false positives — just log them to console for manual review. All other rule types should send a Slack notification.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is conditional logic that reads event.rule.ruleTypeId to decide the action.',
                    'The "siem.thresholdRule" branch triggers a PagerDuty step.',
                    'The "ml" branch logs to console.',
                    'A default or else branch sends a Slack notification.',
                    'The branching condition uses event.rule.ruleTypeId — NOT alert severity, rule name, or any alert field.',
                  ],
                  expectedStepCount: { min: 3, max: 7 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-rule-field-correctness' },
              },
              {
                // Uses eqlRule — tests that the model knows a different ruleTypeId value
                input: {
                  instruction:
                    'Create a workflow that opens a critical case for EQL sequence rules (ruleTypeId "siem.eqlRule") because sequences indicate multi-stage attacks. For threshold rules just send a Slack message. For ML rules log to console.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is conditional logic reading event.rule.ruleTypeId.',
                    'The "siem.eqlRule" branch creates a case.',
                    'The threshold rule branch sends Slack.',
                    'The ML branch logs to console.',
                    'The branching uses event.rule.ruleTypeId — NOT alert severity or any event.alerts field.',
                  ],
                  expectedStepCount: { min: 3, max: 7 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-rule-field-correctness' },
              },
              {
                // Explicitly names the failure mode: "not on severity"
                input: {
                  instruction:
                    'I need an alert workflow that branches on what kind of detection rule triggered it — not on severity. Threshold rules should page PagerDuty, ML rules should log to console, and all others should send an email.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is conditional logic reading event.rule.ruleTypeId.',
                    'The threshold rule branch pages PagerDuty.',
                    'The ML rule branch logs to console.',
                    'A default branch sends an email.',
                    'The condition uses event.rule.ruleTypeId — NOT event.alerts[0].kibana.alert.severity or any severity field.',
                  ],
                  expectedStepCount: { min: 3, max: 7 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-rule-field-correctness' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Alert deduplication — search before create, add comment if case exists
// ---------------------------------------------------------------------------

evaluate.describe(
  'Alert deduplication: search before create',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'checks for an existing case before creating a new one',
      async ({ evaluateEsOpsDataset }) => {
        await evaluateEsOpsDataset({
          dataset: {
            name: 'workflow-alert-dedup: search-before-create',
            description:
              'Before creating a case the model must search for an existing open case for the same rule — creating unconditionally floods the case queue',
            examples: [
              {
                // Canonical: full description of both branches
                input: {
                  instruction:
                    'Create an "Alert Deduplicator" workflow triggered by security alerts. Before creating a case, search for an existing open case for this rule. If one already exists, add a comment to it instead of opening a new case. If no case exists, create a new one with the rule name as the title.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is a search step (elasticsearch.search or elasticsearch.esql.query) that looks for an existing open case — it must NOT be skipped.',
                    'The search targets a cases index (e.g. .cases-*, .kibana_alerting_cases*) and filters on open status.',
                    'There is conditional logic that branches on whether the search returned results.',
                    'The branch for an existing case adds a comment or attaches the alert to the existing case — it does NOT create a new case.',
                    'The branch for no existing case creates a new case using the rule name (event.rule.name or event.alerts[0].kibana.alert.rule.name) as the title.',
                    'The workflow does NOT unconditionally always create a new case.',
                  ],
                  expectedStepCount: { min: 3, max: 8 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-deduplication' },
              },
              {
                // "One case per rule" framing — different mental model, same correctness requirement
                input: {
                  instruction:
                    'Make an alert workflow that does smart case management — one case per rule. If the rule has fired before and there is already an open case for it, attach the new alert as a comment. If no open case exists, create a fresh one.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is a search step that looks for an existing open case before creating anything.',
                    'The search targets a cases index.',
                    'There is conditional logic branching on whether an existing case was found.',
                    'The existing-case branch attaches the alert as a comment — does NOT create a new case.',
                    'The no-case branch creates a new case.',
                    'The workflow does NOT unconditionally always create a new case.',
                  ],
                  expectedStepCount: { min: 3, max: 8 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-deduplication' },
              },
              {
                // Casual/non-technical phrasing — "prevents case flooding"
                input: {
                  instruction:
                    'I need a workflow that prevents case flooding. When a security alert fires, look up whether a case is already open for that rule. Skip creating a new case if one is found — just add a comment instead.',
                },
                output: {
                  criteria: [
                    'The trigger type is alert.',
                    'There is a search step that checks for an existing open case — executed before any case creation.',
                    'The search targets a cases index and filters on open/active status.',
                    'There is conditional logic on the search result.',
                    'When a case is found, a comment is added — no new case is created.',
                    'When no case is found, a new case is created.',
                    'The workflow does NOT unconditionally always create a new case.',
                  ],
                  expectedStepCount: { min: 3, max: 8 },
                  expectedMaxToolCalls: 8,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'alert-deduplication' },
              },
            ],
          },
        });
      }
    );
  }
);
