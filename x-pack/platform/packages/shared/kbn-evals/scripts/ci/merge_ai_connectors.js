#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Reads KIBANA_TESTING_AI_CONNECTORS and EIS_CONNECTORS_B64 from the environment (each may be
// base64-encoded JSON or raw JSON), merges them, and writes base64-encoded JSON to stdout.
//
// In CI, @kbn/evals expects KIBANA_TESTING_AI_CONNECTORS to be base64-encoded JSON.

const { parseMaybeBase64Json } = require('./ai_connectors');

const rawLite = process.env.KIBANA_TESTING_AI_CONNECTORS || '';
const rawEis = process.env.EIS_CONNECTORS_B64 || '';

const lite = parseMaybeBase64Json(rawLite);
const eis = parseMaybeBase64Json(rawEis);

// Prefer EIS values if there are key collisions.
const merged = { ...lite, ...eis };

process.stdout.write(Buffer.from(JSON.stringify(merged), 'utf8').toString('base64'));
