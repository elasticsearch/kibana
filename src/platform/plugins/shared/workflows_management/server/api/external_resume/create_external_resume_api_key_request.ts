/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { FakeRawRequest, Headers } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';

export function createExternalResumeApiKeyRequest(
  encodedApiKey: string,
  spaceId: string
): KibanaRequest {
  const requestHeaders: Headers = {
    authorization: `ApiKey ${encodedApiKey}`,
  };
  const fakeRawRequest: FakeRawRequest = {
    headers: requestHeaders,
    spaceId: asSpaceId(spaceId),
  };
  return kibanaRequestFactory(fakeRawRequest);
}
