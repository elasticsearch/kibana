/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({ close: jest.fn().mockResolvedValue(undefined) })),
}));

import { rootCertificates } from 'node:tls';
import { Agent } from 'undici';
import type { IBasePath } from '@kbn/core-http-server';
import type { HttpConfig } from './http_config';
import { SelfHttpDispatcherProvider } from './self_client_dispatcher';

type VerificationMode = HttpConfig['selfHttp']['ssl']['verificationMode'];

const AgentMock = Agent as unknown as jest.Mock;

const PUBLIC_BASE_URL = 'https://kibana.example.com';
const HTTPS_URL = new URL('https://kibana.example.com/api/status');

const createProvider = ({
  verificationMode = 'full',
  certificateAuthorities,
  serverCertificate,
  target = 'auto',
  publicBaseUrl = PUBLIC_BASE_URL,
}: {
  verificationMode?: VerificationMode;
  certificateAuthorities?: string[];
  serverCertificate?: string;
  target?: 'auto' | 'local';
  publicBaseUrl?: string;
} = {}) => {
  const getHttpConfig = jest.fn(
    () =>
      ({
        ssl: { enabled: true, requestCert: false, certificate: serverCertificate },
        selfHttp: { ssl: { verificationMode, certificateAuthorities } },
      } as HttpConfig)
  );

  const provider = new SelfHttpDispatcherProvider({
    basePath: { publicBaseUrl } as IBasePath,
    getHttpConfig,
    target,
  });

  return { provider, getHttpConfig };
};

const connectOptionsOf = (callIndex: number) => AgentMock.mock.calls[callIndex][0].connect;

