/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@elastic/elasticsearch';
import { createKibanaClient } from '@kbn/kibana-api-cli';
import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Connects to the cluster a developer CLI in this suite should act on.
 *
 * `--es-url` reaches Elasticsearch directly, with credentials embedded in the URL, which is what
 * a remote cluster needs. Without it, requests are proxied through Kibana, which picks up a local
 * dev setup without any flags at all.
 */
export const createEsClient = async ({
  esUrl,
  kibanaUrl,
  log,
}: {
  esUrl: string | undefined;
  kibanaUrl: string | undefined;
  log: ToolingLog;
}): Promise<Client> => {
  if (esUrl) {
    const { protocol, host, pathname, username, password } = new URL(esUrl);

    return new Client({
      node: `${protocol}//${host}${pathname}`,
      auth: username && password ? { username, password } : undefined,
    });
  }

  const kibanaClient = await createKibanaClient({
    log,
    signal: new AbortController().signal,
    baseUrl: kibanaUrl,
  });

  return kibanaClient.es;
};

export const ES_CONNECTION_FLAGS = ['es-url', 'kibana-url'] as const;

export const ES_CONNECTION_FLAGS_HELP = `
      --es-url            Elasticsearch URL, credentials included
                          Example: http://elastic:changeme@localhost:9200

      --kibana-url        Kibana URL to proxy Elasticsearch requests through, used when
                          --es-url is omitted
                          Example: http://localhost:5601
`;
