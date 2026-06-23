/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FakeRawRequest, Headers, KibanaRequest } from '@kbn/core/server';
import type { FakeRequestEnricher } from '@kbn/core-security-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';

interface BuildTaskFakeRequestOpts {
  apiKey?: string;
  spaceId?: string;
  userProfileId?: string;
  enrichFakeRequest?: FakeRequestEnricher;
}

/**
 * Builds the fake `KibanaRequest` used to execute a task. When the task has a
 * stored `userProfileId`, the request is also enriched so security APIs can
 * resolve the originating user via `getCurrentUser`. Returns `undefined` when
 * there is no API key (i.e. the task was scheduled without a user scope).
 */
export const buildTaskFakeRequest = ({
  apiKey,
  spaceId,
  userProfileId,
  enrichFakeRequest,
}: BuildTaskFakeRequestOpts): KibanaRequest | undefined => {
  if (!apiKey) return;

  const headers: Headers = { authorization: `ApiKey ${apiKey}` };
  const fakeRawRequest: FakeRawRequest = {
    headers,
    spaceId: asSpaceId(spaceId || 'default'),
  };

  const fakeRequest = kibanaRequestFactory(fakeRawRequest);

  if (userProfileId && enrichFakeRequest) {
    enrichFakeRequest(fakeRequest, userProfileId);
  }

  return fakeRequest;
};

/**
 * Returns a callback that mirrors the primary-request enrichment onto a child
 * fake request created by the running task. `undefined` when there is no
 * profile to propagate or no enrichment hook is wired.
 */
export const buildChildRequestEnricher = ({
  userProfileId,
  enrichFakeRequest,
}: {
  userProfileId?: string;
  enrichFakeRequest?: FakeRequestEnricher;
}): ((request: KibanaRequest) => void) | undefined => {
  if (!userProfileId || !enrichFakeRequest) return undefined;
  return (request) => enrichFakeRequest(request, userProfileId);
};
