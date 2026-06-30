/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IamPolicyDocument } from './iam_policy_document';

/** Internal endpoint path for IAM permissions. */
export const IAM_PERMISSIONS_API_PATH = '/internal/onboarding/iam_permissions';

/**
 * Per-service IAM permissions: an inline policy document plus any AWS managed
 * policy ARNs that must be attached separately (they cannot be inlined).
 */
export interface ServiceIamPermissions {
  policy: IamPolicyDocument;
  managedPolicyArns: string[];
}

/**
 * Response shape for `GET /internal/onboarding/iam_permissions?services=...`
 *
 * - `merged`                — deduped union of all services' inline policy actions.
 * - `mergedManagedPolicyArns` — deduped union of all services' managed policy ARNs.
 * - `byService`             — per-service permissions; keyed by service id.
 *
 * The UI reads `merged`/`mergedManagedPolicyArns` for the "All integrations" view
 * and `byService[id]` for the per-service toggle — no second request needed.
 *
 * Managed policy ARNs must be attached via `aws iam attach-user-policy` (or
 * equivalent); they cannot be embedded in the same inline policy JSON.
 */
export interface GetIamPermissionsResponse {
  merged: IamPolicyDocument;
  mergedManagedPolicyArns: string[];
  byService: Record<string, ServiceIamPermissions>;
}
