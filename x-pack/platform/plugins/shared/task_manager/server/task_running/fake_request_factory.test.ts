/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { buildChildRequestEnricher, buildTaskFakeRequest } from './fake_request_factory';

describe('buildTaskFakeRequest', () => {
  const apiKey = 'abc';

  it('returns undefined when no API key is provided', () => {
    expect(buildTaskFakeRequest({ enrichFakeRequest: jest.fn() })).toBeUndefined();
  });

  it('builds a fake request with the ApiKey authorization header', () => {
    const fakeRequest = buildTaskFakeRequest({ apiKey });
    expect(fakeRequest).toBeDefined();
    expect(fakeRequest!.headers.authorization).toBe(`ApiKey ${apiKey}`);
    expect(fakeRequest!.isFakeRequest).toBe(true);
  });

  it('uses the default space when none is provided', () => {
    const fakeRequest = buildTaskFakeRequest({ apiKey });
    expect(fakeRequest!.spaceId).toBe('default');
  });

  it('respects a supplied space id', () => {
    const fakeRequest = buildTaskFakeRequest({ apiKey, spaceId: 'team-a' });
    expect(fakeRequest!.spaceId).toBe('team-a');
  });

  it('does not call the enrichment hook when userProfileId is absent', () => {
    const enrichFakeRequest = jest.fn();
    buildTaskFakeRequest({ apiKey, enrichFakeRequest });
    expect(enrichFakeRequest).not.toHaveBeenCalled();
  });

  it('does not call the enrichment hook when none is supplied', () => {
    expect(() => buildTaskFakeRequest({ apiKey, userProfileId: 'u_1' })).not.toThrow();
  });

  it('enriches the fake request when both userProfileId and enricher are present', () => {
    const enrichFakeRequest = jest.fn();
    const fakeRequest = buildTaskFakeRequest({
      apiKey,
      userProfileId: 'u_1',
      enrichFakeRequest,
    });
    expect(enrichFakeRequest).toHaveBeenCalledTimes(1);
    expect(enrichFakeRequest).toHaveBeenCalledWith(fakeRequest, 'u_1');
  });
});

describe('buildChildRequestEnricher', () => {
  it('returns undefined when userProfileId is absent', () => {
    expect(buildChildRequestEnricher({ enrichFakeRequest: jest.fn() })).toBeUndefined();
  });

  it('returns undefined when the enricher is missing', () => {
    expect(buildChildRequestEnricher({ userProfileId: 'u_1' })).toBeUndefined();
  });

  it('returns a function that forwards the bound profile to the enricher', () => {
    const enrichFakeRequest = jest.fn();
    const enricher = buildChildRequestEnricher({
      userProfileId: 'u_42',
      enrichFakeRequest,
    });
    expect(enricher).toBeInstanceOf(Function);

    const childRequest = { fake: 'child' } as unknown as KibanaRequest;
    enricher!(childRequest);
    expect(enrichFakeRequest).toHaveBeenCalledWith(childRequest, 'u_42');
  });
});
