/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CloudSetup } from '@kbn/cloud-plugin/public';

export interface FederatedIdentityClusterInfo {
  /** OIDC discovery URL for the workload-identity issuer. */
  jwtIssuer: string;
  /** Elastic Cloud Organization ID that owns this deployment/project. */
  cloudOrgId: string;
  /** deployment:<id> for ESS/ECH, project:<id> for serverless. Used to scope IAM role trust. */
  deploymentId: string;
  /** True when running on serverless Elastic Cloud. Controls the label shown to the user. */
  isServerless: boolean;
}

/**
 * Builds the three read-only values shown in the federated identity auth section of the
 * data source creation flyout. These are presented to the user so they can configure the
 * CSP side of the OIDC trust (IAM role trust policy / workload identity binding).
 *
 * When the controller injects `xpack.dataFederation.workloadIdentityIssuerUrl` into kibana.yml,
 * that value is used directly as the JWT issuer. Otherwise it falls back to deriving the URL
 * from cloud metadata (region, csp, organizationId).
 */
export const buildFederatedIdentityClusterInfo = (
  cloud?: CloudSetup,
  injectedIssuerUrl?: string
): FederatedIdentityClusterInfo => {
  const cloudOrgId = cloud?.organizationId ?? '';

  const deploymentId =
    cloud?.isServerlessEnabled && cloud.serverless?.projectId
      ? `project:${cloud.serverless.projectId}`
      : cloud?.deploymentId
      ? `deployment:${cloud.deploymentId}`
      : '';

  const jwtIssuer = injectedIssuerUrl ?? '';

  const isServerless = Boolean(cloud?.isServerlessEnabled);

  return { jwtIssuer, cloudOrgId, deploymentId, isServerless };
};
