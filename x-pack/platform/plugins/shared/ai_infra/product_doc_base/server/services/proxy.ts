/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProxyAgent, type Dispatcher } from 'undici';

export interface ArtifactRepositoryProxySettings {
  proxyUrl: string;
  proxyHeaders?: Record<string, string>;
  proxyRejectUnauthorizedCertificates?: boolean;
}

interface RequestInitWithDispatcher extends RequestInit {
  dispatcher?: Dispatcher;
}

type GetProxyDispatcherParams = ArtifactRepositoryProxySettings & { targetUrl: string };

function getProxyDispatcher(options: GetProxyDispatcherParams): ProxyAgent {
  const tlsOptions =
    options.proxyRejectUnauthorizedCertificates === false
      ? { rejectUnauthorized: false as const }
      : undefined;

  return new ProxyAgent({
    uri: options.proxyUrl,
    // Only pass explicit proxyHeaders. Do not set Host here: undici ProxyAgent already
    // sets it for CONNECT requests, and adding Host causes UND_ERR_INVALID_ARG.
    ...(options.proxyHeaders ? { headers: options.proxyHeaders } : {}),
    ...(tlsOptions ? { proxyTls: tlsOptions, requestTls: tlsOptions } : {}),
  });
}

/**
 * Get fetch options for making HTTP requests.
 * If proxyUrl is defined, use it as a proxy for requests to targetUrl.
 * If proxyUrl is not defined, return empty options (direct request to targetUrl).
 */
export function getFetchOptions(targetUrl: string, proxyUrl?: string): RequestInitWithDispatcher {
  if (!proxyUrl) {
    return {};
  }

  return {
    dispatcher: getProxyDispatcher({ proxyUrl, targetUrl }),
  };
}