describe('SelfHttpDispatcherProvider', () => {
  beforeEach(() => {
    AgentMock.mockClear();
  });

  it('returns no dispatcher for plain HTTP targets regardless of verification mode', () => {
    const { provider } = createProvider({
      verificationMode: 'none',
      certificateAuthorities: ['public CA'],
    });

    expect(provider.get(new URL('http://kibana.example.com/api/status'))).toBeUndefined();
    expect(AgentMock).not.toHaveBeenCalled();
  });

  describe('with configured certificate authorities', () => {
    it('verifies the chain and the hostname in full mode', () => {
      const { provider } = createProvider({
        verificationMode: 'full',
        certificateAuthorities: ['public CA'],
      });

      expect(provider.get(HTTPS_URL)).toBeDefined();
      expect(AgentMock).toHaveBeenCalledTimes(1);
      expect(connectOptionsOf(0)).toEqual({
        ca: [...rootCertificates, 'public CA'],
        allowPartialTrustChain: true,
        rejectUnauthorized: true,
      });
      expect(connectOptionsOf(0)).not.toHaveProperty('checkServerIdentity');
    });

    it('verifies the chain but skips the hostname check in certificate mode', () => {
      const { provider } = createProvider({
        verificationMode: 'certificate',
        certificateAuthorities: ['public CA'],
      });

      provider.get(HTTPS_URL);

      const connect = connectOptionsOf(0);
      expect(connect.ca).toEqual([...rootCertificates, 'public CA']);
      expect(connect.allowPartialTrustChain).toBe(true);
      expect(connect.rejectUnauthorized).toBe(true);
      expect(connect.checkServerIdentity('other.example.com', {})).toBeUndefined();
    });

    it('skips verification entirely in none mode', () => {
      const { provider } = createProvider({
        verificationMode: 'none',
        certificateAuthorities: ['public CA'],
      });

      expect(provider.get(HTTPS_URL)).toBeDefined();
      expect(connectOptionsOf(0).rejectUnauthorized).toBe(false);
    });
  });

  describe('without configured certificate authorities', () => {
    it('defers to the global dispatcher in full mode', () => {
      const { provider } = createProvider({ verificationMode: 'full' });

      expect(provider.get(HTTPS_URL)).toBeUndefined();
      expect(AgentMock).not.toHaveBeenCalled();
    });

    it('builds an agent that keeps the default trust store in certificate mode', () => {
      const { provider } = createProvider({ verificationMode: 'certificate' });

      expect(provider.get(HTTPS_URL)).toBeDefined();
      expect(AgentMock).toHaveBeenCalledTimes(1);

      const connect = connectOptionsOf(0);
      expect(connect).not.toHaveProperty('ca');
      expect(connect).not.toHaveProperty('allowPartialTrustChain');
      expect(connect.rejectUnauthorized).toBe(true);
      expect(connect.checkServerIdentity('other.example.com', {})).toBeUndefined();
    });

    it('builds an agent rather than deferring to the global dispatcher in none mode', () => {
      const { provider } = createProvider({ verificationMode: 'none' });

      expect(provider.get(HTTPS_URL)).toBeDefined();
      expect(AgentMock).toHaveBeenCalledTimes(1);
      expect(connectOptionsOf(0)).toEqual({ rejectUnauthorized: false });
    });
  });

  describe('local target', () => {
    it("trusts the listener's own certificate in full mode", () => {
      const { provider } = createProvider({
        verificationMode: 'full',
        target: 'local',
        serverCertificate: 'local server certificate',
      });

      provider.get(HTTPS_URL);

      expect(connectOptionsOf(0)).toEqual({
        ca: [...rootCertificates, 'local server certificate'],
        allowPartialTrustChain: true,
        rejectUnauthorized: true,
      });
    });

    it('skips verification in none mode', () => {
      const { provider } = createProvider({
        verificationMode: 'none',
        target: 'local',
        serverCertificate: 'local server certificate',
      });

      provider.get(HTTPS_URL);

      expect(connectOptionsOf(0).rejectUnauthorized).toBe(false);
    });
  });

  describe('caching', () => {
    it('reuses the agent while the trust configuration is unchanged', () => {
      const { provider } = createProvider({
        verificationMode: 'certificate',
        certificateAuthorities: ['public CA'],
      });

      expect(provider.get(HTTPS_URL)).toBe(provider.get(HTTPS_URL));
      expect(AgentMock).toHaveBeenCalledTimes(1);
    });

    it('closes the agent and defers to the global dispatcher when a reload restores full mode', () => {
      let verificationMode: VerificationMode = 'certificate';
      let certificateAuthorities: string[] | undefined = ['public CA'];
      const provider = new SelfHttpDispatcherProvider({
        basePath: { publicBaseUrl: PUBLIC_BASE_URL } as IBasePath,
        getHttpConfig: jest.fn(
          () =>
            ({
              ssl: { enabled: true, requestCert: false },
              selfHttp: { ssl: { verificationMode, certificateAuthorities } },
            } as HttpConfig)
        ),
        target: 'auto',
      });

      expect(provider.get(HTTPS_URL)).toBeDefined();

      verificationMode = 'full';
      certificateAuthorities = undefined;

      expect(provider.get(HTTPS_URL)).toBeUndefined();
      expect(AgentMock).toHaveBeenCalledTimes(1);
      expect(AgentMock.mock.results[0].value.close).toHaveBeenCalled();
    });

    it('replaces and closes the agent when the verification mode changes', () => {
      let verificationMode: VerificationMode = 'full';
      const provider = new SelfHttpDispatcherProvider({
        basePath: { publicBaseUrl: PUBLIC_BASE_URL } as IBasePath,
        getHttpConfig: jest.fn(
          () =>
            ({
              ssl: { enabled: true, requestCert: false },
              selfHttp: { ssl: { verificationMode, certificateAuthorities: ['public CA'] } },
            } as HttpConfig)
        ),
        target: 'auto',
      });

      const first = provider.get(HTTPS_URL);
      verificationMode = 'none';
      const second = provider.get(HTTPS_URL);

      expect(second).not.toBe(first);
      expect(AgentMock).toHaveBeenCalledTimes(2);
      expect(AgentMock.mock.results[0].value.close).toHaveBeenCalled();
      expect(connectOptionsOf(1).rejectUnauthorized).toBe(false);
    });
  });
});
