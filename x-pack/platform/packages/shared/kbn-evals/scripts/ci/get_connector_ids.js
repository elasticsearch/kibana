#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Reads KIBANA_TESTING_AI_CONNECTORS (base64 or raw JSON) and EVAL_MODEL_GROUPS
// from the environment, then writes matching connector IDs (newline-separated) to stdout.

const { parseMaybeBase64Json } = require('./ai_connectors');

const cfg = parseMaybeBase64Json(process.env.KIBANA_TESTING_AI_CONNECTORS || '');

const requestedRaw = process.env.EVAL_MODEL_GROUPS || '';
const requested = requestedRaw
  ? requestedRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const connectorEntries = Object.entries(cfg);
const connectorIds =
  requested.length === 0 || requested.includes('all')
    ? connectorEntries.map(([id]) => id)
    : connectorEntries
        .filter(([id, connector]) => {
          const defaultModel = connector?.config?.defaultModel;
          const eisModelId = connector?.config?.providerConfig?.model_id;

          const matchesRequested = (requestedValue) => {
            if (requestedValue === id) return true;
            if (typeof defaultModel === 'string' && requestedValue === defaultModel) return true;
            if (typeof eisModelId === 'string') {
              if (requestedValue === eisModelId) return true;
              if (
                requestedValue.startsWith('eis/') &&
                requestedValue.slice('eis/'.length) === eisModelId
              ) {
                return true;
              }
            }
            return false;
          };

          return requested.some(matchesRequested);
        })
        .map(([id]) => id);

if (requested.length > 0 && !requested.includes('all') && connectorIds.length === 0) {
  const availableModels = connectorEntries.flatMap(([, connector]) => {
    const out = [];
    const defaultModel = connector?.config?.defaultModel;
    if (typeof defaultModel === 'string') out.push(defaultModel);
    const eisModelId = connector?.config?.providerConfig?.model_id;
    if (typeof eisModelId === 'string') out.push(`eis/${eisModelId}`);
    return out;
  });
  console.error(
    `No connectors matched EVAL_MODEL_GROUPS="${requested.join(',')}". ` +
      `Available models: ${availableModels.join(',')}`
  );
  process.exit(1);
}

process.stdout.write(connectorIds.join('\n'));
