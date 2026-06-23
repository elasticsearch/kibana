#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Generate `KIBANA_TESTING_AI_CONNECTORS` payload for @kbn/evals from LiteLLM.
 *
 * This script:
 * - resolves team id from team name (via /team/list or /team/available) unless --team-id is provided
 * - fetches team info (via /team/info?team_id=...) to discover accessible models
 * - falls back to GET /v1/models when the team returns a catch-all like "all-proxy-models"
 * - emits base64 JSON payload matching the expected connectors schema
 *
 * Auth: LiteLLM *virtual key* (sk-...) via Authorization Bearer.
 */

const { slugifyId } = require('./slugify_id');

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

/** Model name returned by /team/info when a team has unrestricted access to all proxy models. */
const ALL_PROXY_MODELS = 'all-proxy-models';

function unwrapCandidates(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return (
    payload.teams ||
    payload.data ||
    payload.items ||
    payload.results ||
    payload.available_teams ||
    []
  );
}

function findTeamIdByName(teams, teamName) {
  const target = slugifyId(teamName);
  for (const t of teams) {
    if (!t || typeof t !== 'object') continue;
    const aliasRaw = (t.team_alias ?? t.team_name ?? t.name ?? t.alias ?? '').toString();
    const alias = slugifyId(aliasRaw);
    if (alias && alias === target) {
      return t.team_id ?? t.id ?? t.teamId;
    }
  }
  return undefined;
}

function extractModelNames(teamInfo) {
  if (!teamInfo || typeof teamInfo !== 'object') return [];

  const nested = teamInfo.team_info || teamInfo.teamInfo || teamInfo.team;

  const candidates =
    teamInfo.models ||
    teamInfo.model_list ||
    teamInfo.allowed_models ||
    (teamInfo.data &&
      (teamInfo.data.models || teamInfo.data.model_list || teamInfo.data.allowed_models)) ||
    (nested && (nested.models || nested.model_list || nested.allowed_models)) ||
    [];

  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((m) => {
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object') {
        return m.model_name ?? m.model ?? m.name ?? m.id;
      }
      return undefined;
    })
    .filter(Boolean);
}

/**
 * Discover available model names via the OpenAI-compatible GET /v1/models endpoint.
 * When called with a team's virtual key, this returns only models accessible to that team.
 *
 * @param {string} baseUrl - LiteLLM proxy base URL
 * @param {string} apiKey  - LiteLLM virtual key (scopes to team)
 * @param {string} modelPrefix - Only return models starting with this prefix (e.g. "llm-gateway/")
 * @returns {Promise<string[]>} Model names (without prefix stripped)
 */
