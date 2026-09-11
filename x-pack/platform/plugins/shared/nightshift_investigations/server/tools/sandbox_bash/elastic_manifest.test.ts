/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { SandboxApiClient } from './grpc_client';
import { renderElasticManifest, writeElasticManifest } from './elastic_manifest';

describe('renderElasticManifest', () => {
  it('tells the agent which connector id unlocks the credentials', () => {
    const content = renderElasticManifest('elasticsearch-telemetry');

    expect(content).toContain('`connector_id: "elasticsearch-telemetry"`');
    expect(content).toContain('`CONNECTOR_CONFIG_URL`');
    expect(content).toContain('`CONNECTOR_SECRET_PASSWORD`');
    expect(content).toContain('never hard-code their values');
  });

  it('documents the readable indices and a query example', () => {
    const content = renderElasticManifest('elasticsearch-telemetry');

    expect(content).toContain('`logs-*`, `metrics-*`, `traces-*`');
    expect(content).toContain('"$CONNECTOR_CONFIG_URL/_query"');
  });
});

describe('writeElasticManifest', () => {
  it('writes the manifest to /workspace/elastic.md', async () => {
    const writeFiles = jest.fn().mockResolvedValue(undefined);
    const apiClient = { writeFiles } as unknown as SandboxApiClient;

    await writeElasticManifest({
      conversationId: 'conversation-1',
      apiClient,
      connectorId: 'elasticsearch-telemetry',
      logger: loggingSystemMock.createLogger(),
    });

    expect(writeFiles).toHaveBeenCalledWith('conversation-1', [
      { path: '/workspace/elastic.md', content: expect.any(Buffer) },
    ]);
    const [, files] = writeFiles.mock.calls[0];
    expect(files[0].content.toString('utf8')).toContain('# Elasticsearch telemetry');
  });
});
