/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { HttpsProxyAgentOptions } from 'https-proxy-agent';

import { appContextService } from '../..';

export interface RegistryProxySettings {
  proxyUrl: string;
  proxyHeaders?: Record<string, string>;
  proxyRejectUnauthorizedCertificates?: boolean;
}

type ProxyAgent = HttpsProxyAgent<string> | HttpProxyAgent<string>;
type GetProxyAgentParams = RegistryProxySettings & { targetUrl: string };

export function getRegistryProxyUrl(): string | undefined {
  const proxyUrl = appContextService.getConfig()?.registryProxyUrl;
  return proxyUrl;
}

export function getProxyAgent(options: GetProxyAgentParams): ProxyAgent {
  const isHttps = options.targetUrl.startsWith('https:');
  const agentOptions = getProxyAgentOptions(options);
  const agent: ProxyAgent = isHttps
    ? new HttpsProxyAgent(options.proxyUrl, agentOptions)
    : new HttpProxyAgent(options.proxyUrl, agentOptions);

  return agent;
}

export function getProxyAgentOptions(options: GetProxyAgentParams): HttpsProxyAgentOptions<string> {
  const endpointParsed = new URL(options.targetUrl);
  const proxyParsed = new URL(options.proxyUrl);

  return {
    host: proxyParsed.hostname,
    port: Number(proxyParsed.port),
    protocol: proxyParsed.protocol,
    ...(proxyParsed.username && { username: proxyParsed.username, password: proxyParsed.password }),
    // The headers to send
    headers: options.proxyHeaders || {
      // the proxied URL's host is put in the header instead of the server's actual host
      Host: endpointParsed.host,
    },
    // do not fail on invalid certs if value is false
    rejectUnauthorized: options.proxyRejectUnauthorizedCertificates,
  };
}
