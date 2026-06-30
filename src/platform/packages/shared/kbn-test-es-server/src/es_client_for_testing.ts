/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Url from 'url';
import * as Fs from 'fs';

import { CA_CERT_PATH } from '@kbn/dev-utils';
import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import { Client as EsClient, HttpConnection } from '@elastic/elasticsearch';

/** options for creating es instances used in functional testing scenarios */
export interface EsClientForTestingOptions extends Omit<ClientOptions, 'node' | 'nodes' | 'tls'> {
  /** url of es instance */
  esUrl: string;
  /** overwrite the auth embedded in the url to use a different user in this client instance */
  authOverride?: { username: string; password: string };
  /**
   * are we running tests against cloud? this is automatically determined
   * by checking for the TEST_CLOUD environment variable but can be overriden
   * for special cases
   */
  isCloud?: boolean;
}

export function createEsClientForTesting(options: EsClientForTestingOptions) {
  const {
    esUrl: _esUrl,
    authOverride,
    isCloud = !!process.env.TEST_CLOUD,
    ...otherOptions
  } = options;

  const url = options.authOverride
    ? Url.format({
        ...Url.parse(options.esUrl),
        auth: `${options.authOverride.username}:${options.authOverride.password}`,
      })
    : options.esUrl;

  return new EsClient({
    Connection: HttpConnection,
    requestTimeout: 30_000,
    tls: isCloud ? undefined : { ca: Fs.readFileSync(CA_CERT_PATH) },

    ...otherOptions,

    // force nodes config
    nodes: [url],
  });
}
