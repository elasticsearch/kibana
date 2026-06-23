#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Generate `KIBANA_TESTING_AI_CONNECTORS` payload entries for Elastic Inference Service (EIS) models.
 *
 * Input: `target/eis_models.json` created by `node scripts/discover_eis_models.js`
 * Output: base64-encoded JSON (default) matching the expected connectors schema
 */

const Fs = require('fs');
const Path = require('path');
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

function main() {
  const argv = parseArgs(process.argv.slice(2), {
    defaults: {
      'models-path': Path.resolve(process.cwd(), 'target/eis_models.json'),
      'connector-id-prefix': 'eis-',
      format: 'base64',
    },
  });

  const modelsPath = Path.resolve(String(argv['models-path']));
  const connectorIdPrefix = String(argv['connector-id-prefix'] || 'eis-');
  const format = String(argv.format || 'base64').toLowerCase();

  if (!Fs.existsSync(modelsPath)) {
    die(`Missing EIS models file: ${modelsPath}\nRun: node scripts/discover_eis_models.js`);
  }

  let parsed;
  try {
    parsed = JSON.parse(Fs.readFileSync(modelsPath, 'utf8'));
  } catch (e) {
    die(`Failed to parse EIS models JSON at ${modelsPath}: ${e.message || String(e)}`);
  }

  const models = Array.isArray(parsed.models) ? parsed.models : [];
  if (models.length === 0) {
    die(`No EIS models found in ${modelsPath}`);
  }

  const connectors = {};
  for (const m of models) {
    const inferenceId = m && typeof m === 'object' ? m.inferenceId : undefined;
    const modelId = m && typeof m === 'object' ? m.modelId : undefined;

    if (typeof inferenceId !== 'string' || typeof modelId !== 'string' || !modelId) {
      continue;
    }

    const connectorId = `${connectorIdPrefix}${slugifyId(modelId)}`;
    connectors[connectorId] = {
      name: `EIS ${modelId}`,
      actionTypeId: '.inference',
      config: {
        provider: 'elastic',
        taskType: 'chat_completion',
        inferenceId,
        // For selection/metadata only; not used by the connector to route requests (inferenceId does that).
        providerConfig: {
          model_id: modelId,
        },
      },
      secrets: {},
    };
  }

  const json = JSON.stringify(connectors);
  if (format === 'json') {
    process.stdout.write(`${json}\n`);
    return;
  }

  if (format !== 'base64' && format !== 'b64') {
    die(`Unknown --format "${argv.format}". Use "base64" or "json".`);
  }

  process.stdout.write(`${Buffer.from(json, 'utf8').toString('base64')}\n`);
}

main();
