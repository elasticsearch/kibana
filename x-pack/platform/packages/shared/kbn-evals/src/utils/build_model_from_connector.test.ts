/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ModelFamily, ModelProvider } from '@kbn/inference-common';
import type { InferenceEndpointDefinition } from './inference_endpoint_definition';
import type { StackConnectorDefinition } from './eval_connector';
import { buildModelFromConnector } from './build_model_from_connector';

const openRouterConnector: StackConnectorDefinition = {
  type: 'stack_connector',
  id: 'openrouter-anthropic-claude-sonnet-4-6',
  name: 'OpenRouter anthropic/claude-sonnet-4.6',
  actionTypeId: '.gen-ai',
  config: {
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-sonnet-4.6',
  },
  secrets: { apiKey: 'secret' },
};

const eisStackConnector: StackConnectorDefinition = {
  type: 'stack_connector',
  id: '.openai-gpt-4o-chat_completion',
  name: 'EIS gpt-4o',
  actionTypeId: '.inference',
  config: {
    provider: 'elastic',
    taskType: 'chat_completion',
    inferenceId: '.openai-gpt-4o-chat_completion',
    providerConfig: { model_id: 'gpt-4o' },
  },
  secrets: {},
};

const eisEndpoint: InferenceEndpointDefinition = {
  type: 'inference_endpoint',
  id: '.openai-gpt-4o-chat_completion',
  name: 'EIS gpt-4o',
  inferenceId: '.openai-gpt-4o-chat_completion',
  provider: 'elastic',
  taskType: 'chat_completion',
  providerConfig: { model_id: 'gpt-4o' },
};

describe('buildModelFromConnector', () => {
  describe('stack connectors', () => {
    it('attributes a .gen-ai connector from its defaultModel', () => {
      expect(buildModelFromConnector(openRouterConnector)).toEqual({
        family: ModelFamily.GPT,
        provider: ModelProvider.OpenAI,
        id: 'anthropic/claude-sonnet-4.6',
      });
    });

    it('attributes a .inference connector from config.providerConfig.model_id', () => {
      expect(buildModelFromConnector(eisStackConnector)).toEqual({
        family: ModelFamily.GPT,
        provider: ModelProvider.Elastic,
        id: 'gpt-4o',
      });
    });

    it('attributes a .inference connector independently of its id', () => {
      expect(buildModelFromConnector({ ...eisStackConnector, id: 'eis-gpt-4o' })).toEqual(
        buildModelFromConnector(eisStackConnector)
      );
    });

    it('falls back to the connector name when no model can be inferred', () => {
      const withoutModel: StackConnectorDefinition = {
        ...eisStackConnector,
        config: {
          provider: 'elastic',
          taskType: 'chat_completion',
          inferenceId: '.openai-gpt-4o-chat_completion',
        },
      };
      expect(buildModelFromConnector(withoutModel).id).toBe('EIS gpt-4o');
    });
  });

  describe('inference endpoint definitions', () => {
    it('attributes an EIS endpoint from providerConfig.model_id', () => {
      expect(buildModelFromConnector(eisEndpoint)).toEqual({
        family: ModelFamily.GPT,
        provider: ModelProvider.Elastic,
        id: 'gpt-4o',
      });
    });

    it('attributes a non-EIS endpoint to its own provider, not Elastic', () => {
      const openRouterEndpoint: InferenceEndpointDefinition = {
        type: 'inference_endpoint',
        id: 'openrouter-anthropic-claude-sonnet-4-6',
        name: 'OpenRouter anthropic/claude-sonnet-4.6',
        inferenceId: 'openrouter-anthropic-claude-sonnet-4-6',
        provider: 'openai',
        taskType: 'chat_completion',
        providerConfig: { model_id: 'anthropic/claude-sonnet-4.6' },
      };
      expect(buildModelFromConnector(openRouterEndpoint)).toEqual({
        family: ModelFamily.GPT,
        provider: ModelProvider.OpenAI,
        id: 'anthropic/claude-sonnet-4.6',
      });
    });

    it('attributes an endpoint independently of its resolved id', () => {
      expect(buildModelFromConnector({ ...eisEndpoint, id: 'eis-gpt-4o' })).toEqual(
        buildModelFromConnector(eisEndpoint)
      );
    });

    it('falls back to the endpoint name when providerConfig has no model_id', () => {
      const { providerConfig, ...withoutModel } = eisEndpoint;
      expect(buildModelFromConnector(withoutModel).id).toBe('EIS gpt-4o');
    });
  });
});
