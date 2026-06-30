/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EXTERNAL_RESUME_API_PATH } from './constants';

export function buildExternalResumeUrl({
  kibanaUrl,
  spaceId,
  executionId,
  apiKey,
  approved,
}: {
  kibanaUrl: string;
  spaceId: string;
  executionId: string;
  apiKey: string;
  approved?: boolean;
}): string {
  const spacePrefix = spaceId === 'default' ? '' : `/s/${spaceId}`;
  const path = EXTERNAL_RESUME_API_PATH.replace('{executionId}', executionId);
  const url = new URL(`${kibanaUrl}${spacePrefix}${path}`);
  url.searchParams.set('apiKey', apiKey);
  if (approved !== undefined) {
    url.searchParams.set('approved', String(approved));
  }
  return url.toString();
}
