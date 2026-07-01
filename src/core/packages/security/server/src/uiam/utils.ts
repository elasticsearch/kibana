/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { HTTPAuthorizationHeader } from '../authentication';

const UIAM_CREDENTIALS_PREFIX = 'essu_';

/**
 * Marker header set by trusted, in-process Kibana callers (e.g. the workflows execution engine) on
 * loopback HTTP requests that authenticate with an *internal* UIAM API key. It tells the HTTP
 * authentication provider to attach the UIAM client-authentication shared secret when validating the
 * credential against Elasticsearch.
 */
export const UIAM_INTERNAL_CLIENT_AUTH_HEADER = 'x-kbn-uiam-internal-client-auth';

/**
 * Checks if the given authorization credentials are UIAM credentials.
 *
 * @param credential The HTTP authorization header or access token to check.
 * @returns True if the credentials start with UIAM_CREDENTIALS_PREFIX, false otherwise.
 */
export function isUiamCredential(credential: HTTPAuthorizationHeader | string) {
  return (
    credential instanceof HTTPAuthorizationHeader ? credential.credentials : credential
  ).startsWith(UIAM_CREDENTIALS_PREFIX);
}
