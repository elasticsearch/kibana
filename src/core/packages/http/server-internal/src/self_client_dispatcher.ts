/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { rootCertificates } from 'node:tls';
import { Agent, type Dispatcher } from 'undici';
import type { IBasePath } from '@kbn/core-http-server';
import type { HttpConfig } from './http_config';

type VerificationMode = HttpConfig['selfHttp']['ssl']['verificationMode'];

type ConnectOptions = NonNullable<Agent.Options['connect']>;

interface SelfHttpDispatcherProviderParams {
  readonly basePath: IBasePath;
  readonly getHttpConfig: () => HttpConfig;
  readonly target: 'auto' | 'local';
}

const buildConnectOptions = (
  verificationMode: VerificationMode,
  certificateAuthorities: string[]
): ConnectOptions => {
  // Omitting `ca` keeps Node's default trust store, which includes NODE_EXTRA_CA_CERTS.
  // Passing `rootCertificates` instead would replace it and trust less than `full` does.
  const connect: ConnectOptions =
    certificateAuthorities.length === 0
      ? {}
      : { ca: [...rootCertificates, ...certificateAuthorities], allowPartialTrustChain: true };

  switch (verificationMode) {
    case 'none':
      return { ...connect, rejectUnauthorized: false };
    case 'certificate':
      return { ...connect, rejectUnauthorized: true, checkServerIdentity: () => undefined };
    case 'full':
      return { ...connect, rejectUnauthorized: true };
    default:
      throw new Error(`Unknown selfHttp.ssl.verificationMode: ${verificationMode}`);
  }
};

export class SelfHttpDispatcherProvider {
  private dispatcher?: Agent;
  private trustKey?: string;

  constructor(private readonly params: SelfHttpDispatcherProviderParams) {}

  public get(url: URL): Dispatcher | undefined {
    if (url.protocol !== 'https:') {
      return undefined;
    }

    const config = this.params.getHttpConfig();
    const usesLocalTarget =
      this.params.target === 'local' ||
      (this.params.target === 'auto' && !this.params.basePath.publicBaseUrl);
    // Local self calls loop back to this listener, so trust its leaf certificate directly.
    const additionalCertificateAuthorities = usesLocalTarget
      ? [config.ssl.certificate, ...(config.ssl.certificateAuthorities ?? [])]
      : config.selfHttp.ssl.certificateAuthorities ?? [];
    const certificateAuthorities = additionalCertificateAuthorities.filter(
      (certificate): certificate is string => certificate !== undefined
    );

    const { verificationMode } = config.selfHttp.ssl;

    // Node's global dispatcher already verifies fully, so it only stays usable in `full` mode.
    if (certificateAuthorities.length === 0 && verificationMode === 'full') {
      this.replaceDispatcher(undefined, undefined);
      return undefined;
    }

    const trustKey = `${
      usesLocalTarget ? 'local' : 'public'
    }:${verificationMode}:${certificateAuthorities.join('\n')}`;
    if (this.dispatcher && this.trustKey === trustKey) {
      return this.dispatcher;
    }

    this.replaceDispatcher(
      new Agent({ connect: buildConnectOptions(verificationMode, certificateAuthorities) }),
      trustKey
    );
    return this.dispatcher;
  }

  public async close(): Promise<void> {
    const dispatcher = this.dispatcher;
    this.dispatcher = undefined;
    this.trustKey = undefined;
    await dispatcher?.close();
  }

  private replaceDispatcher(dispatcher: Agent | undefined, trustKey: string | undefined): void {
    const previousDispatcher = this.dispatcher;
    this.dispatcher = dispatcher;
    this.trustKey = trustKey;
    if (previousDispatcher && previousDispatcher !== dispatcher) {
      void previousDispatcher.close();
    }
  }
}
