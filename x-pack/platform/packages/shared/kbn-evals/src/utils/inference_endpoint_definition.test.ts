/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loadInferenceEndpoints } from './inference_endpoint_definition';

describe('loadInferenceEndpoints', () => {
  afterEach(() => {
    delete process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS;
  });

  it('returns an empty array when the env var is not set', () => {
    delete process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS;
    expect(loadInferenceEndpoints()).toEqual([]);
  });

  it('loads EIS definitions from base64-encoded JSON', () => {
    const defs = {
      'eis-claude-sonnet-4-6': {
        name: 'EIS claude-sonnet-4.6',
        inferenceId: '.anthropic-claude-sonnet-4-6',
        provider: 'elastic',
        taskType: 'chat_completion',
        providerConfig: { model_id: 'claude-sonnet-4.6' },
      },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = Buffer.from(
      JSON.stringify(defs),
      'utf8'
    ).toString('base64');

    const result = loadInferenceEndpoints();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'eis-claude-sonnet-4-6',
      name: 'EIS claude-sonnet-4.6',
      inferenceId: '.anthropic-claude-sonnet-4-6',
      provider: 'elastic',
      taskType: 'chat_completion',
      providerConfig: { model_id: 'claude-sonnet-4.6' },
    });
  });

  it('tags every definition so it discriminates against a stack connector', () => {
    const defs = {
      'eis-claude-sonnet-4-6': {
        name: 'EIS claude-sonnet-4.6',
        inferenceId: '.anthropic-claude-sonnet-4-6',
        provider: 'elastic',
        taskType: 'chat_completion',
      },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify(defs);

    expect(loadInferenceEndpoints()[0].type).toBe('inference_endpoint');
  });

  it('ignores a `type` supplied in the environment JSON', () => {
    const defs = {
      'eis-claude-sonnet-4-6': {
        name: 'EIS claude-sonnet-4.6',
        inferenceId: '.anthropic-claude-sonnet-4-6',
        provider: 'elastic',
        taskType: 'chat_completion',
        type: 'stack_connector',
      },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify(defs);

    expect(loadInferenceEndpoints()[0].type).toBe('inference_endpoint');
  });

  it('loads OpenRouter definitions from raw JSON', () => {
    const defs = {
      'openrouter-openai-gpt-5-4': {
        name: 'OpenRouter openai/gpt-5.4',
        inferenceId: 'openrouter-openai-gpt-5-4',
        provider: 'openai',
        taskType: 'chat_completion',
        providerConfig: {
          model_id: 'openai/gpt-5.4',
          url: 'https://openrouter.ai/api/v1/chat/completions',
        },
        secrets: { providerSecrets: { api_key: 'sk-test' } },
      },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify(defs);

    const result = loadInferenceEndpoints();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'openrouter-openai-gpt-5-4',
      provider: 'openai',
      inferenceId: 'openrouter-openai-gpt-5-4',
    });
  });

  it('throws when the JSON is not an object', () => {
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify([{ name: 'bad' }]);
    expect(() => loadInferenceEndpoints()).toThrow(
      'KIBANA_TESTING_INFERENCE_ENDPOINTS must be a JSON object'
    );
  });

  it('throws when a definition is missing inferenceId', () => {
    const defs = {
      'my-conn': { name: 'My Conn', provider: 'elastic', taskType: 'chat_completion' },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify(defs);
    expect(() => loadInferenceEndpoints()).toThrow(
      'Inference endpoint "my-conn" is missing required field "inferenceId"'
    );
  });

  it('throws when a definition is missing provider', () => {
    const defs = {
      'my-conn': { name: 'My Conn', inferenceId: '.my-ep', taskType: 'chat_completion' },
    };
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = JSON.stringify(defs);
    expect(() => loadInferenceEndpoints()).toThrow(
      'Inference endpoint "my-conn" is missing required field "provider"'
    );
  });

  it('throws when the env var is not valid JSON', () => {
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = 'not-valid-json';
    expect(() => loadInferenceEndpoints()).toThrow(
      'KIBANA_TESTING_INFERENCE_ENDPOINTS is not valid base64-encoded JSON or raw JSON'
    );
  });
});
