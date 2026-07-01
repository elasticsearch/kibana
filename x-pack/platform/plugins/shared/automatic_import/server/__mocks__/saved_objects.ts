/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser, SavedObject } from '@kbn/core/server';
import type {
  DataStreamAttributes,
  IntegrationAttributes,
} from '../services/saved_objects/schemas/types';
import {
  DATA_STREAM_SAVED_OBJECT_TYPE,
  INTEGRATION_SAVED_OBJECT_TYPE,
  TASK_STATUSES,
  INPUT_TYPES,
} from '../services/saved_objects/constants';
import type { IntegrationParams, DataStreamParams } from '../routes/types';

export const mockAuthenticatedUser: AuthenticatedUser = {
  username: 'test-user',
  roles: ['admin'],
  full_name: 'Test User',
  email: 'test@example.com',
  enabled: true,
  authentication_realm: { name: 'native', type: 'native' },
  lookup_realm: { name: 'native', type: 'native' },
  authentication_provider: { name: 'basic', type: 'basic' },
  authentication_type: 'realm',
  elastic_cloud_user: false,
  profile_uid: 'test-profile-uid',
  http_authentication_scheme: null,
};

export const mockIntegrationParams: IntegrationParams = {
  integrationId: 'test-integration-id',
  title: 'Test Integration',
  description: 'A test integration',
  logo: 'test-logo',
};

export const mockDataStreamParams: DataStreamParams = {
  integrationId: 'test-integration-id',
  dataStreamId: 'test-data-stream-id',
  title: 'Test Data Stream',
  description: 'A test data stream',
  inputTypes: [{ name: INPUT_TYPES.filestream }],
  jobInfo: {
    jobId: 'test-job-id',
    jobType: 'test-job-type',
    status: TASK_STATUSES.pending,
  },
  metadata: {
    sampleCount: 100,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
};

export const mockIntegrationData: IntegrationAttributes = {
  integration_id: 'test-integration-id',
  created_by: 'test-user',
  metadata: {
    title: 'Test Integration',
    description: 'A test integration',
    created_at: '2024-01-01T00:00:00.000Z',
    version: '1.0.0',
  },
};

export const mockDataStreamData: DataStreamAttributes = {
  integration_id: 'test-integration-id',
  data_stream_id: 'test-data-stream-id',
  title: 'Test Data Stream',
  description: 'A test data stream',
  created_by: 'test-user',
  input_types: [INPUT_TYPES.filestream],
  job_info: {
    job_id: 'test-job-id',
    job_type: 'test-job-type',
    status: TASK_STATUSES.pending,
  },
  metadata: {
    sample_count: 100,
    version: '1.0.0',
    created_at: '2024-01-01T00:00:00.000Z',
  },
  result: {
    ingest_pipeline: { name: 'test-pipeline', processors: [] },
    field_mapping: [
      { name: 'source.ip', type: 'ip', is_ecs: true },
      { name: 'custom_app.request_id', type: 'keyword', is_ecs: false },
    ],
  },
};

export const mockSavedObject: SavedObject<IntegrationAttributes> = {
  id: 'test-integration-id',
  type: INTEGRATION_SAVED_OBJECT_TYPE,
  attributes: mockIntegrationData,
  references: [],
  version: '1',
};

export const mockDataStreamSavedObject: SavedObject<DataStreamAttributes> = {
  id: 'test-data-stream-id',
  type: DATA_STREAM_SAVED_OBJECT_TYPE,
  attributes: mockDataStreamData,
  references: [],
  version: '1',
};