async function fetchAvailableModelNames(baseUrl, apiKey, modelPrefix) {
  const response = await httpJson(`${baseUrl}/v1/models`, apiKey);

  const entries = response && Array.isArray(response.data) ? response.data : [];
  const models = new Set();

  for (const entry of entries) {
    const id = entry && typeof entry === 'object' ? entry.id : undefined;
    if (typeof id !== 'string' || !id.trim()) continue;
    // Only include models matching the expected prefix (e.g. "llm-gateway/").
    if (modelPrefix && !id.startsWith(modelPrefix)) continue;
    models.add(id.trim());
  }

  return [...models].sort();
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
    die(`LiteLLM request failed: ${res.status} ${res.statusText}\n${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    die(`Failed to parse LiteLLM JSON response from ${url}\n${text}`);
  }
}

async function httpJsonMaybe(url, apiKey, { allowStatuses = [404, 405] } = {}) {
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
    if (allowStatuses.includes(res.status)) {
      return null;
    }
    die(`LiteLLM request failed: ${res.status} ${res.statusText}\n${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    die(`Failed to parse LiteLLM JSON response from ${url}\n${text}`);
  }
}

async function fetchTeams(baseUrl, apiKey) {
  // LiteLLM deployments vary; prefer /team/list if present, fall back to /team/available.
  const list = await httpJsonMaybe(`${baseUrl}/team/list`, apiKey);
  if (list) {
    return unwrapCandidates(list);
  }

  const available = await httpJsonMaybe(`${baseUrl}/team/available`, apiKey, {
    allowStatuses: [404],
  });
  if (available) {
    return unwrapCandidates(available);
  }

  die(
    'Unable to list teams from LiteLLM. Tried /team/list and /team/available but neither endpoint is available.'
  );
}

async function fetchModelInfoMappings(baseUrl, apiKey) {
  // This endpoint returns the LiteLLM model table, including internal provider mappings
  // (e.g. `litellm_params.model`). Some deployments may restrict it; treat as optional.
  const info = await httpJsonMaybe(`${baseUrl}/model/info`, apiKey, {
    allowStatuses: [401, 403, 404],
  });

  if (!info || !info.data || !Array.isArray(info.data)) {
    return new Map();
  }

  const map = new Map();
  for (const entry of info.data) {
    if (!entry || typeof entry !== 'object') continue;
    const publicName = entry.model_name;
    const mapped = entry.litellm_params && entry.litellm_params.model;
    if (typeof publicName === 'string' && typeof mapped === 'string' && publicName.length) {
      map.set(publicName, mapped);
    }
  }
  return map;
}

async function fetchModelGroupInfo(baseUrl, apiKey, modelGroup) {
  // model_group/info returns capability metadata for a public model group, including its mode ("chat", "responses", etc.)
  const url = `${baseUrl}/model_group/info?model_group=${encodeURIComponent(String(modelGroup))}`;
  return await httpJsonMaybe(url, apiKey, { allowStatuses: [401, 403, 404] });
}

async function main() {
  const argv = parseArgs(process.argv.slice(2), {
    defaults: {
      'base-url': 'https://elastic.litellm-prod.ai',
      'team-name': 'kibana-ci-evals',
      'model-prefix': 'llm-gateway/',
      format: 'base64',
    },
  });

  const baseUrl = String(getArg(argv, 'base-url')).replace(/\/+$/, '');
  const apiKey =
    getArg(argv, 'api-key', 'LITELLM_VIRTUAL_KEY') || getArg(argv, 'api-key', 'LITELLM_API_KEY');
  if (!apiKey) {
    die('Missing --api-key (or set LITELLM_VIRTUAL_KEY).');
  }

  const teamIdArg = getArg(argv, 'team-id');
  const teamName = getArg(argv, 'team-name');
  const modelPrefix = String(getArg(argv, 'model-prefix')).trim();

  // Primary path: resolve team and fetch models via /team/info.
  // This returns a scoped model list for teams with specific model permissions.
  let modelNames = [];
  let teamId = teamIdArg;
  if (!teamId) {
    const teams = await fetchTeams(baseUrl, apiKey);
    const resolved = findTeamIdByName(teams, teamName);
    if (!resolved) {
      const known = teams
        .map((t) =>
          t && typeof t === 'object' ? t.team_alias ?? t.team_name ?? t.name : undefined
        )
        .filter(Boolean)
        .slice(0, 50);
      die(
        `Unable to resolve team id for team name "${teamName}".\n` +
          `Known team names (first 50): ${known.join(', ') || '(none)'}.`
      );
    }
    teamId = resolved;
  }

  const teamInfo = await httpJson(
    `${baseUrl}/team/info?team_id=${encodeURIComponent(String(teamId))}`,
    apiKey
  );
  modelNames = extractModelNames(teamInfo);

  // Fallback: if the team returns a catch-all like "all-proxy-models" instead of
  // individual model names, discover models via GET /v1/models instead.
  const isAllProxyModels =
    modelNames.length > 0 && modelNames.every((m) => String(m) === ALL_PROXY_MODELS);

  if (isAllProxyModels) {
    process.stderr.write(
      `Team "${teamName}" returned all proxy models (${modelNames.join(
        ', '
      )}) - falling back to GET /v1/models.\n`
    );
    modelNames = await fetchAvailableModelNames(baseUrl, apiKey, modelPrefix);
  }

  if (modelNames.length === 0) {
    die(`No models found for team_id=${teamId}. Unable to generate connectors.`);
  }

  const modelInfoMappings = await fetchModelInfoMappings(baseUrl, apiKey);
  const chatUrl = `${baseUrl}/v1/chat/completions`;
  const connectors = {};
  const modelSet = new Set(modelNames.map((m) => String(m)));

  for (const rawModelName of modelNames) {
    const modelName = String(rawModelName);
    const fullModel = modelName.startsWith(modelPrefix) ? modelName : `${modelPrefix}${modelName}`;

    // Filter out non-chat models. Some model groups (e.g. Codex) are "responses" mode and will fail on /v1/chat/completions.
    const modelGroupInfo = await fetchModelGroupInfo(baseUrl, apiKey, fullModel);
    const mode = modelGroupInfo?.data?.[0]?.mode;
    if (typeof mode === 'string' && mode !== 'chat') {
      continue;
    }

    const connectorId = `litellm-${slugifyId(fullModel)}`;
    // Temporary normalization: LiteLLM can expose a *public model name* (aka a "model group")
    // like `llm-gateway/gpt-5.2-chat`, while internally routing that group to a provider-specific
    // model name (e.g. `gpt-5.2-chat-latest` as shown in the LiteLLM UI).
    //
    // The team/model listing APIs and /v1/models endpoint return only the public model names,
    // not the internal provider mapping. In our CI runs we observed requests for `*-chat` groups
    // being routed to `*-chat-latest` and then failing with "Unknown model: *-chat-latest".
    //
    // Workaround: if a non-`-chat` sibling model exists, prefer it for the actual request model
    // while keeping the connector id stable (so CI-configured EVALUATION_CONNECTOR_ID stays valid).
    const fullModelSibling = fullModel.endsWith('-chat') ? fullModel.replace(/-chat$/, '') : null;
    const mappedInternal = modelInfoMappings.get(fullModel);
    const looksLikeLatestMapping =
      typeof mappedInternal === 'string' && /-latest$/.test(mappedInternal.trim());
    const requestModel =
      looksLikeLatestMapping &&
      fullModelSibling &&
      (modelSet.has(fullModelSibling) || modelSet.has(fullModelSibling.replace(modelPrefix, '')))
        ? fullModelSibling
        : fullModel;

    connectors[connectorId] = {
      name:
        requestModel === fullModel
          ? `LiteLLM ${fullModel}`
          : `LiteLLM ${fullModel} (via ${requestModel})`,
      actionTypeId: '.gen-ai',
      config: {
        apiProvider: 'Other',
        apiUrl: chatUrl,
        // For OpenAI-compatible ("Other") providers, inference defaults to simulated function calling
        // unless this is explicitly enabled. Our LiteLLM models support native tool calling.
        enableNativeFunctionCalling: true,
        defaultModel: requestModel,
      },
      secrets: {
        apiKey,
      },
    };
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

  const asB64 = Buffer.from(json, 'utf-8').toString('base64');
  process.stdout.write(`${asB64}\n`);
}

main().catch((e) => {
  die(e && e.stack ? e.stack : String(e));
});
