#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Generate `KIBANA_TESTING_INFERENCE_ENDPOINTS` payload for @kbn/evals from OpenRouter.
 *
 * This script:
 * - fetches models available to this API key via GET {baseUrl}/models/user
 *   (respects OpenRouter guardrails; not the public catalog at GET /models)
 * - emits a `chat_completion` inference endpoint definition per requested model
 *   (`--models` / `EVAL_MODEL_GROUPS`).
 * - when none are requested, emits every key-available model that advertises tool calling
 * - skips EIS (`eis/*`) entries (handled separately)
 *
 * Auth: OpenRouter API key via Authorization Bearer.
 */

const { slugifyId } = require('./slugify_id');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function parseArgs(argv, { defaults = {} } = {}) {
  const out = { ...defaults };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith('--')) {
      rest.push(token);
      continue;
    }

    const eqIdx = token.indexOf('=');
    if (eqIdx !== -1) {
      const key = token.slice(2, eqIdx);
      const value = token.slice(eqIdx + 1);
      out[key] = value;
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }

    out[key] = next;
    i++;
  }

  out._ = rest;
  return out;
}

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function getArg(argv, name, envName) {
  return argv[name] || (envName ? process.env[envName] : undefined);
}

function parseModelList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function filterRequestedModels(models) {
  return models.filter((m) => {
    if (!m) return false;
    if (m.startsWith('eis/')) return false;
    return true;
  });
}

async function httpJson(url, apiKey) {
  if (typeof fetch !== 'function') {
    die('Global fetch is not available in this Node runtime.');
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    die(`OpenRouter request failed: ${res.status} ${res.statusText}\n${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    die(`Failed to parse OpenRouter JSON response from ${url}\n${text}`);
  }
}

async function fetchAvailableModels(baseUrl, apiKey, httpJsonFn = httpJson) {
  const response = await httpJsonFn(`${baseUrl}/models/user`, apiKey);
  const entries = response && Array.isArray(response.data) ? response.data : [];
  const byId = new Map();
  const byConnectorId = new Map();

  for (const entry of entries) {
    const id = entry && typeof entry === 'object' ? entry.id : undefined;
    if (typeof id !== 'string' || !id.trim()) continue;
    const modelId = id.trim();
    const connectorId = `openrouter-${slugifyId(modelId)}`;
    byId.set(modelId, entry);
    byConnectorId.set(connectorId, modelId);
  }

  return { byId, byConnectorId };
}

function resolveModelId(requested, { byId, byConnectorId }) {
  if (byId.has(requested)) {
    return requested;
  }
  if (byConnectorId.has(requested)) {
    return byConnectorId.get(requested);
  }
  if (requested.startsWith('openrouter/')) {
    return byConnectorId.get(`openrouter-${slugifyId(requested.slice('openrouter/'.length))}`);
  }
  return undefined;
}

function supportsToolCalling(entry) {
  const params =
    entry && Array.isArray(entry.supported_parameters) ? entry.supported_parameters : [];
  return params.includes('tools');
}

/**
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   modelsRaw?: string,
 *   evaluationConnectorId?: string,
 *   httpJsonFn?: (url: string, apiKey: string) => Promise<object>,
 * }} options
 * @returns {Promise<Record<string, object>>}
 */
async function generateOpenrouterConnectors({
  baseUrl,
  apiKey,
  modelsRaw = '',
  evaluationConnectorId = '',
  httpJsonFn = httpJson,
}) {
  const rawList = parseModelList(modelsRaw);
  const evalConnectorId = String(evaluationConnectorId).trim();
  if (rawList.length > 0 && evalConnectorId.startsWith('openrouter-')) {
    rawList.push(evalConnectorId);
  }

  const requested = filterRequestedModels(rawList);
  const available = await fetchAvailableModels(baseUrl, apiKey, httpJsonFn);

  if (requested.length === 0 && rawList.length > 0) {
    return {};
  }

  const missing = [];
  const resolved = [];

  if (requested.length === 0) {
    for (const [modelId, entry] of available.byId) {
      if (supportsToolCalling(entry)) {
        resolved.push(modelId);
      }
    }

    if (evalConnectorId.startsWith('openrouter-')) {
      const judgeModelId = resolveModelId(evalConnectorId, available);
      if (!judgeModelId) {
        missing.push(evalConnectorId);
      } else if (!resolved.includes(judgeModelId)) {
        // Judges only need chat completions, not tool calling.
        resolved.push(judgeModelId);
      }
    }
  } else {
    for (const token of requested) {
      const modelId = resolveModelId(token, available);
      if (!modelId) {
        missing.push(token);
        continue;
      }
      if (!supportsToolCalling(available.byId.get(modelId))) {
        if (token === evalConnectorId) {
          // Judges only need chat completions, not tool calling.
          resolved.push(modelId);
          continue;
        }
        throw new Error(`Requested model does not advertise tool calling: ${token}`);
      }
      resolved.push(modelId);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `OpenRouter model(s) not found via GET ${baseUrl}/models/user:\n` +
        missing.map((m) => `  - ${m}`).join('\n')
    );
  }

  const chatUrl = `${baseUrl}/chat/completions`;
  const connectors = {};
  for (const modelId of resolved) {
    const connectorId = `openrouter-${slugifyId(modelId)}`;
    connectors[connectorId] = {
      name: `OpenRouter ${modelId}`,
      inferenceId: connectorId,
      provider: 'openai',
      taskType: 'chat_completion',
      providerConfig: {
        model_id: modelId,
        url: chatUrl,
      },
      secrets: {
        providerSecrets: {
          api_key: apiKey,
        },
      },
    };
  }
  return connectors;
}

async function main() {
  const argv = parseArgs(process.argv.slice(2), {
    defaults: {
      'base-url': DEFAULT_BASE_URL,
      format: 'base64',
    },
  });

  const baseUrl = String(
    getArg(argv, 'base-url', 'OPENROUTER_BASE_URL') || DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  const apiKey = getArg(argv, 'api-key', 'OPENROUTER_API_KEY');
  if (!apiKey) {
    die('Missing --api-key (or set OPENROUTER_API_KEY).');
  }

  const modelsRaw = getArg(argv, 'models') || process.env.EVAL_MODEL_GROUPS || '';

  let connectors;
  try {
    connectors = await generateOpenrouterConnectors({
      baseUrl,
      apiKey,
      modelsRaw,
      evaluationConnectorId: process.env.EVAL_CONNECTOR_ID,
    });
  } catch (e) {
    die(e && e.message ? e.message : String(e));
  }

  const format = String(argv.format || 'base64').toLowerCase();
  const json = JSON.stringify(connectors);
  if (format === 'json') {
    process.stdout.write(`${json}\n`);
    return;
  }

  if (format !== 'base64' && format !== 'b64') {
    die(`Unknown --format "${argv.format}". Use "base64" or "json".`);
  }

  process.stdout.write(`${Buffer.from(json, 'utf-8').toString('base64')}\n`);
}

if (require.main === module) {
  main().catch((e) => {
    die(e && e.stack ? e.stack : String(e));
  });
}

module.exports = {
  parseModelList,
  filterRequestedModels,
  generateOpenrouterConnectors,
};
