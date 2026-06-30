/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PromptCreateProps } from '@kbn/elastic-assistant-common/impl/schemas';
import { IS_SERVERLESS } from '../../env_var_names_constants';
import { QUICK_PROMPT_BADGE, USER_PROMPT } from '../../screens/ai_assistant';
import { createRule } from '../../tasks/api_calls/rules';
import {
  assertConnectorSelected,
  assertEmptySystemPrompt,
  assertErrorResponse,
  assertMessageSent,
  assertSystemPromptSelected,
  assertSystemPromptSent,
  clearSystemPrompt,
  createAndTitleConversation,
  createQuickPrompt,
  createSystemPrompt,
  openAssistant,
  resetConversation,
  selectConnector,
  selectConversation,
  selectSystemPrompt,
  sendQuickPrompt,
  typeAndSendMessage,
} from '../../tasks/assistant';
import {
  deleteConversations,
  deletePrompts,
  waitForConversation,
  waitForCreatePrompts,
} from '../../tasks/api_calls/assistant';
import { azureConnectorAPIPayload, createAzureConnector } from '../../tasks/api_calls/connectors';
import { deleteConnectors } from '../../tasks/api_calls/common';
import { login } from '../../tasks/login';
import { setPreferredChatExperienceToClassic } from '../../tasks/api_calls/kibana_advanced_settings';
import { visit, visitGetStartedPage } from '../../tasks/navigation';
import { getNewRule } from '../../objects/rule';
import { ALERTS_URL } from '../../urls/navigation';
import { waitForAlertsToPopulate } from '../../tasks/create_new_rule';
import { expandFirstAlert } from '../../tasks/alerts';

const promptType: PromptCreateProps['promptType'] = 'system';
const testPrompt = {
  name: 'Cool prompt',
  content: 'This is a super cool prompt.',
};

const customPrompt1 = {
  name: 'Custom system prompt',
  content: 'This is a custom system prompt.',
  promptType,
};
const customPrompt2 = {
  name: 'Enhanced system prompt',
  content: 'This is an enhanced system prompt.',
  promptType,
};
const mockConvo1 = {
  id: 'spooky',
  title: 'Spooky convo',
  messages: [],
};
const mockConvo2 = {
  id: 'silly',
  title: 'Silly convo',
  messages: [],
};

describe('AI Assistant Prompts', { tags: ['@ess', '@serverless'] }, () => {
  beforeEach(() => {
    deleteConnectors();
    deleteConversations();
    deletePrompts();
    login(Cypress.env(IS_SERVERLESS) ? 'admin' : undefined);
    setPreferredChatExperienceToClassic();
    createAzureConnector();
    waitForConversation(mockConvo1);
    waitForConversation(mockConvo2);
  });

  describe('System Prompts', () => {
    beforeEach(() => {
      waitForCreatePrompts([customPrompt2, customPrompt1]);
    });
    it('No prompt is selected by default, custom prompts can be selected and deselected', () => {
      visitGetStartedPage();
      openAssistant();
      assertEmptySystemPrompt();
      selectSystemPrompt(customPrompt2.name);
      selectSystemPrompt(customPrompt1.name);
      clearSystemPrompt();
    });
    it('Deselecting a system prompt prevents prompt from being sent. When conversation is then cleared, the prompt remains cleared.', () => {
      visitGetStartedPage();
      openAssistant();
      selectSystemPrompt(customPrompt2.name);
      clearSystemPrompt();
      selectConnector(azureConnectorAPIPayload.name);
      assertConnectorSelected(azureConnectorAPIPayload.name);
      typeAndSendMessage('hello');
      assertMessageSent('hello');
      // ensure response before clearing convo
      assertErrorResponse();
      resetConversation();
      assertEmptySystemPrompt();
      typeAndSendMessage('hello');
      assertMessageSent('hello');
      assertErrorResponse();
    });

    it('Last selected system prompt persists in conversation', () => {
      visitGetStartedPage();
      openAssistant();
      selectConversation(mockConvo1.title);
      selectConnector(azureConnectorAPIPayload.name);
      selectSystemPrompt(customPrompt2.name);
      typeAndSendMessage('hello');
      assertSystemPromptSent(customPrompt2.content);
      assertMessageSent('hello', true);
      assertErrorResponse();
      resetConversation();
      assertSystemPromptSelected(customPrompt2.name);
      selectConversation(mockConvo2.title);
      assertEmptySystemPrompt();
      selectConversation(mockConvo1.title);
      assertSystemPromptSelected(customPrompt2.name);
    });

    it('Add prompt from system prompt selector without setting a default conversation', () => {
      visitGetStartedPage();
      openAssistant();
      createSystemPrompt(testPrompt.name, testPrompt.content);
      // we did not set a default conversation, so the prompt should not be set
      assertEmptySystemPrompt();
      selectSystemPrompt(testPrompt.name);
      selectConnector(azureConnectorAPIPayload.name);
      assertConnectorSelected(azureConnectorAPIPayload.name);
      typeAndSendMessage('hello');
      assertSystemPromptSent(testPrompt.content);
      assertMessageSent('hello', true);
      assertErrorResponse();
    });

    // due to the missing profile_uid when creating conversations from the API
    // bulk actions cannot be performed on conversations, so they must be created from the UI for this test
    it('Add prompt from system prompt selector and set multiple conversations (including current) as default conversation', () => {
      visitGetStartedPage();
      openAssistant();
      createAndTitleConversation('Lucky title');
      resetConversation();
      createAndTitleConversation('Lovely title');
      resetConversation();
      // current conversation is 'Lovely title'
      createSystemPrompt(testPrompt.name, testPrompt.content, ['Lucky title', 'Lovely title']);
      assertSystemPromptSelected(testPrompt.name);
      selectConnector(azureConnectorAPIPayload.name);
      assertConnectorSelected(azureConnectorAPIPayload.name);
      typeAndSendMessage('hello');

      assertSystemPromptSent(testPrompt.content);
      assertMessageSent('hello', true);
      // ensure response before changing convo
      assertErrorResponse();
      selectConversation('Lucky title');
      assertSystemPromptSelected(testPrompt.name);
      typeAndSendMessage('hello');

      assertSystemPromptSent(testPrompt.content);
      assertMessageSent('hello', true);
      assertErrorResponse();
    });
  });
  describe('Quick Prompts', () => {
    it('Add a quick prompt and send it in the conversation', () => {
      visitGetStartedPage();
      openAssistant();
      createQuickPrompt(testPrompt.name, testPrompt.content);
      selectConnector(azureConnectorAPIPayload.name);
      assertConnectorSelected(azureConnectorAPIPayload.name);
      sendQuickPrompt(testPrompt.name);
      assertMessageSent(testPrompt.content);
      assertErrorResponse();
    });
    it('Add a quick prompt with context and it is only available in the selected context', () => {
      visitGetStartedPage();
      openAssistant();
      createQuickPrompt(testPrompt.name, testPrompt.content, ['Alert (from view)']);
      cy.get(QUICK_PROMPT_BADGE(testPrompt.name)).should('not.exist');
      createRule(getNewRule());
      visit(ALERTS_URL);
      waitForAlertsToPopulate();
      expandFirstAlert();
      openAssistant('alert');
      cy.get(QUICK_PROMPT_BADGE(testPrompt.name)).should('be.visible');
      cy.get(QUICK_PROMPT_BADGE(testPrompt.name)).click();
      cy.get(USER_PROMPT).should('have.text', testPrompt.content);
    });
    // TODO delete quick prompt
    // I struggled to do this since the element is hidden with css and I cannot get it to show
  });
});
