#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { slugifyId } = require('./slugify_id');
const {
  parseMaybeBase64Json,
  parseVaultConfig,
  connectorIdToLitellmModel,
  buildLitellmConnectorFromVault,
} = require('./ai_connectors');

const MAX_LOG_EXCERPT_CHARS = 4000;
const MAX_CONTEXT_JSON_BYTES = 30 * 1024;

// Triage/summary text is always generated with a small, low-cost LiteLLM model.
const DEFAULT_TRIAGE_MODEL_ID = 'litellm-llm-gateway-claude-haiku-4-5';

const TRIAGE_SYSTEM_PROMPT =
  'You are an SRE assistant triaging failed LLM evaluation CI runs. Be concise and factual, and base every statement on the provided context.';

function failureLogMetadataKey(suiteId, project) {
  return `kbn-evals:suite-failure-log:${slugifyId(suiteId)}:${slugifyId(project)}`;
}

function truncateText(text, maxChars) {
  const value = String(text ?? '');
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(value.length - maxChars);
}

function truncateContextJson(context, maxBytes = MAX_CONTEXT_JSON_BYTES) {
  let serialized = JSON.stringify(context);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
    return serialized;
  }

  const clone = JSON.parse(serialized);
  if (clone.models && typeof clone.models === 'object') {
    for (const model of Object.values(clone.models)) {
      if (model && typeof model === 'object' && typeof model.logExcerpt === 'string') {
        model.logExcerpt = truncateText(model.logExcerpt, 1500);
      }
    }
  }

  serialized = JSON.stringify(clone);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
    return serialized;
  }

  return serialized.slice(0, maxBytes);
}

function buildTriageUserPrompt(context, header) {
  const lines = [
    'Triage why this LLM evaluation suite failed in CI using only the run-log excerpts below.',
    '',
    `Suite: ${header.suiteName} (${header.suiteId})`,
    `Failing models: ${header.failingProjects.map((p) => `\`${p}\``).join(', ')}`,
  ];

  if (header.buildUrl) {
    lines.push(`Build: ${header.buildUrl}`);
  }
  if (header.buildId) {
    lines.push(`Buildkite build id: ${header.buildId}`);
  }

  lines.push(
    '',
    'Failure context (JSON, includes each model log excerpt):',
    truncateContextJson(context),
    '',
    'Return ONLY a JSON object of this shape (no prose, no markdown, no code fences):',
    '{"groups":[{"error":"<most relevant error line, verbatim from the excerpts, one line>","location":"<file:line / test or scenario if shown, else empty>","models":["<affected model id>"],"rootCause":"<short cause + one short action>"}]}',
    '',
    'Rules:',
    '- One group per distinct error. Merge the same failure (same message/location) into one group and list all its affected models.',
    '- Quote "error" verbatim from the excerpts; do not invent errors, file names, line numbers, or causes.',
    '- Set "location" only if the excerpts show it; otherwise use an empty string.',
    '- Keep "rootCause" to one short sentence plus one short action.',
    '- If the excerpts show no clear error, return {"groups": []}.',
    '- Output valid JSON only: no prose before or after, no comments, no trailing commas, no code fences.'
  );

  return lines.join('\n');
}

/**
 * Extract a short, single-line root-cause summary from a per-suite triage body.
 */
function extractSuiteRootCauseLine(triageBody, maxChars = 160) {
  const body = String(triageBody ?? '');
  if (!body.trim()) {
    return '';
  }

  const rawLines = body.split('\n').map((line) => line.trim());
  const triageHeaderIndex = rawLines.findIndex((line) => /triage summary/i.test(line));
  const candidateLines = triageHeaderIndex >= 0 ? rawLines.slice(triageHeaderIndex + 1) : rawLines;

  for (const line of candidateLines) {
    if (!line) {
      continue;
    }
    if (/^:[a-z_]+:/i.test(line)) {
      continue; // emoji alert header
    }
    if (/^\*.*\*$/.test(line)) {
      continue; // bold section header like *Failing models:*
    }
    if (/^[-•]\s*`/.test(line)) {
      continue; // bullet that is just a model id
    }
    if (/^<https?:\/\//.test(line)) {
      continue; // build link line
    }

    const cleaned = line
      .replace(/^[-•*]\s*/, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (cleaned) {
      return truncateText(cleaned, maxChars);
    }
  }

  return '';
}

/**
 * Build the user prompt for the weekly cross-suite executive summary.
 */
function buildWeeklyRollupUserPrompt(suites, meta = {}) {
  const lines = [
    'Summarize a weekly LLM-evaluation CI run that had failing suites, for the evals maintainers in a shared Slack channel.',
    '',
    `Failing suites: ${suites.length}`,
  ];

  if (meta.buildUrl) {
    lines.push(`Build: ${meta.buildUrl}`);
  }

  lines.push('', 'Per-suite triage (already produced earlier in the run):');
  for (const suite of suites) {
    const failing =
      Array.isArray(suite.failingProjects) && suite.failingProjects.length > 0
        ? suite.failingProjects.join(', ')
        : 'unknown';
    lines.push(
      '',
      `### ${suite.suiteName || suite.suiteId} (${suite.suiteId})`,
      `Failing models: ${failing}`,
      truncateText(String(suite.triageBody ?? '').trim() || '(no per-suite triage available)', 1200)
    );
  }

  lines.push(
    '',
    'Output exactly these bullets, in this order, and nothing else:',
    '- Overall: <X> suites likely retryable, <Y> need a team to investigate.',
    '- Shared causes: group suites that share the same likely cause (e.g. "3 suites hit the same gpt-5.4 timeout"); omit this bullet if no cause is shared.',
    '- Needs action: list suite ids that need investigation, each with a one-line cause.',
    '- Retry: list suite ids that can simply be retried.',
    '',
    'Constraints: base everything on the per-suite triage above (do not invent suites, models, or causes); no second person, narration, or preamble; portable markdown only (bullets and inline `code`; no bold, headings, links, or code fences); stay under 900 characters.'
  );

  return lines.join('\n');
}

