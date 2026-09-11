/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { SandboxApiClient } from './grpc_client';

/** How to query cluster telemetry from the sandbox. Names env vars; never embeds secrets. */
export const renderElasticManifest = (connectorId: string): string =>
  [
    '# Elasticsearch telemetry',
    '',
    `Query this cluster by passing \`connector_id: "${connectorId}"\` to \`nightshift_sandbox_bash\`.`,
    'Credentials are not stored here: for that single command only, the environment contains',
    '',
    '- `CONNECTOR_CONFIG_URL` — Elasticsearch URL',
    '- `CONNECTOR_SECRET_PASSWORD` — Elasticsearch API key, used as `Authorization: ApiKey <key>`',
    '',
    'Reference those variables directly and never hard-code their values. A command that omits',
    '`connector_id` gets no credentials and cannot reach Elasticsearch.',
    '',
    'Readable indices: `logs-*`, `metrics-*`, `traces-*`.',
    '',
    '```bash',
    '# connector_id must be set on every one of these commands',
    'curl -s -H "Authorization: ApiKey $CONNECTOR_SECRET_PASSWORD" \\',
    '  -H "Content-Type: application/json" \\',
    '  "$CONNECTOR_CONFIG_URL/logs-*/_count"',
    '',
    'curl -s -H "Authorization: ApiKey $CONNECTOR_SECRET_PASSWORD" \\',
    '  -H "Content-Type: application/json" \\',
    '  "$CONNECTOR_CONFIG_URL/_query" \\',
    '  -d \'{"query":"FROM logs-* | WHERE @timestamp >= \\"2026-01-01T00:00:00Z\\" AND @timestamp < \\"2026-01-01T01:00:00Z\\" | STATS count = COUNT(*) BY service.name | SORT count DESC | LIMIT 20"}\'',
    '```',
    '',
  ].join('\n');

export const writeElasticManifest = async ({
  conversationId,
  apiClient,
  connectorId,
  logger,
}: {
  conversationId: string;
  apiClient: SandboxApiClient;
  connectorId: string;
  logger: Logger;
}): Promise<void> => {
  logger.debug(`Writing Elasticsearch manifest for conversation ${conversationId}`);

  await apiClient.writeFiles(conversationId, [
    {
      path: '/workspace/elastic.md',
      content: Buffer.from(renderElasticManifest(connectorId), 'utf8'),
    },
  ]);
};
