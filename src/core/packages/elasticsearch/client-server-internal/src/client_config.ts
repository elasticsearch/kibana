/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectionOptions as TlsConnectionOptions } from 'tls';
import { URL } from 'url';
import type { Duration } from 'moment';
import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import type { ElasticsearchClientConfig } from '@kbn/core-elasticsearch-server';
import type { AgentOptions } from 'https';
import { getDefaultHeaders } from './headers';

export type ParsedClientOptions = Omit<ClientOptions, 'agent'> & { agent: AgentOptions };

/**
 * Parse the client options from given client config and `scoped` flag.
 *
 * @param config The config to generate the client options from.
 * @param scoped if true, will adapt the configuration to be used by a scoped client
 *        (will remove basic auth and ssl certificates)
 */
export function parseClientOptions(
  config: ElasticsearchClientConfig,
  scoped: boolean,
  kibanaVersion: string
): ParsedClientOptions {
  const clientOptions: ParsedClientOptions = {
    sniffOnStart: config.sniffOnStart,
    sniffOnConnectionFault: config.sniffOnConnectionFault,
    headers: {
      ...getDefaultHeaders(kibanaVersion),
      ...config.customHeaders,
    },
    // do not make assumption on user-supplied data content
    // fixes https://github.com/elastic/kibana/issues/101944
    disablePrototypePoisoningProtection: true,
    agent: {
      maxTotalSockets: config.maxSockets,
      keepAlive: config.keepAlive ?? true,
      timeout: getDurationAsMs(config.idleSocketTimeout),
      maxFreeSockets: config.maxIdleSockets,
    },
    compression: config.compression,
  };

  if (config.maxResponseSize) {
    clientOptions.maxResponseSize = config.maxResponseSize.getValueInBytes();
    clientOptions.maxCompressedResponseSize = config.maxResponseSize.getValueInBytes();
  }

  if (config.requestTimeout != null) {
    clientOptions.requestTimeout = getDurationAsMs(config.requestTimeout);
  }
  if (config.sniffInterval != null) {
    clientOptions.sniffInterval =
      typeof config.sniffInterval === 'boolean'
        ? config.sniffInterval
        : getDurationAsMs(config.sniffInterval);
  }

  if (!scoped) {
    if (config.username && config.password) {
      clientOptions.auth = {
        username: config.username,
        password: config.password,
      };
    } else if (config.serviceAccountToken) {
      clientOptions.auth = {
        bearer: config.serviceAccountToken,
      };
    }
  }

  clientOptions.nodes = config.hosts.map((host) => convertHost(host));

  if (config.ssl) {
    clientOptions.tls = generateSslConfig(
      config.ssl,
      scoped && !config.ssl.alwaysPresentCertificate
    );
  }

  if (config.caFingerprint != null) {
    clientOptions.caFingerprint = config.caFingerprint;
  }

  return clientOptions;
}

const generateSslConfig = (
  sslConfig: Required<ElasticsearchClientConfig>['ssl'],
  ignoreCertAndKey: boolean
): TlsConnectionOptions => {
  const ssl: TlsConnectionOptions = {
    ca: sslConfig.certificateAuthorities,
  };

  const verificationMode = sslConfig.verificationMode;
  switch (verificationMode) {
    case 'none':
      ssl.rejectUnauthorized = false;
      break;
    case 'certificate':
      ssl.rejectUnauthorized = true;
      // by default, NodeJS is checking the server identify
      ssl.checkServerIdentity = () => undefined;
      break;
    case 'full':
      ssl.rejectUnauthorized = true;
      break;
    default:
      throw new Error(`Unknown ssl verificationMode: ${verificationMode}`);
  }

  // Add client certificate and key if required by elasticsearch
  if (!ignoreCertAndKey && sslConfig.certificate && sslConfig.key) {
    ssl.cert = sslConfig.certificate;
    ssl.key = sslConfig.key;
    ssl.passphrase = sslConfig.keyPassphrase;
  }

  return ssl;
};

const convertHost = (host: string): { url: URL } => {
  const url = new URL(host);
  const isHTTPS = url.protocol === 'https:';
  url.port = url.port || (isHTTPS ? '443' : '80');

  return {
    url,
  };
};

const getDurationAsMs = (duration: number | Duration) =>
  typeof duration === 'number' ? duration : duration.asMilliseconds();
