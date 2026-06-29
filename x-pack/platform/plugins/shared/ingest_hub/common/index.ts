/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  INGEST_HUB_ENABLED_FLAG,
  INGEST_HUB_ONBOARDING_ENABLED_FLAG,
  AWS_ONBOARDING_TITLE,
  AWS_ONBOARDING_DESCRIPTION,
} from './constants';

export type { IamPolicyDocument } from './iam_policy_document';
export {
  ALL_INTEGRATIONS_SID,
  getIntegrationSid,
  buildIamPolicyDocument,
  formatIamPolicyDocument,
} from './iam_policy_document';

export type { ProviderPermissions } from './aws_provider_permissions';
export { AWS_SERVICE_PROVIDER_PERMISSIONS } from './aws_provider_permissions';

export type { GetIamPermissionsResponse, ServiceIamPermissions } from './iam_permissions_api';
export { IAM_PERMISSIONS_API_PATH } from './iam_permissions_api';
