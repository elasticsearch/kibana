/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { deleteAllConversationsFromEs } from '../../../scout_agent_builder_shared/lib/conversations_es';
import {
  getGenAiConnectorId,
  seedConversationViaConverse,
} from '../../../scout_agent_builder_shared/lib/conversations_api';
import { test } from '../fixtures';

const CONVERSATION_DATA = [
  {
    title: 'Sidebar History Conversation 1',
    userMessage: 'Hello, this is sidebar conversation 1',
    expectedResponse: 'Sidebar response for conversation 1',
  },
  {
    title: 'Sidebar History Conversation 2',
    userMessage: 'Hello, this is sidebar conversation 2',
    expectedResponse: 'Sidebar response for conversation 2',
  },
] as const;

// Failing: See https://github.com/elastic/kibana/issues/289099
test.describe.skip(
  'Agent Builder — sidebar conversation history',
  { tag: [...tags.stateful.classic, ...tags.serverless.search] },
  () => {
    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test.afterAll(async ({ esClient }) => {
      await deleteAllConversationsFromEs(esClient);
    });

    test('embeddable sidebar conversation history', async ({
      page,
      pageObjects,
      llmProxy,
      kbnClient,
    }) => {
      const conversationIds: string[] = [];

      await test.step('seed conversations via converse API', async () => {
        const connectorId = await getGenAiConnectorId(kbnClient);
        for (const conv of CONVERSATION_DATA) {
          conversationIds.push(
            await seedConversationViaConverse(kbnClient, llmProxy, connectorId, conv)
          );
        }
      });

      await test.step('shows existing conversations in the menu', async () => {
        await pageObjects.agentBuilder.prepareEmbeddableSidebar();
        await pageObjects.agentBuilder.openEmbeddableMenu();
        await expect(async () => {
          await expect(
            page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[0]}`)
          ).toBeVisible();
          await expect(
            page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[1]}`)
          ).toBeVisible();
        }).toPass({ timeout: 120_000 });
        await pageObjects.agentBuilder.dismissWithEscape();
      });

      await test.step('can switch to an existing conversation and see its messages', async () => {
        await pageObjects.agentBuilder.prepareEmbeddableSidebar();
        await pageObjects.agentBuilder.openEmbeddableMenu();
        await pageObjects.agentBuilder.selectEmbeddableConversation(conversationIds[0]);
        await expect(async () => {
          await expect(page.testSubj.locator('agentBuilderRoundResponse')).toContainText(
            CONVERSATION_DATA[0].expectedResponse
          );
        }).toPass({ timeout: 120_000 });

        await pageObjects.agentBuilder.openEmbeddableMenu();
        await pageObjects.agentBuilder.selectEmbeddableConversation(conversationIds[1]);
        await expect(async () => {
          await expect(page.testSubj.locator('agentBuilderRoundResponse')).toContainText(
            CONVERSATION_DATA[1].expectedResponse
          );
        }).toPass({ timeout: 120_000 });
      });

      await test.step('search filters the conversation list', async () => {
        await pageObjects.agentBuilder.prepareEmbeddableSidebar();
        await pageObjects.agentBuilder.openEmbeddableMenu();
        await pageObjects.agentBuilder.fillEmbeddableConversationSearch('Conversation 1');
        await expect(async () => {
          await expect(
            page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[0]}`)
          ).toBeVisible();
        }).toPass({ timeout: 60_000 });
        await expect(
          page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[1]}`)
        ).toBeHidden();

        await pageObjects.agentBuilder.clearEmbeddableConversationSearch();
        await expect(async () => {
          await expect(
            page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[0]}`)
          ).toBeVisible();
          await expect(
            page.testSubj.locator(`agentBuilderEmbeddableConversation-${conversationIds[1]}`)
          ).toBeVisible();
        }).toPass({ timeout: 60_000 });
        await pageObjects.agentBuilder.dismissWithEscape();
      });
    });
  }
);
