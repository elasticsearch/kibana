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

/**
 * Maps a LiteLLM connector id (e.g. litellm-llm-gateway-gpt-4o) to a LiteLLM model group name.
 */
function connectorIdToLitellmModel(connectorId) {
  const stripped = String(connectorId).replace(/^litellm-/, '');
  const prefix = 'llm-gateway-';
  if (stripped.startsWith(prefix)) {
    return `llm-gateway/${stripped.slice(prefix.length)}`;
  }
  return stripped;
}

/**
 * Build a minimal LiteLLM connector from vault config when KIBANA_TESTING_AI_CONNECTORS was not generated.
 */
function buildLitellmConnectorFromVault(modelConnectorId) {
  const config = parseVaultConfig();
  const litellm = config?.litellm;
  const baseUrl =
    process.env.LITELLM_BASE_URL ||
    (litellm && typeof litellm === 'object' && typeof litellm.baseUrl === 'string'
      ? litellm.baseUrl
      : '');
  const apiKey =
    process.env.LITELLM_VIRTUAL_KEY ||
    (litellm && typeof litellm === 'object' && typeof litellm.virtualKey === 'string'
      ? litellm.virtualKey
      : '');
  if (!baseUrl || !apiKey) {
    throw new Error(
      'LiteLLM credentials are missing (set LITELLM_BASE_URL/LITELLM_VIRTUAL_KEY or KBN_EVALS_CONFIG_B64)'
    );
  }

  return {
    config: {
      apiUrl: `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      defaultModel: connectorIdToLitellmModel(modelConnectorId),
    },
    secrets: { apiKey },
  };
}

module.exports = {
  parseMaybeBase64Json,
  parseVaultConfig,
  connectorIdToLitellmModel,
  buildLitellmConnectorFromVault,
};
