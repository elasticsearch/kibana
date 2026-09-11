/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const {
  failureLogMetadataKey,
  failureLogMetadataKeysForProject,
  TRIAGE_OPENROUTER_CONNECTOR_ID,
  resolveTriageConnector,
} = require('./failure_context_helpers');

const SUITE = 'significant-events';

describe('failureLogMetadataKey', () => {
  it('slugifies the suite and project into a stable key', () => {
    expect(failureLogMetadataKey(SUITE, 'eis/openai-gpt-5.4')).toBe(
      'kbn-evals:suite-failure-log:significant-events:eis-openai-gpt-5-4'
    );
  });
});

describe('failureLogMetadataKeysForProject', () => {
  const base = failureLogMetadataKey(SUITE, 'gpt-5');

  it('returns only the unsharded key when no shard keys were recorded', () => {
    expect(failureLogMetadataKeysForProject([], SUITE, 'gpt-5')).toEqual([base]);
  });

  it('returns the unsharded key first, then the shard keys in a stable order', () => {
    const keys = [
      `${base}:features`,
      'kbn-evals:suite-failures:significant-events:gpt-5',
      `${base}:discovery-and-queries`,
      base,
    ];

    expect(failureLogMetadataKeysForProject(keys, SUITE, 'gpt-5')).toEqual([
      base,
      `${base}:discovery-and-queries`,
      `${base}:features`,
    ]);
  });

  it('does not bleed shards of a model whose slug is a prefix of another model', () => {
    const miniBase = failureLogMetadataKey(SUITE, 'gpt-5-mini');
    const keys = [`${base}:features`, `${miniBase}:features`];

    expect(failureLogMetadataKeysForProject(keys, SUITE, 'gpt-5')).toEqual([
      base,
      `${base}:features`,
    ]);
    expect(failureLogMetadataKeysForProject(keys, SUITE, 'gpt-5-mini')).toEqual([
      miniBase,
      `${miniBase}:features`,
    ]);
  });
});

describe('resolveTriageConnector', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.KBN_EVALS_CONFIG_B64;
    delete process.env.KIBANA_TESTING_AI_CONNECTORS;
  });

  it('builds from vault credentials with the pinned native id, ignoring generated connectors', () => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    process.env.KIBANA_TESTING_AI_CONNECTORS = Buffer.from(
      JSON.stringify({
        [TRIAGE_OPENROUTER_CONNECTOR_ID]: {
          config: {
            provider: 'openai',
            taskType: 'chat_completion',
            inferenceId: TRIAGE_OPENROUTER_CONNECTOR_ID,
            providerConfig: {
              model_id: 'google/gemini-3.7-flash-stale',
              url: 'https://example.invalid/chat',
            },
          },
          secrets: { providerSecrets: { api_key: 'sk-generated' } },
        },
      }),
      'utf8'
    ).toString('base64');

    const { connector, modelId } = resolveTriageConnector();

    expect(modelId).toBe('openrouter-google-gemini-3-7-flash');
    expect(connector.config.providerConfig.model_id).toBe('google/gemini-3.7-flash');
    expect(connector.secrets.providerSecrets.api_key).toBe('sk-test');
  });
});
