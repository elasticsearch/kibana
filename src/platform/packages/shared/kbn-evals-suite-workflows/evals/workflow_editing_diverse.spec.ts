/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Edit-fixture diversity evals.
 *
 * Every existing edit example starts from the same 18-line `baseWorkflowYaml`
 * (3 steps, manual trigger). That tells us nothing about how editing scales
 * to production-shaped inputs.
 *
 * These examples drive single-turn edits against the four seed baselines from
 * fixtures/seed_workflows.ts — sizes 5 → 15 steps, triggers manual / scheduled
 * / alert, foreach-heavy and conditional-heavy starting points.
 *
 * Per security-team#17191.
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
import {
  automatedTriagingYaml,
  infosecAlertTriageYaml,
  infosecIndexBackfillYaml,
  infosecSlackEnrichmentYaml,
} from '../src/fixtures/seed_workflows';

const WORKFLOW_YAML_ATTACHMENT_TYPE = 'workflow.yaml';

const skip = <E extends WorkflowEditExample>(e: Parameters<typeof skipInfraErrors<E>>[0]) =>
  skipInfraErrors(skipNegativeCases(e));

const liquid = skipInfraErrors(skipNegativeCases(createLiquidCorrectnessEvaluator()));
const liquidPresence = skipInfraErrors(skipNegativeCases(createLiquidPresenceEvaluator()));

const evaluate = base.extend<
  {
    evaluateDiverseEditDataset: (opts: {
      dataset: EvaluationDataset<WorkflowEditExample>;
    }) => Promise<void>;
  },
  {}
