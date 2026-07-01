/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createToolCallMessage } from '@kbn/ftr-llm-proxy';
import { expect } from '@kbn/scout-security/ui';
import { CUSTOM_QUERY_RULE, FULL_KIBANA_SECURITY_ROLE } from '@kbn/scout-security';
import { spaceTest, tags } from '../fixtures';

const ALERT_COUNT = 3;

// Failing: See https://github.com/elastic/kibana/issues/274822
spaceTest.describe.skip(
  'Bulk add alerts to chat',
  // Serverless excluded: agent builder feature not yet available on serverless
  { tag: [...tags.stateful.classic] },
  () => {
    // One rule name per created rule; the first is used as the anchor to wait for page readiness.
    const ruleNames: string[] = [];

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }, testInfo) => {
      // Rule execution can take up to ~90s under load; extend beyond Playwright's 60s default.
      testInfo.setTimeout(testInfo.timeout + 90_000);
      // Defensive cleanup from any prior failed run.
      // Note: cleanStandardList() is intentionally omitted here — it deletes saved objects
      // of type 'action', which would destroy the .gen-ai connector created by the
      // worker-scoped llmProxy fixture and make the bulk "Add to chat" action disappear.
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();

      ruleNames.length = 0;
      for (let i = 0; i < ALERT_COUNT; i++) {
        const name = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}_${i}`;
        ruleNames.push(name);
        await apiServices.detectionRule.createCustomQueryRule({
          ...CUSTOM_QUERY_RULE,
          name,
          rule_id: `scout-bulk-chat-${scoutSpace.id}-${i}`,
        });
      }

      // Wait for the task manager to execute each rule and produce at least one alert before
      // opening the browser. Without this, waitForRuleAlert races against the task manager's
      // first-run scheduling (which can take up to ~90s under load) and times out.
      await Promise.all(
        ruleNames.map((name) => apiServices.detectionAlerts.waitForAlerts(name, 1, 60_000))
      );

      await browserAuth.loginWithCustomRole(FULL_KIBANA_SECURITY_ROLE);
    });

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest(
      'should disable the "Add to chat" bulk action when all alerts are selected via the query button',
      // _llmProxy is declared so the worker fixture provisions the AI connector in the test space;
      // without it the bulk action would not appear at all.
      async ({ pageObjects, llmProxy: _llmProxy }) => {
        const { alertsTablePage } = pageObjects;

        await alertsTablePage.navigate();
        await alertsTablePage.waitForRuleAlert(ruleNames[0]);

        await spaceTest.step('check one row to activate the bulk toolbar', async () => {
          await alertsTablePage.checkAlertRowCheckbox(ruleNames[0]);
        });

        await spaceTest.step('click "Select all" to switch to query-based selection', async () => {
          await alertsTablePage.selectAllAlertsButton.click();
        });

        await spaceTest.step(
          'verify "Add to chat" is present but disabled in the bulk actions menu',
          async () => {
            await alertsTablePage.selectedShowBulkActionsButton.click();
            await expect(alertsTablePage.bulkAddToChatMenuItem).toBeVisible();
            await expect(alertsTablePage.bulkAddToChatMenuItem).toBeDisabled();
          }
        );
      }
    );

    spaceTest(
      'should open agent builder conversation with attachment chip and pre-filled prompt, and send multiple alerts to the LLM',
      async ({ pageObjects, llmProxy }) => {
        const { alertsTablePage, agentBuilderPage } = pageObjects;

        await alertsTablePage.navigate();

        // Wait for the first rule's alert to appear — this proves Sourcerer has initialized
        // and the alerts table is ready. Longer timeout covers the full initialization window.
        await alertsTablePage.waitForRuleAlert(ruleNames[0]);

        await spaceTest.step('select all visible alerts via header checkbox', async () => {
          // The header checkbox uses selectCurrentPage (not selectAll/query mode), so
          // disableOnQuery actions like bulk-add-to-chat remain enabled.
          await alertsTablePage.bulkActionsHeaderCheckbox.check();
        });

        await spaceTest.step('open bulk actions and click Add to chat', async () => {
          await alertsTablePage.selectedShowBulkActionsButton.click();
          await alertsTablePage.bulkAddToChatMenuItem.click();
        });

        await spaceTest.step(
          'verify conversation opens with attachment chip and pre-filled prompt',
          async () => {
            await expect(agentBuilderPage.conversation).toBeVisible();
            await agentBuilderPage.waitForAttachmentPillsRow();
            await expect(agentBuilderPage.inputEditor).toContainText(
              'Triage and prioritize these security alerts'
            );
          }
        );

        await spaceTest.step('send message and verify LLM received multiple alerts', async () => {
          // Register interceptors here — immediately before submit — so the 30s proxy
          // timeout doesn't expire during the earlier waitForRuleAlert / waitForAttachmentPillsRow
          // steps. autoSendInitialMessage: false guarantees no LLM call fires before this point.
          //
          // The agent builder makes exactly 2 LLM calls in non-structured mode:
          //   1. set_title  — forced tool call to generate a conversation title
          //   2. research-agent — the research agent gathers context and returns a plain-text
          //      handover note; in non-structured mode this note IS the final answer
          //      (graph.ts finalize() returns it directly, no third answering-agent call).
          void llmProxy
            .intercept({
              name: 'set_title',
              when: (body) => {
                const sys = body.messages.find((m) => m.role === 'system');
                return String(sys?.content ?? '').includes('You are a title-generation utility');
              },
              responseMock: createToolCallMessage('set_title', { title: 'Alert triage' }),
            })
            .completeAfterIntercept();

          void llmProxy
            .intercept({
              name: 'research-agent',
              when: () => true,
              responseMock: 'Here is the alert triage summary.',
            })
            .completeAfterIntercept();

          await agentBuilderPage.submitButton.click();
          await llmProxy.waitForAllInterceptorsToHaveBeenCalled();

          const researchAgentRequest = llmProxy.interceptedRequests.find(
            (r) => r.matchingInterceptorName === 'research-agent'
          )?.requestBody;

          expect(researchAgentRequest).toBeDefined();
          const messages: Array<{ content?: unknown }> = researchAgentRequest?.messages ?? [];
          const allContent = messages.map((m) => String(m.content ?? '')).join('\n');

          // Verify multiple alerts were delivered: each alert block contains the rule name field.
          const alertFieldOccurrences = allContent.split('kibana.alert.rule.name').length - 1;
          expect(alertFieldOccurrences).toBeGreaterThanOrEqual(ALERT_COUNT);
        });
      }
    );
  }
);
