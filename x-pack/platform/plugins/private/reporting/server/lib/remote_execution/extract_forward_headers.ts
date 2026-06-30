/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0"; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';

const HEADER_ALLOWLIST = new Set([
  'authorization',
  'cookie',
  'elastic-api-version',
  'kbn-xsrf',
  'x-elastic-internal-origin',
  'x-elastic-internal-elasticsearch-host',
  'x-elastic-internal-kibana-host',
]);

export function extractReportingForwardHeaders(request: KibanaRequest): Record<string, string> {
  const forwardHeaders: Record<string, string> = {};

  for (const [name, raw] of Object.entries(request.headers)) {
    const keyLower = name.toLowerCase();
    if (!HEADER_ALLOWLIST.has(keyLower)) {
      continue;
    }

    if (typeof raw === 'string' && raw.length > 0) {
      forwardHeaders[keyLower] = raw;
    } else if (Array.isArray(raw) && raw.length) {
      forwardHeaders[keyLower] = raw.filter(Boolean).join(', ');
    }
  }

  return forwardHeaders;
}
