/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const {
  generateOpenrouterConnectors,
  parseModelList,
  filterRequestedModels,
} = require('./generate_openrouter_connectors');

const BASE_URL = 'https://openrouter.ai/api/v1';
const API_KEY = 'sk-test';

function httpJsonFor(models) {
  return async (url) => {
    expect(url).toBe(`${BASE_URL}/models/user`);
    return { data: models };
  };
}

const TOOLS = ['tools', 'tool_choice', 'temperature'];

const modelIdOf = (connector) => connector.providerConfig.model_id;

describe('generateOpenrouterConnectors', () => {
  it('generates every tool-calling model available to this API key when no --models are given', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: '',
      httpJsonFn: httpJsonFor([
        { id: 'openai/gpt-5.4', supported_parameters: TOOLS },
        { id: 'anthropic/claude-sonnet-4.6', supported_parameters: TOOLS },
        { id: 'openai/gpt-5.4-image-2', supported_parameters: ['temperature'] },
      ]),
    });

    expect(Object.keys(connectors).sort()).toEqual([
      'openrouter-anthropic-claude-sonnet-4-6',
      'openrouter-openai-gpt-5-4',
    ]);
    expect(modelIdOf(connectors['openrouter-openai-gpt-5-4'])).toBe('openai/gpt-5.4');
    expect(modelIdOf(connectors['openrouter-anthropic-claude-sonnet-4-6'])).toBe(
      'anthropic/claude-sonnet-4.6'
    );
  });

  it('emits flat InferenceEndpointDefinition entries (not stack-connector shapes)', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: 'openai/gpt-5.4',
      httpJsonFn: httpJsonFor([{ id: 'openai/gpt-5.4', supported_parameters: TOOLS }]),
    });

    expect(connectors['openrouter-openai-gpt-5-4']).toEqual({
      name: 'OpenRouter openai/gpt-5.4',
      inferenceId: 'openrouter-openai-gpt-5-4',
      provider: 'openai',
      taskType: 'chat_completion',
      providerConfig: {
        model_id: 'openai/gpt-5.4',
        url: `${BASE_URL}/chat/completions`,
      },
      secrets: {
        providerSecrets: {
          api_key: API_KEY,
        },
      },
    });
  });

  it('includes the evaluation connector when a model filter is set', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: 'eis/openai-gpt-5.4',
      evaluationConnectorId: 'openrouter-anthropic-claude-sonnet-4-6',
      httpJsonFn: httpJsonFor([
        { id: 'openai/gpt-5.4', supported_parameters: TOOLS },
        { id: 'anthropic/claude-sonnet-4.6', supported_parameters: TOOLS },
      ]),
    });

    expect(Object.keys(connectors)).toEqual(['openrouter-anthropic-claude-sonnet-4-6']);
    expect(modelIdOf(connectors['openrouter-anthropic-claude-sonnet-4-6'])).toBe(
      'anthropic/claude-sonnet-4.6'
    );
  });

  it('fails when a requested model is missing from GET /models/user', async () => {
    await expect(
      generateOpenrouterConnectors({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        modelsRaw: 'openai/gpt-5.4,openai/does-not-exist',
        httpJsonFn: httpJsonFor([{ id: 'openai/gpt-5.4', supported_parameters: TOOLS }]),
      })
    ).rejects.toThrow(/openai\/does-not-exist/);
  });

  it('resolves `openrouter/<provider>-<model>` groups against GET /models/user', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: 'openrouter/openai-gpt-5.4,openrouter/anthropic-claude-sonnet-4.6',
      httpJsonFn: httpJsonFor([
        { id: 'openai/gpt-5.4', supported_parameters: TOOLS },
        { id: 'anthropic/claude-sonnet-4.6', supported_parameters: TOOLS },
      ]),
    });

    expect(Object.keys(connectors).sort()).toEqual([
      'openrouter-anthropic-claude-sonnet-4-6',
      'openrouter-openai-gpt-5-4',
    ]);
    expect(modelIdOf(connectors['openrouter-openai-gpt-5-4'])).toBe('openai/gpt-5.4');
  });

  it('generates only the explicitly requested models', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: 'openai/gpt-5.4',
      httpJsonFn: httpJsonFor([
        { id: 'openai/gpt-5.4', supported_parameters: TOOLS },
        { id: 'anthropic/claude-sonnet-4.6', supported_parameters: TOOLS },
      ]),
    });

    expect(Object.keys(connectors)).toEqual(['openrouter-openai-gpt-5-4']);
  });

  it('emits no OpenRouter connectors when the request is EIS-only', async () => {
    const connectors = await generateOpenrouterConnectors({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      modelsRaw: 'eis/openai-gpt-5.4',
      httpJsonFn: httpJsonFor([{ id: 'openai/gpt-5.4', supported_parameters: TOOLS }]),
    });

    expect(connectors).toEqual({});
  });
});

describe('filterRequestedModels', () => {
  it('drops EIS groups and keeps OpenRouter groups and native ids', () => {
    expect(
      filterRequestedModels(
        parseModelList('eis/openai-gpt-5.4,openrouter/openai-gpt-5.4,openai/gpt-5.4')
      )
    ).toEqual(['openrouter/openai-gpt-5.4', 'openai/gpt-5.4']);
  });
});
