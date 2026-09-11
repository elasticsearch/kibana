#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parse a value that may be raw JSON or base64-encoded JSON into an object.
 * Returns `{}` when the value is empty or cannot be parsed.
 */
function parseMaybeBase64Json(raw) {
  if (!raw) {
    return {};
  }

  const direct = tryParseJson(raw);
  if (direct) {
    return direct;
  }

  try {
    const decoded = tryParseJson(Buffer.from(raw, 'base64').toString('utf8'));
    return decoded ?? {};
  } catch {
    return {};
  }
}

function parseVaultConfig() {
  const configB64 = process.env.KBN_EVALS_CONFIG_B64 || '';
  if (!configB64) {
    return null;
  }

  try {
    const config = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));
    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
}

// CI notify triage uses this OpenRouter model.
const TRIAGE_OPENROUTER_MODEL = 'google/gemini-3.7-flash';

/**
 * Build the CI-notification triage connector from vault/env OpenRouter credentials.
 */
function buildOpenrouterConnectorFromVault() {
  const config = parseVaultConfig();
  const openrouter = config?.openrouter;
  const baseUrl = (
    process.env.OPENROUTER_BASE_URL ||
    (openrouter && typeof openrouter === 'object' && typeof openrouter.baseUrl === 'string'
      ? openrouter.baseUrl
      : '')
  ).replace(/\/+$/, '');
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    (openrouter && typeof openrouter === 'object' && typeof openrouter.apiKey === 'string'
      ? openrouter.apiKey
      : '');
  if (!baseUrl || !apiKey) {
    throw new Error(
      'OpenRouter credentials are missing (set OPENROUTER_BASE_URL/OPENROUTER_API_KEY or KBN_EVALS_CONFIG_B64)'
    );
  }

  return {
    config: {
      provider: 'openai',
      taskType: 'chat_completion',
      providerConfig: {
        model_id: TRIAGE_OPENROUTER_MODEL,
        url: `${baseUrl}/chat/completions`,
      },
    },
    secrets: { providerSecrets: { api_key: apiKey } },
  };
}

module.exports = {
  parseMaybeBase64Json,
  parseVaultConfig,
  TRIAGE_OPENROUTER_MODEL,
  buildOpenrouterConnectorFromVault,
};
