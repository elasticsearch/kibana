/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest as baseSpaceTest } from '@kbn/scout-security';
import type { ScoutWorkerFixtures } from '@kbn/scout-security';
import { createLlmProxy, type LlmProxy } from '@kbn/ftr-llm-proxy';

const XSRF = { 'kbn-xsrf': 'scout-security-solution' };

interface AgentBuilderWorkerFixtures extends ScoutWorkerFixtures {
  llmProxy: LlmProxy;
}

export const spaceTest = baseSpaceTest.extend<{}, AgentBuilderWorkerFixtures>({
  llmProxy: [
    // scoutSpace is declared first so Playwright sets up the test space before the proxy,
    // avoiding concurrent initialization that can delay Sourcerer setup.
    async ({ log, kbnClient, scoutSpace }, use) => {
      const proxy = await createLlmProxy(log);

      // Create the connector inside the test space so EmbeddableAccessBoundary finds it.
      await kbnClient.request({
        method: 'POST',
        path: `/s/${scoutSpace.id}/api/actions/connector`,
        headers: XSRF,
        body: {
          name: `scout-llm-proxy-${scoutSpace.id}`,
          config: {
            apiProvider: 'OpenAI',
            apiUrl: `http://localhost:${proxy.getPort()}`,
            defaultModel: 'gpt-4',
          },
          secrets: { apiKey: 'test-key' },
          connector_type_id: '.gen-ai',
        },
      });

      await use(proxy);

      proxy.close();

      const list = await kbnClient.request<Array<{ id: string; name: string }>>({
        method: 'GET',
        path: `/s/${scoutSpace.id}/api/actions/connectors`,
      });
      const connectors = Array.isArray(list.data) ? list.data : [];
      await Promise.all(
        connectors
          .filter((c) => c.name === `scout-llm-proxy-${scoutSpace.id}`)
          .map((c) =>
            kbnClient.request({
              method: 'DELETE',
              path: `/s/${scoutSpace.id}/api/actions/connector/${encodeURIComponent(c.id)}`,
              headers: XSRF,
            })
          )
      );
    },
    { scope: 'worker', auto: false },
  ],
});

export { tags } from '@kbn/scout-security';
