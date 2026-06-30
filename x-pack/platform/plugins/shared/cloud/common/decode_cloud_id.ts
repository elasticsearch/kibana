/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';

export interface DecodedCloudId {
  host: string;
  defaultPort: string;
  elasticsearchClusterId: string;
  elasticsearchUrl: string;
  kibanaUrl: string;
}

// decodeCloudId decodes the c.id into c.esURL and c.kibURL
export function decodeCloudId(cid: string, logger: Logger): DecodedCloudId | undefined {
  // 1. Ignore anything before `:`.
  const id = cid.split(':').pop();
  if (!id) {
    logger.debug(`Unable to decode ${id}`);
    return;
  }

  // 2. base64 decode
  let decoded: string | undefined;
  try {
    decoded = Buffer.from(id, 'base64').toString('utf8');
  } catch {
    logger.debug(`base64 decoding failed on ${id}`);
    return;
  }

  // 3. separate based on `$`
  const words = decoded.split('$');
  if (words.length < 3) {
    logger.debug(`Expected at least 3 parts in ${decoded}`);
    return;
  }
  // 4. extract port from the ES and Kibana host
  const [host, defaultPort] = extractPortFromName(words[0]);
  const [esId, esPort] = extractPortFromName(words[1], defaultPort);
  const [kbId, kbPort] = extractPortFromName(words[2], defaultPort);
  // 5. form the URLs
  const esUrl = `https://${esId}.${host}:${esPort}`;
  const kbUrl = `https://${kbId}.${host}:${kbPort}`;
  return {
    host,
    defaultPort,
    elasticsearchClusterId: esId,
    elasticsearchUrl: esUrl,
    kibanaUrl: kbUrl,
  };
}

// extractPortFromName takes a string in the form `id:port` and returns the
// Id and the port. If there's no `:`, the default port is returned
function extractPortFromName(word: string, defaultPort = '443') {
  const [host, port = defaultPort] = word.split(':');
  return [host, port];
}