>({
  evaluateDiverseEditDataset: [
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

// ---------------------------------------------------------------------------
// Edits on automated_triaging.yaml (~15 steps, alert trigger, nested foreach)
// ---------------------------------------------------------------------------

evaluate.describe(
  'Diverse edits on automated_triaging baseline (15 steps, alert trigger)',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'removes both host-isolation and AI-summary steps without breaking downstream Liquid',
      async ({ evaluateDiverseEditDataset }) => {
        await evaluateDiverseEditDataset({
          dataset: {
            name: 'workflow-editing-diverse: triaging-remove-isolation',
            description:
              'Delete two non-adjacent steps from a 15-step nested workflow. ' +
              'Tests multi-step removal AND that any downstream Liquid references ' +
              'to the removed steps are also fixed up, not left dangling.',
            examples: [
              {
                input: {
                  initialYaml: automatedTriagingYaml,
                  instruction:
                    "Drop two things: (1) the endpoint isolation step — we don't want auto-isolation without manual review; and (2) the AI summary step — the model output is too unreliable. Anything that referenced those steps elsewhere should be cleaned up too.",
                },
                output: {
                  criteria: [
                    'The isolate_host step has been removed.',
                    'The ai_summary step has been removed.',
                    'No remaining step contains a Liquid reference to steps.isolate_host.* or steps.ai_summary.*.',
                    'Any case-comment step that previously embedded the AI summary has been either removed OR rewritten so it no longer references ai_summary output.',
                    'All other top-level and nested steps (for_each_discovery, create_case, foreach_alert_in_ad, get_details, add_to_case) are preserved byte-identically.',
                    'The trigger type is still alert.',
                    'No new steps were introduced as a side effect of the removals.',
                  ],
                  preservedStepNames: [
                    'for_each_discovery',
                    'create_case',
                    'foreach_alert_in_ad',
                    'get_details',
                    'add_to_case',
                  ],
                  expectedMaxToolCalls: 3,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'diverse-edit-delete' },
              },
            ],
          },
        });
      }
    );

    evaluate(
      'modifies a deeply nested step in the foreach',
      async ({ evaluateDiverseEditDataset }) => {
        await evaluateDiverseEditDataset({
          dataset: {
            name: 'workflow-editing-diverse: triaging-modify-nested',
            description: 'Modify a specific deeply-nested step parameter in a large workflow',
            examples: [
              {
                input: {
                  initialYaml: automatedTriagingYaml,
                  instruction:
                    'Bump the size on get_details from 10 to 50 — we keep missing context for alerts with many events.',
                },
                output: {
                  criteria: [
                    'The get_details step is unchanged except for its size parameter.',
                    'The size parameter on get_details is now 50.',
                    'No other steps were modified.',
                  ],
                  preservedStepNames: [
                    'for_each_discovery',
                    'create_case',
                    'foreach_alert_in_ad',
                    'add_to_case',
                    'add_analysis_to_case',
                    'ai_summary',
                    'isolate_host',
                  ],
                  expectedMaxToolCalls: 4,
                },
                metadata: { category: 'diverse-edit-modify-nested' },
              },
            ],
          },
        });
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Edits on infosecAlertTriageYaml (10 steps, alert trigger, conditional-heavy)
// ---------------------------------------------------------------------------

evaluate.describe(
  'Diverse edits on alert-triage baseline (10 steps, conditional-heavy)',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('bumps ES|QL time window across queries', async ({ evaluateDiverseEditDataset }) => {
      await evaluateDiverseEditDataset({
        dataset: {
          name: 'workflow-editing-diverse: alert-triage-bump-window',
          description: 'Modify a parameter that appears in multiple sibling ES|QL queries',
          examples: [
            {
              input: {
                initialYaml: infosecAlertTriageYaml,
                instruction:
                  'Change the time window in both IP enrichment ES|QL queries from 24 hours to 7 days. The rest of the queries should stay the same.',
              },
              output: {
                criteria: [
                  'The ip_okta_summary ES|QL query uses NOW() - 7d (or equivalent 7-day window).',
                  'The ip_aws_summary ES|QL query uses NOW() - 7d (or equivalent 7-day window).',
                  'No other parts of those queries (STATS, BY clause, LIMIT, etc.) were changed.',
                  'The create_triage_case, add_enrichment_comment, and log_completion steps are unchanged.',
                ],
                preservedStepNames: [
                  'severity_gate',
                  'enrich_source_ip',
                  'create_triage_case',
                  'add_enrichment_comment',
                  'log_completion',
                ],
                expectedMaxToolCalls: 3,
              },
              metadata: { category: 'diverse-edit-multi-step-modify' },
            },
          ],
        },
      });
    });

    evaluate('inserts a new enrichment query', async ({ evaluateDiverseEditDataset }) => {
      await evaluateDiverseEditDataset({
        dataset: {
          name: 'workflow-editing-diverse: alert-triage-insert-enrichment',
          description: 'Insert a new step alongside existing siblings in a nested structure',
          examples: [
            {
              input: {
                initialYaml: infosecAlertTriageYaml,
                instruction:
                  'Add another ES|QL enrichment alongside the Okta and AWS ones that queries logs-azure* for the same source IP, the same 24-hour window, same STATS shape.',
              },
              output: {
                criteria: [
                  'A new ES|QL enrichment step has been added alongside ip_okta_summary and ip_aws_summary.',
                  'The new step queries logs-azure* or similar Azure index.',
                  'The new step uses the same source.ip filter referencing event.alerts[0].source.ip.',
                  'The new step uses the same 24-hour time window.',
                  'The existing ip_okta_summary and ip_aws_summary steps are unchanged.',
                ],
                expectedStepTypes: ['elasticsearch.esql.query'],
                preservedStepNames: [
                  'ip_okta_summary',
                  'ip_aws_summary',
                  'create_triage_case',
                  'add_enrichment_comment',
                  'log_completion',
                ],
                expectedMaxToolCalls: 4,
                expectedToolSequence: ['platform.core.generate_workflow'],
              },
              metadata: { category: 'diverse-edit-insert-sibling' },
            },
          ],
        },
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Edits on infosecIndexBackfillYaml (7 steps, scheduled trigger)
// ---------------------------------------------------------------------------

evaluate.describe(
  'Diverse edits on index-backfill baseline (7 steps, scheduled trigger)',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate('changes schedule and bulk size together', async ({ evaluateDiverseEditDataset }) => {
      await evaluateDiverseEditDataset({
        dataset: {
          name: 'workflow-editing-diverse: backfill-schedule-and-limit',
          description: 'Single-turn edit that touches the trigger AND a step parameter',
          examples: [
            {
              input: {
                initialYaml: infosecIndexBackfillYaml,
                instruction:
                  'Run this every 15 minutes instead of hourly, and reduce the LIMIT in find_incomplete_records from 100 to 50 to keep the bulk write small.',
              },
              output: {
                criteria: [
                  'The schedule trigger interval is now 15 minutes (15m or equivalent).',
                  'The find_incomplete_records ES|QL query has LIMIT 50.',
                  'The check_has_records / log_no_records conditional structure is unchanged.',
                  'The backfill_enrichments, validate_backfill, and log_backfill_result steps are unchanged.',
                ],
                preservedStepNames: [
                  'backfill_enrichments',
                  'validate_backfill',
                  'log_backfill_result',
                ],
                expectedMaxToolCalls: 5,
              },
              metadata: { category: 'diverse-edit-trigger-plus-step' },
            },
          ],
        },
      });
    });

    evaluate('inserts a Slack notification on success', async ({ evaluateDiverseEditDataset }) => {
      await evaluateDiverseEditDataset({
        dataset: {
          name: 'workflow-editing-diverse: backfill-add-slack',
          description: 'Insert a connector step that consumes prior step output via Liquid',
          examples: [
            {
              input: {
                initialYaml: infosecIndexBackfillYaml,
                instruction:
                  'After log_backfill_result, add a Slack notification reporting the backfill count, using the same value the log step references.',
              },
              output: {
                criteria: [
                  'A new Slack step has been added after log_backfill_result.',
                  'The Slack step references the same backfilled-count value as log_backfill_result (steps.validate_backfill.output...).',
                  'The Slack step includes a connector-id field.',
                  'All existing steps are preserved.',
                ],
                expectedStepTypes: ['slack'],
                preservedStepNames: [
                  'find_incomplete_records',
                  'check_has_records',
                  'backfill_enrichments',
                  'validate_backfill',
                  'log_backfill_result',
                ],
                expectedMaxToolCalls: 5,
                expectedToolSequence: ['platform.core.generate_workflow'],
                expectedLiquidChains: [
                  {
                    ref: 'steps.validate_backfill.output',
                    resolvesTo: 'step-output',
                  },
                ],
              },
              metadata: { category: 'diverse-edit-insert-connector' },
            },
          ],
        },
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Edits on infosecSlackEnrichmentYaml (5 steps, alert trigger)
// ---------------------------------------------------------------------------

evaluate.describe(
  'Diverse edits on Slack-enrichment baseline (5 steps, alert trigger)',
  { tag: tags.serverless.observability.complete },
  () => {
    evaluate(
      'adds email + ServiceNow channels alongside Slack, preserving structure',
      async ({ evaluateDiverseEditDataset }) => {
        await evaluateDiverseEditDataset({
          dataset: {
            name: 'workflow-editing-diverse: enrichment-add-email',
            description:
              'Insert two new connector steps that mirror an existing one without disturbing ' +
              'the surrounding conditional, the Slack step, or the enrichment query above it. ' +
              'Stress-tests EditPreservation in a connector-heavy file.',
            examples: [
              {
                input: {
                  initialYaml: infosecSlackEnrichmentYaml,
                  instruction:
                    'In addition to the Slack message, also send (a) an email to oncall@example.com and (b) open a ServiceNow incident — both with the same alert context Slack uses, and both gated by the same severity check Slack is already inside. Use the existing connector configuration style.',
                },
                output: {
                  criteria: [
                    'A new email step exists inside the same conditional block as post_to_slack (not above the gate, not at the workflow root).',
                    'A new servicenow step exists inside that same conditional block, with the same gate.',
                    'Each new step references the alert rule name, severity, and source IP via Liquid (same fields Slack uses).',
                    'Both new connector steps include a connector-id field.',
                    'The enrich_alert step is byte-identical to the original (no whitespace changes, no field reordering, no renaming).',
                    'The post_to_slack step is byte-identical to the original.',
                    'The log_done step is byte-identical to the original and is still the last step in the workflow.',
                    'No new top-level workflow fields were introduced (no extra triggers, no extra consts).',
                  ],
                  // ServiceNow has two valid step variants (-itsm and -sir) and the
                  // agent is free to pick either; we can't assert structurally without
                  // accepting alternatives, and StructuralCorrectness no longer accepts
                  // pipe-splits. The criteria line above (judged by the LLM) already
                  // covers "a new servicenow step exists" — keep the structural
                  // assertion to the unambiguous email step.
                  expectedStepTypes: ['email'],
                  preservedStepNames: ['enrich_alert', 'post_to_slack', 'log_done'],
                  expectedMaxToolCalls: 3,
                  expectedToolSequence: ['platform.core.generate_workflow'],
                },
                metadata: { category: 'diverse-edit-mirror-connector' },
              },
            ],
          },
        });
      }
    );
  }
);
