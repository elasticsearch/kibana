/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProxyAgent } from 'undici';
import { getFetchOptions } from './proxy';

describe('getFetchOptions', () => {
  const targetUrl = 'https://kibana-knowledge-base-artifacts.elastic.co';

  it('returns empty options when no proxy is configured', () => {
    expect(getFetchOptions(targetUrl)).toEqual({});
  });

  it('returns an undici ProxyAgent dispatcher when a proxy is configured', () => {
    const proxyUrl = 'http://proxy.example.com:3128';
    const fetchOptions = getFetchOptions(targetUrl, proxyUrl);

    expect(fetchOptions.dispatcher).toBeInstanceOf(ProxyAgent);
    expect(fetchOptions).not.toHaveProperty('agent');
  });
});
