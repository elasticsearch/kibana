/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * TTL-based file cache for EIS (Elastic Inference Service) connector definitions.
 *
 * Stores the connector map at ~/.elastic/eis-connectors-cache.json as plain JSON
 * so that `evals start` can restore KIBANA_TESTING_INFERENCE_ENDPOINTS without
 * requiring a fresh `evals init` every shell session.
 *
 * The payload is deterministic and contains no secrets (secrets: {} is always
 * empty in EIS connector objects).
 *
 * TTL is 7 days - matching the CCM key cache. No stale-read variant: a stale
 * model list can cause 404s at inference time, so a miss is safer than serving
 * outdated connectors.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

interface CachedEisConnectors {
  connectors: Record<string, object>;
  fetched_at_ms: number;
}

const CACHE_DIR = path.join(os.homedir(), '.elastic');
const CACHE_PATH = path.join(CACHE_DIR, 'eis-connectors-cache.json');
const TTL_MS = 168 * 60 * 60 * 1000; // 7 days

export const readCachedEisConnectors = (): Record<string, object> | undefined => {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return undefined;
    }

    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const cached: CachedEisConnectors = JSON.parse(raw);

    if (!cached.connectors || !cached.fetched_at_ms) {
      return undefined;
    }

    const age = Date.now() - cached.fetched_at_ms;
    if (age > TTL_MS) {
      return undefined;
    }

    // Caches written before the switch to inference endpoints hold stack-connector
    // shapes (no inferenceId); loading those would fail every run until the TTL
    // expires, so treat them as a miss.
    const hasStaleShape = Object.values(cached.connectors).some(
      (connector) => typeof (connector as { inferenceId?: unknown }).inferenceId !== 'string'
    );
    if (hasStaleShape) {
      return undefined;
    }

    return cached.connectors;
  } catch {
    return undefined;
  }
};

export const writeCachedEisConnectors = (connectors: Record<string, object>): void => {
  const entry: CachedEisConnectors = {
    connectors,
    fetched_at_ms: Date.now(),
  };

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(entry, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
};
