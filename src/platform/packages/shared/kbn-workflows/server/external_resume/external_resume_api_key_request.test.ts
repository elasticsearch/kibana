/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WORKFLOW_EXTERNAL_RESUME_APPLICATION } from './constants';
import {
  loadExternalResumeApiKeyMetadata,
  parseExternalResumeApiKeyMetadata,
} from './external_resume_api_key_request';

describe('external_resume_api_key_request', () => {
  const metadata = {
    application: WORKFLOW_EXTERNAL_RESUME_APPLICATION,
    workflow_execution_id: 'exec-1',
    workflow_id: 'wf-1',
    workflow_space_id: 'default',
    workflow_step_id: 'request-approval',
  };

  it('parses workflow resume metadata', () => {
    expect(parseExternalResumeApiKeyMetadata(metadata)).toEqual(metadata);
  });

  it('loads workflow resume metadata from Elasticsearch', async () => {
    const getApiKey = jest.fn().mockResolvedValue({
      api_keys: [{ id: 'api-key-id', metadata }],
    });

    await expect(
      loadExternalResumeApiKeyMetadata({ security: { getApiKey } } as never, 'api-key-id')
    ).resolves.toEqual(metadata);

    expect(getApiKey).toHaveBeenCalledWith({ id: 'api-key-id' });
  });
});
