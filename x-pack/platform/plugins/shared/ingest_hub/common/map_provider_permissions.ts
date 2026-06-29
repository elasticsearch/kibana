/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackageInfo, RegistryProviderPermissions } from '@kbn/fleet-plugin/common';

export interface ServiceManifestLookup {
  /** Fleet package name (e.g. 'aws', 'aws_bedrock'). */
  packageName: string;
  /** Policy template name within the package. */
  policyTemplate?: string;
  /** Input type strings to match at the input level (e.g. 'aws-s3', 'aws/metrics'). */
  inputs?: readonly string[];
  /** Data stream path / service id (e.g. 'cloudtrail', 'vpcflow'). */
  dataStream: string;
}

export interface MappedProviderPermissions {
  /** AWS IAM actions collected from the manifest (from `permissions` fields). */
  actions: string[];
  /** Managed policy ARNs/names collected from the manifest (from `roles` fields). */
  managedPolicyArns: string[];
}

/** Extract AWS-specific permissions from a provider_permissions array. */
const extractAws = (
  entries: RegistryProviderPermissions[]
): { actions: string[]; managedPolicyArns: string[]; found: boolean } => {
  const actions: string[] = [];
  const managedPolicyArns: string[] = [];
  let found = false;

  for (const entry of entries) {
    if (entry.provider !== 'aws') continue;
    found = true;
    if (entry.permissions) actions.push(...entry.permissions);
    if (entry.roles) managedPolicyArns.push(...entry.roles);
  }

  return { actions, managedPolicyArns, found };
};

/**
 * Collects `provider_permissions` for a specific data stream from a Fleet `PackageInfo`.
 *
 * Unions AWS entries across all declared levels in the manifest hierarchy:
 *   package → matching policy_template → matching inputs → matching data_stream
 *
 * Returns `null` when no `provider_permissions` are declared at any level — the caller
 * should then fall back to the hardcoded `AWS_SERVICE_PROVIDER_PERMISSIONS` matrix.
 *
 * Field mapping (package-spec → internal):
 *   `permissions` → `actions`
 *   `roles`       → `managedPolicyArns`
 */
export const mapProviderPermissions = (
  pkgInfo: PackageInfo,
  lookup: ServiceManifestLookup
): MappedProviderPermissions | null => {
  const { policyTemplate: policyTemplateName, inputs: inputTypes = [], dataStream } = lookup;

  const allActions: string[] = [];
  const allManagedPolicyArns: string[] = [];
  let anyAwsDeclared = false;

  // — Package level ─────────────────────────────────────────────────────────
  if (pkgInfo.provider_permissions?.length) {
    const { actions, managedPolicyArns, found } = extractAws(pkgInfo.provider_permissions);
    allActions.push(...actions);
    allManagedPolicyArns.push(...managedPolicyArns);
    if (found) anyAwsDeclared = true;
  }

  // — Policy template + input levels ─────────────────────────────────────────
  for (const pt of pkgInfo.policy_templates ?? []) {
    // Skip templates that don't match this service's template (when specified).
    if (policyTemplateName && pt.name !== policyTemplateName) continue;

    if (pt.provider_permissions?.length) {
      const { actions, managedPolicyArns, found } = extractAws(pt.provider_permissions);
      allActions.push(...actions);
      allManagedPolicyArns.push(...managedPolicyArns);
      if (found) anyAwsDeclared = true;
    }

    // Input level — only RegistryPolicyIntegrationTemplate has `inputs`.
    const ptInputs = 'inputs' in pt ? pt.inputs ?? [] : [];
    for (const input of ptInputs) {
      // Skip inputs not in this service's input list (when the list is non-empty).
      if (inputTypes.length > 0 && !inputTypes.includes(input.type)) continue;

      if (input.provider_permissions?.length) {
        const { actions, managedPolicyArns, found } = extractAws(input.provider_permissions);
        allActions.push(...actions);
        allManagedPolicyArns.push(...managedPolicyArns);
        if (found) anyAwsDeclared = true;
      }
    }
  }

  // — Data stream level ────────────────────────────────────────────────────
  for (const ds of pkgInfo.data_streams ?? []) {
    if (ds.path !== dataStream) continue;

    if (ds.provider_permissions?.length) {
      const { actions, managedPolicyArns, found } = extractAws(ds.provider_permissions);
      allActions.push(...actions);
      allManagedPolicyArns.push(...managedPolicyArns);
      if (found) anyAwsDeclared = true;
    }
  }

  // Only return non-null when the manifest explicitly declares AWS entries. A package that
  // declares only GCP/Azure entries should still fall back to the hardcoded AWS matrix.
  if (!anyAwsDeclared) return null;

  return {
    actions: [...new Set(allActions)],
    managedPolicyArns: [...new Set(allManagedPolicyArns)],
  };
};
