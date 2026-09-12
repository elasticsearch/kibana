/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { deleteAllConversationsFromEs } from '../../../scout_agent_builder_shared/lib/conversations_es';
import { setupAgentDirectAnswer } from '../../../scout_agent_builder_shared/lib/proxy_scenario';
import { test } from '../fixtures';

test.describe(
  'Agent Builder — sidebar conversation flow',
  { tag: [...tags.stateful.classic, ...tags.serverless.search] },
  () => {
    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test.afterAll(async ({ esClient }) => {
      await deleteAllConversationsFromEs(esClient);
    });

    test('shows initial state', async ({ page, pageObjects }) => {
      await pageObjects.agentBuilder.prepareEmbeddableSidebar();
      await expect(page.testSubj.locator('agentBuilderEmbeddableMenuButton')).toBeVisible();
      await expect(page.testSubj.locator('agentBuilderConversationInputForm')).toBeVisible();
    });

    test('sends a message and receives a response', async ({ page, pageObjects, llmProxy }) => {
      const MOCKED_INPUT = 'hello from the sidebar';
      const MOCKED_RESPONSE = 'This is the sidebar response';
      const MOCKED_TITLE = 'Sidebar Flow Test';

      await pageObjects.agentBuilder.prepareEmbeddableSidebarWithNewChat();
      await setupAgentDirectAnswer({
        proxy: llmProxy,
        title: MOCKED_TITLE,
        response: MOCKED_RESPONSE,
      });
      await pageObjects.agentBuilder.typeMessage(MOCKED_INPUT);
      await pageObjects.agentBuilder.sendMessage();
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
      await expect(page.testSubj.locator('agentBuilderRoundResponse')).toContainText(
        MOCKED_RESPONSE
      );
    });

    test('can start a new chat from the menu', async ({ page, pageObjects }) => {
      await pageObjects.agentBuilder.prepareEmbeddableSidebar();
      await pageObjects.agentBuilder.openEmbeddableMenu();
      await pageObjects.agentBuilder.clickEmbeddableNewChatButton();
      await expect(page.testSubj.locator('agentBuilderConversationInputForm')).toBeVisible();
      await expect(page.testSubj.locator('agentBuilderRoundResponse')).toHaveCount(0);
    });

    test('can send a message after starting a new conversation from the menu', async ({
      page,
      pageObjects,
      llmProxy,
    }) => {
      const MOCKED_INPUT = 'message after new chat';
      const MOCKED_RESPONSE = 'Response after new chat';
      const MOCKED_TITLE = 'Post New Chat Conversation';

      await pageObjects.agentBuilder.prepareEmbeddableSidebarWithNewChat();
      await setupAgentDirectAnswer({
        proxy: llmProxy,
        title: MOCKED_TITLE,
        response: MOCKED_RESPONSE,
      });
      await pageObjects.agentBuilder.typeMessage(MOCKED_INPUT);
      await pageObjects.agentBuilder.sendMessage();
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
      await expect(page.testSubj.locator('agentBuilderRoundResponse')).toContainText(
        MOCKED_RESPONSE
      );
    });
  }
);
