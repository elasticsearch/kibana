/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Agent as HttpsAgent } from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Logger } from '@kbn/logging';
import { getCustomAgents } from './get_custom_agents';
import type { CustomHostSettings, ProxySettings, SSLSettings } from './types';

const logger = {
  debug: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger;

const targetHost = 'elastic.co';
const targetUrl = `https://${targetHost}/foo/bar/baz`;
const targetUrlCanonical = `https://${targetHost}:443`;
const nonMatchingUrl = `https://${targetHost}m/foo/bar/baz`;

const defaultSSLSettings = {
  verificationMode: 'full',
} as SSLSettings;

describe('getCustomAgents', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('get agents for valid proxy URL', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
  });

  test('passes target SSL overrides to the CONNECT-upgraded TLS request', async () => {
    const connectSpy = jest
      .spyOn(HttpsProxyAgent.prototype, 'connect')
      .mockResolvedValue({} as Awaited<ReturnType<HttpsProxyAgent<string>['connect']>>);
    const proxySettings = {
      proxyUrl: 'http://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;

    const { httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslOverrides: {
        verificationMode: 'none',
      },
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });

    try {
      await (httpsAgent as unknown as HttpsProxyAgent<string>).connect(
        {} as Parameters<HttpsProxyAgent<string>['connect']>[0],
        {
          host: targetHost,
          port: 443,
          secureEndpoint: true,
        } as Parameters<HttpsProxyAgent<string>['connect']>[1]
      );

      expect(connectSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          rejectUnauthorized: false,
        })
      );
    } finally {
      connectSpy.mockRestore();
    }
  });

  test('return default agents for invalid proxy URL', () => {
    const proxySettings = {
      proxyUrl: ':nope: not a valid URL',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent).toBe(undefined);
    expect(httpsAgent instanceof HttpsAgent).toBeTruthy();
  });

  test('return default agents for undefined proxy options', () => {
    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent).toBe(undefined);
    expect(httpsAgent instanceof HttpsAgent).toBeTruthy();
  });

  test('returns non-proxy agents for matching proxyBypassHosts', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: new Set([targetHost]),
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeFalsy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeFalsy();
  });

  test('returns proxy agents for non-matching proxyBypassHosts', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: new Set([targetHost]),
      proxyOnlyHosts: undefined,
    } as ProxySettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: nonMatchingUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
  });

  test('returns proxy agents for matching proxyOnlyHosts', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: new Set([targetHost]),
    } as ProxySettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
  });

  test('returns non-proxy agents for non-matching proxyOnlyHosts', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: new Set([targetHost]),
    } as ProxySettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: nonMatchingUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeFalsy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeFalsy();
  });

  test('handles custom host settings', () => {
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'none',
        certificateAuthoritiesData: 'ca data here',
      },
    } as CustomHostSettings;

    const { httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpsAgent?.options.ca).toBe('ca data here');
    expect(httpsAgent?.options.rejectUnauthorized).toBe(false);
  });

  test('handles custom host settings with proxy', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'none',
        certificateAuthoritiesData: 'ca data here',
      },
    } as CustomHostSettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();

    expect(httpsAgent?.options.ca).toBe('ca data here');
    expect(httpsAgent?.options.rejectUnauthorized).toBe(false);
  });

  test('sets auth on HttpsProxyAgent when proxy URL contains credentials', () => {
    const proxySettings = {
      proxyUrl: 'https://proxyuser:proxypass@someproxyhost:8080',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const { httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
    expect((httpsAgent as HttpsProxyAgent<string>).proxy.username).toBe('proxyuser');
    expect((httpsAgent as HttpsProxyAgent<string>).proxy.password).toBe('proxypass');
  });

  test('does not set auth on HttpsProxyAgent when proxy URL has no credentials', () => {
    const proxySettings = {
      proxyUrl: 'https://someproxyhost:8080',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;
    const { httpsAgent } = getCustomAgents({
      logger,
      proxySettings,
      sslSettings: defaultSSLSettings,
      url: targetUrl,
    });
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
    expect((httpsAgent as HttpsProxyAgent<string>).proxy.username).toBe('');
    expect((httpsAgent as HttpsProxyAgent<string>).proxy.password).toBe('');
  });

  test('handles overriding global verificationMode "none"', () => {
    const sslSettings = {
      verificationMode: 'none',
    } as SSLSettings;
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'certificate',
      },
    } as CustomHostSettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      sslSettings,
      url: targetUrl,
    });

    expect(httpAgent instanceof HttpProxyAgent).toBeFalsy();
    expect(httpsAgent instanceof HttpsAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeFalsy();
    expect(httpsAgent?.options.rejectUnauthorized).toBeTruthy();
  });

  test('handles overriding global verificationMode "full"', () => {
    const sslSettings = {
      verificationMode: 'full',
    } as SSLSettings;
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'none',
      },
    } as CustomHostSettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      sslSettings,
      url: targetUrl,
    });

    expect(httpAgent instanceof HttpProxyAgent).toBeFalsy();
    expect(httpsAgent instanceof HttpsAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeFalsy();
    expect(httpsAgent?.options.rejectUnauthorized).toBeFalsy();
  });

  test('handles overriding global verificationMode "none" with a proxy', () => {
    const sslSettings = {
      verificationMode: 'none',
    } as SSLSettings;
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'full',
      },
    } as CustomHostSettings;
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      // note: this setting doesn't come into play, it's for the connection to
      // the proxy, not the target url
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      proxySettings,
      sslSettings,
      url: targetUrl,
    });

    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
    expect(httpsAgent?.options.rejectUnauthorized).toBeTruthy();
  });

  test('handles overriding global verificationMode "full" with a proxy', () => {
    const sslSettings = {
      verificationMode: 'full',
    } as SSLSettings;
    const customHostSettings = {
      url: targetUrlCanonical,
      ssl: {
        verificationMode: 'none',
      },
    } as CustomHostSettings;
    const proxySettings = {
      proxyUrl: 'https://someproxyhost',
      // note: this setting doesn't come into play, it's for the connection to
      // the proxy, not the target url
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    } as ProxySettings;

    const { httpAgent, httpsAgent } = getCustomAgents({
      customHostSettings,
      logger,
      proxySettings,
      sslSettings,
      url: targetUrl,
    });
    expect(httpAgent instanceof HttpProxyAgent).toBeTruthy();
    expect(httpsAgent instanceof HttpsProxyAgent).toBeTruthy();
    expect(httpsAgent?.options.rejectUnauthorized).toBeFalsy();
  });
});
