/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { TRIAGE_OPENROUTER_MODEL, buildOpenrouterConnectorFromVault } = require('./ai_connectors');

describe('buildOpenrouterConnectorFromVault', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.KBN_EVALS_CONFIG_B64;
  });

  it('always uses the native OpenRouter id (does not reverse a slugified connector id)', () => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.OPENROUTER_API_KEY = 'sk-test';

    const connector = buildOpenrouterConnectorFromVault();

    expect(connector.config.providerConfig.model_id).toBe(TRIAGE_OPENROUTER_MODEL);
    expect(connector.config.providerConfig.url).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(connector.secrets.providerSecrets.api_key).toBe('sk-test');
  });

  it('reads OpenRouter credentials from KBN_EVALS_CONFIG_B64', () => {
    process.env.KBN_EVALS_CONFIG_B64 = Buffer.from(
      JSON.stringify({
        openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-vault' },
      }),
      'utf8'
    ).toString('base64');

    const connector = buildOpenrouterConnectorFromVault();

    expect(connector.config.providerConfig.model_id).toBe('google/gemini-3.7-flash');
    expect(connector.secrets.providerSecrets.api_key).toBe('sk-vault');
  });

  it('throws when OpenRouter credentials are missing', () => {
    expect(() => buildOpenrouterConnectorFromVault()).toThrow(/OpenRouter credentials are missing/);
  });
});
