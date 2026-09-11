/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvalConnector } from '@kbn/evals';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { ExecutionStatus } from '@kbn/workflows';
import { evaluate, tags } from '../src/evaluate';
import { assertWorkflowInstalled, ensureJudgeConnectorAccessible } from '../src/workflow_fixture';

const WORKFLOW_INPUT = {
  technique: 'T1078.001',
  gap_description:
    'No rule covering attempts to authenticate using known default credentials on Linux hosts.',
  evidence: 'Repeated su/sudo failures with default usernames across 3 Linux endpoints.',
  confidence: 0.85,
};

/**
 * KQL phrase escaping for agent-generated rule names. The draft step derives the
 * name from the gap description, so it can contain quotes or backslashes that
 * would otherwise 400 the `_find` filter and surface as an opaque poll timeout.
 */
const escapeKqlPhrase = (value: string): string => value.replace(/([\\"])/g, '\\$1');

const findRuleByName = async (
  fetch: HttpHandler,
  ruleName: string
): Promise<{ id: string; name: string } | undefined> => {
  const { data } = await fetch<{ data: Array<{ id: string; name: string }> }>(
    `/api/detection_engine/rules/_find`,
    {
      method: 'GET',
      query: { filter: `alert.attributes.name: "${escapeKqlPhrase(ruleName)}"`, per_page: 1 },
    }
  );
  return data?.[0];
};

const deleteRule = async (fetch: HttpHandler, id: string): Promise<void> => {
  await fetch(`/api/detection_engine/rules`, {
    method: 'DELETE',
    query: { id },
  });
};

/**
 * Deletes every rule this spec created (approved runs only). Runs after each test
 * regardless of outcome, so a failure in the approve test cannot leak state into
 * the reject test's non-existence assertion. Errors are logged, not thrown —
 * cleanup must never mask the original failure.
 */
const sweepCreatedRules = async (
  fetch: HttpHandler,
  log: ToolingLog,
  createdRuleIds: Set<string>
): Promise<void> => {
  for (const id of createdRuleIds) {
    try {
      await deleteRule(fetch, id);
      log.info(`Swept rule ${id}`);
    } catch (err) {
      log.error(`Failed to sweep rule ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  createdRuleIds.clear();
};

evaluate.describe(
  'Rule Creation Worker — approval gate',
  { tag: tags.serverless.security.complete },
  () => {
    // Rules created by an approved run outlive the test that created them. Inline
    // cleanup only runs on success — a leaked rule from a failed approve test
    // false-fails the reject test's non-existence assertion. afterEach cancels
    // any still-running execution first (a paused workflow that resumes after the
    // test body threw can still create a rule mid-sweep), then sweeps on every
    // path, including assertion failure and timeout.
    const createdRuleIds = new Set<string>();
    let createdRuleName: string | undefined;

    evaluate.afterEach(async ({ ruleCreationClient, fetch, log }) => {
      await ruleCreationClient.cancelPending();
      await sweepCreatedRules(fetch, log, createdRuleIds);
      if (createdRuleName) {
        const name = createdRuleName;
        createdRuleName = undefined;
        try {
          const rule = await findRuleByName(fetch, name);
          if (rule) {
            await deleteRule(fetch, rule.id);
            log.info(`Swept leaked rule "${name}" (${rule.id}) by name`);
          }
        } catch (err) {
          log.error(
            `Failed to sweep rule "${name}" by name: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    });

    evaluate.beforeAll(
      async ({
        fetch,
        connector,
        log,
      }: {
        fetch: HttpHandler;
        connector: EvalConnector;
        log: ToolingLog;
      }) => {
        await ensureJudgeConnectorAccessible({ fetch, connector, log });
        await assertWorkflowInstalled({ fetch, log });
      }
    );

    evaluate(
      'rule is saved in the detection engine when the user approves',
      async ({ ruleCreationClient, fetch, log }) => {
        const result = await ruleCreationClient.run({ input: WORKFLOW_INPUT });

        // Capture the name before the approval response: if respond() throws or the
        // test fails mid-flight, afterEach still knows what to sweep by name.
        createdRuleName = result.rule?.name;

        if (!result.pendingApproval) {
          // A declined draft never reaches the gate. Say so explicitly: WORKFLOW_INPUT is a
          // winnable gap, so a skip here means the quality gate is over-refusing, not that
          // the approval plumbing broke.
          if (result.skipped) {
            throw new Error(
              `The quality gate declined a winnable gap (${
                result.skipReason ?? 'no reason given'
              }) so the workflow never reached the approval gate — the gate is over-refusing.`
            );
          }
          throw new Error(
            `Execution did not pause at the approval gate (pendingApproval=${result.pendingApproval}) — cannot test the approve path`
          );
        }

        const execution = await ruleCreationClient.respond({
          workflowExecutionId: result.workflowExecutionId,
          stepExecutions: result.stepExecutions,
          approved: true,
        });

        if (execution.status !== ExecutionStatus.COMPLETED) {
          throw new Error(`Workflow did not complete after approval — status: ${execution.status}`);
        }

        const ruleName = result.rule?.name;
        if (!ruleName) {
          throw new Error(
            'draft_creation produced no rule name — the approval path cannot be verified without it'
          );
        }

        log.info(`Verifying rule "${ruleName}" was created after approval`);
        const rule = await findRuleByName(fetch, ruleName);
        if (!rule) {
          throw new Error(
            `Rule "${ruleName}" was not found in the detection engine after approval`
          );
        }
        createdRuleIds.add(rule.id);
        log.info(`Confirmed rule "${ruleName}" exists — registered for afterEach sweep`);
      }
    );

    evaluate(
      'rule is not created when the user rejects',
      async ({ ruleCreationClient, fetch, log }) => {
        const result = await ruleCreationClient.run({ input: WORKFLOW_INPUT });

        // Capture for the same reason as the approve test: afterEach sweeps by name
        // if this test dies before its own non-existence check completes.
        createdRuleName = result.rule?.name;

        if (!result.pendingApproval) {
          // A declined draft never reaches the gate. Say so explicitly: WORKFLOW_INPUT is a
          // winnable gap, so a skip here means the quality gate is over-refusing, not that
          // the approval plumbing broke.
          if (result.skipped) {
            throw new Error(
              `The quality gate declined a winnable gap (${
                result.skipReason ?? 'no reason given'
              }) so the workflow never reached the approval gate — the gate is over-refusing.`
            );
          }
          throw new Error(
            `Execution did not pause at the approval gate (pendingApproval=${result.pendingApproval}) — cannot test the reject path`
          );
        }

        const execution = await ruleCreationClient.respond({
          workflowExecutionId: result.workflowExecutionId,
          stepExecutions: result.stepExecutions,
          approved: false,
        });

        // create_rule is if-guarded, not a workflow failure: rejection still completes.
        if (execution.status !== ExecutionStatus.COMPLETED) {
          throw new Error(
            `Workflow did not complete after rejection — status: ${execution.status}`
          );
        }

        const ruleName = result.rule?.name;
        if (!ruleName) {
          log.info('No rule name from draft_creation — skipping detection engine check');
          return;
        }

        log.info(`Verifying rule "${ruleName}" was NOT created after rejection`);

        const rule = await findRuleByName(fetch, ruleName);
        if (rule) {
          throw new Error(
            `Rule "${ruleName}" was found in the detection engine after rejection — create_rule should not have fired`
          );
        }

        log.info(`Confirmed rule "${ruleName}" does not exist after rejection`);
      }
    );
  }
);
