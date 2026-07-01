/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveEarsUrl, getEarsEndpointsForProvider } from './url';

describe('resolveEarsUrl', () => {
  it('combines base URL and path', () => {
    expect(resolveEarsUrl('/github/oauth/token', 'https://ears.example.com')).toBe(
      'https://ears.example.com/github/oauth/token'
    );
  });

  it('strips trailing slash from base URL', () => {
    expect(resolveEarsUrl('/github/oauth/token', 'https://ears.example.com/')).toBe(
      'https://ears.example.com/github/oauth/token'
    );
  });

  it('prepends leading slash to path when missing', () => {
    expect(resolveEarsUrl('github/oauth/token', 'https://ears.example.com')).toBe(
      'https://ears.example.com/github/oauth/token'
    );
  });

  it('throws when earsBaseUrl is undefined', () => {
    expect(() => resolveEarsUrl('/github/oauth/token', undefined)).toThrow(
      'EARS base URL not configured. Please set xpack.actions.auth.ears.url in kibana.yml'
    );
  });

  it('throws when earsBaseUrl is an empty string', () => {
    expect(() => resolveEarsUrl('/github/oauth/token', '')).toThrow(
      'EARS base URL not configured. Please set xpack.actions.auth.ears.url in kibana.yml'
    );
  });
});

describe('getEarsEndpointsForProvider', () => {
  it.each(['google', 'microsoft', 'slack'])(
    'returns authorize, token and refresh endpoints for supported provider "%s"',
    (provider) => {
      const { authorizeEndpoint, tokenEndpoint, refreshEndpoint } =
        getEarsEndpointsForProvider(provider);
      expect(authorizeEndpoint).toBe(`v1/${provider}/oauth/authorize`);
      expect(tokenEndpoint).toBe(`v1/${provider}/oauth/token`);
      expect(refreshEndpoint).toBe(`v1/${provider}/oauth/refresh`);
    }
  );

  it('throws when provider is undefined', () => {
    expect(() => getEarsEndpointsForProvider(undefined)).toThrow('Provider is not configured');
  });

  it('throws for an unsupported provider', () => {
    expect(() => getEarsEndpointsForProvider('okta')).toThrow('Unsupported provider: okta');
  });
});
