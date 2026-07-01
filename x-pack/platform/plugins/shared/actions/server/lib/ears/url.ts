/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EARS_PROVIDERS } from '@kbn/connector-specs';

const SUPPORTED_EARS_PROVIDERS = new Set<string>(EARS_PROVIDERS);
const EARS_API_VERSION = 'v1';

export function resolveEarsUrl(urlPath: string, earsBaseUrl: string | undefined): string {
  if (!earsBaseUrl) {
    throw new Error(
      'EARS base URL not configured. Please set xpack.actions.auth.ears.url in kibana.yml'
    );
  }

  const base = earsBaseUrl.replace(/\/$/, ''); // strip trailing slash if any present
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;

  return `${base}${path}`;
}

export interface EarsEndpoints {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  refreshEndpoint: string;
}

export function getEarsEndpointsForProvider(provider: string | undefined): EarsEndpoints {
  if (!provider) {
    throw new Error('Provider is not configured');
  }
  if (!SUPPORTED_EARS_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return {
    authorizeEndpoint: `${EARS_API_VERSION}/${provider}/oauth/authorize`,
    tokenEndpoint: `${EARS_API_VERSION}/${provider}/oauth/token`,
    refreshEndpoint: `${EARS_API_VERSION}/${provider}/oauth/refresh`,
  };
}
