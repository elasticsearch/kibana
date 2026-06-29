/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Re-export from common so the server and browser share a single implementation.
export type { IamPolicyDocument } from '../../common/iam_policy_document';
export {
  ALL_INTEGRATIONS_SID,
  getIntegrationSid,
  buildIamPolicyDocument,
  formatIamPolicyDocument,
} from '../../common/iam_policy_document';