function buildLitellmChatRequest(connector, messages) {
  const config = connector.config && typeof connector.config === 'object' ? connector.config : {};
  const secrets =
    connector.secrets && typeof connector.secrets === 'object' ? connector.secrets : {};

  const apiUrl = typeof config.apiUrl === 'string' ? config.apiUrl : '';
  const defaultModel = typeof config.defaultModel === 'string' ? config.defaultModel : '';
  const apiKey = typeof secrets.apiKey === 'string' ? secrets.apiKey : '';

  if (!apiUrl || !defaultModel || !apiKey) {
    throw new Error('LiteLLM connector is missing apiUrl, defaultModel, or apiKey');
  }

  return {
    url: apiUrl,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: defaultModel,
      messages,
      temperature: 0.2,
      max_tokens: 800,
    },
  };
}

/**
 * Resolve the LiteLLM model used to generate Slack/GitHub triage text.
 * override with `EVAL_TRIAGE_MODEL_ID`.
 */
function resolveTriageModelId() {
  return process.env.EVAL_TRIAGE_MODEL_ID || DEFAULT_TRIAGE_MODEL_ID;
}

function parseLitellmChatContent(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') {
    throw new Error('LiteLLM response was not JSON');
  }

  const choices = /** @type {{ choices?: Array<{ message?: { content?: string } }> }} */ (
    responseJson
  ).choices;

  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LiteLLM response did not include message content');
  }

  return content.trim();
}

/**
 * POST a built LiteLLM chat request and return the message content.
 */
async function postLitellmChatRequest({ url, headers, body }) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && 'error' in json) {
        detail = JSON.stringify(json.error);
      }
    } catch {
      // keep text slice
    }
    throw new Error(`Inference request failed (${response.status}): ${detail}`);
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Inference response was not JSON');
  }

  return parseLitellmChatContent(json);
}

/**
 * Resolve the LiteLLM triage connector and its model id (shared by the text and
 * structured triage paths). Enforces the `litellm-` guard and falls back to the
 * vault config when KIBANA_TESTING_AI_CONNECTORS was not generated.
 */
function resolveTriageConnector() {
  const modelId = resolveTriageModelId();
  if (!modelId.startsWith('litellm-')) {
    throw new Error(`Unsupported triage model connector id (expected litellm-): ${modelId}`);
  }

  const connector =
    parseMaybeBase64Json(process.env.KIBANA_TESTING_AI_CONNECTORS || '')[modelId] ??
    buildLitellmConnectorFromVault(modelId);
  if (!connector) {
    throw new Error(
      `Model connector ${modelId} is not available (set KIBANA_TESTING_AI_CONNECTORS or LiteLLM env/config)`
    );
  }

  return { connector, modelId };
}

/**
 * Parse the structured triage groups returned by the model.
 */
function parseTriageGroups(rawText) {
  const text = String(rawText ?? '').trim();
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new Error('Triage model did not return valid JSON');
  }

  const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  return groups
    .map((group) => ({
      error: String(group?.error ?? '').trim(),
      location: String(group?.location ?? '').trim(),
      models: Array.isArray(group?.models)
        ? group.models.map((model) => String(model).trim()).filter(Boolean)
        : [],
      rootCause: String(group?.rootCause ?? '').trim(),
    }))
    .filter((group) => group.error || group.rootCause);
}

/**
 * Resolve the LiteLLM connector, send the shared system prompt + the given user
 * prompt, and return the trimmed summary and the model id used. This is the
 * shared core behind the weekly text summary.
 */
async function runTriageModel(userPrompt, { maxChars = 1500 } = {}) {
  const { connector, modelId } = resolveTriageConnector();

  const messages = [
    { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let summary = await postLitellmChatRequest(buildLitellmChatRequest(connector, messages));
  if (summary.length > maxChars) {
    summary = `${summary.slice(0, maxChars - 1)}…`;
  }

  return { summary: summary.trim(), modelId };
}

/**
 * Resolve the LiteLLM connector, send the shared system prompt + the given user
 * prompt, and return the parsed structured triage groups and the model id used.
 * Used by the per-suite triage, which renders the message deterministically.
 */
async function runTriageModelStructured(userPrompt) {
  const { connector, modelId } = resolveTriageConnector();

  const messages = [
    { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const raw = await postLitellmChatRequest(buildLitellmChatRequest(connector, messages));

  return { groups: parseTriageGroups(raw), modelId };
}

module.exports = {
  MAX_LOG_EXCERPT_CHARS,
  MAX_CONTEXT_JSON_BYTES,
  DEFAULT_TRIAGE_MODEL_ID,
  TRIAGE_SYSTEM_PROMPT,
  resolveTriageModelId,
  failureLogMetadataKey,
  truncateText,
  truncateContextJson,
  buildTriageUserPrompt,
  buildWeeklyRollupUserPrompt,
  extractSuiteRootCauseLine,
  buildLitellmChatRequest,
  parseVaultConfig,
  connectorIdToLitellmModel,
  buildLitellmConnectorFromVault,
  parseLitellmChatContent,
  postLitellmChatRequest,
  resolveTriageConnector,
  parseTriageGroups,
  runTriageModel,
  runTriageModelStructured,
};
