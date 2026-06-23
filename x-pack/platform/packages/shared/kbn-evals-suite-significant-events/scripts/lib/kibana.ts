/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fetch from 'node-fetch';
import type { ConnectionConfig } from './get_connection_config';

export { readKibanaConfig, resolveKibanaUrl } from '@kbn/otel-demo';

export function generateAuthHeader(config: ConnectionConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
}

export async function kibanaRequest(
  config: ConnectionConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${config.kibanaUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: generateAuthHeader(config),
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'create-sigevents-snapshots',
      // Public (/api/) and internal routes use different version schemes: public routes
      // are dated, internal versioned routes use integers. Unversioned internal routes
      // ignore the header, so sending '1' for everything under /internal/ is safe.
      'elastic-api-version': path.startsWith('/internal/') ? '1' : '2023-10-31',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => null);

  return { status: response.status, data };
}
