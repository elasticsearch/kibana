/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { getProxyAgent, getProxyAgentOptions } from './proxy';

describe('getProxyAgent', () => {
  test('return HttpsProxyAgent for https proxy url', () => {
    const agent = getProxyAgent({
      proxyUrl: 'https://proxyhost',
      targetUrl: 'https://targethost',
    });
    expect(agent instanceof HttpsProxyAgent).toBeTruthy();
  });

  test('return HttpProxyAgent for http proxy url', () => {
    const agent = getProxyAgent({
      proxyUrl: 'http://proxyhost',
      targetUrl: 'http://targethost',
    });
    expect(agent instanceof HttpProxyAgent).toBeTruthy();
  });
});

describe('getProxyAgentOptions', () => {
  test('return url only for https', () => {
    const httpsProxy = 'https://12.34.56.78:910';

    const optionsA = getProxyAgentOptions({
      proxyUrl: httpsProxy,
      targetUrl: 'https://targethost',
    });
    expect(optionsA).toEqual({
      headers: { Host: 'targethost' },
      host: '12.34.56.78',
      port: 910,
      protocol: 'https:',
      rejectUnauthorized: undefined,
    });

    const optionsB = getProxyAgentOptions({
      proxyUrl: httpsProxy,
      targetUrl: 'https://example.com/?a=b&c=d',
    });
    expect(optionsB).toEqual({
      headers: { Host: 'example.com' },
      host: '12.34.56.78',
      port: 910,
      protocol: 'https:',
      rejectUnauthorized: undefined,
    });

    // given http value and https proxy
    const optionsC = getProxyAgentOptions({
      proxyUrl: httpsProxy,
      targetUrl: 'http://example.com/?a=b&c=d',
    });
    expect(optionsC).toEqual({
      headers: { Host: 'example.com' },
      host: '12.34.56.78',
      port: 910,
      protocol: 'https:',
      rejectUnauthorized: undefined,
    });
  });
  describe('auth property', () => {
    describe('present & correct if given username and password', () => {
      test('proxy url is http', () => {
        const httpProxyWithAuth = {
          proxyUrl: 'http://user:pass@example.com:8080/p/a/t/h',
          targetUrl: 'https://epr.elastic.co/',
        };
        expect(getProxyAgentOptions(httpProxyWithAuth)).toEqual({
          username: 'user',
          password: 'pass',
          headers: { Host: 'epr.elastic.co' },
          host: 'example.com',
          port: 8080,
          protocol: 'http:',
          rejectUnauthorized: undefined,
        });
      });
      test('proxy url is https', () => {
        const httpsProxyWithAuth = {
          proxyUrl: 'https://user:pass@example.com:8080/p/a/t/h',
          targetUrl: 'https://epr.elastic.co/',
        };
        expect(getProxyAgentOptions(httpsProxyWithAuth)).toEqual({
          username: 'user',
          password: 'pass',
          headers: { Host: 'epr.elastic.co' },
          host: 'example.com',
          port: 8080,
          protocol: 'https:',
          rejectUnauthorized: undefined,
        });
      });
    });

    describe('missing if not given username and password', () => {
      test('proxy url is http', () => {
        const httpProxyWithout = {
          proxyUrl: 'http://example.com:8080/p/a/t/h',
          targetUrl: 'https://epr.elastic.co/',
        };
        expect(getProxyAgentOptions(httpProxyWithout)).toEqual({
          headers: { Host: 'epr.elastic.co' },
          host: 'example.com',
          port: 8080,
          protocol: 'http:',
          rejectUnauthorized: undefined,
        });
      });
      test('proxy url is https', () => {
        const httpsProxyWithoutAuth = {
          proxyUrl: 'https://example.com:8080/p/a/t/h',
          targetUrl: 'https://epr.elastic.co/',
        };
        expect(getProxyAgentOptions(httpsProxyWithoutAuth)).toEqual({
          headers: { Host: 'epr.elastic.co' },
          host: 'example.com',
          port: 8080,
          protocol: 'https:',
          rejectUnauthorized: undefined,
        });
      });
    });
  });
});
