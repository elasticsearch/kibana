/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiStepProps } from '@elastic/eui';

import type React from 'react';

import type {
  AgentPolicy,
  NewPackagePolicy,
  PackagePolicy,
  AgentlessPolicy,
} from '../../../../../../common';

/**
 * Result of saving a policy from the create flow, tagged by the API that produced it.
 * The `type` tag lets callers branch on the policy shape without probing fields.
 */
export type SavedPolicyResult =
  | { type: 'packagePolicy'; policy: PackagePolicy }
  | { type: 'agentless'; policy: AgentlessPolicy };

export type EditPackagePolicyFrom =
  | 'package'
  | 'package-edit'
  | 'policy'
  | 'edit'
  | 'upgrade-from-fleet-policy-list'
  | 'upgrade-from-integrations-policy-list'
  | 'upgrade-from-extension'
  | 'copy-from-fleet-policy-list'
  | 'copy-from-integrations-policy-list'
  | 'copy-from-installed-integrations'
  | 'fleet-policy-list'
  | 'installed-integrations';

export type PackagePolicyFormState =
  | 'VALID'
  | 'INVALID'
  | 'CONFIRM'
  | 'LOADING'
  | 'SUBMITTED'
  | 'SUBMITTED_NO_AGENTS'
  | 'SUBMITTED_AZURE_ARM_TEMPLATE'
  | 'SUBMITTED_CLOUD_FORMATION'
  | 'SUBMITTED_GOOGLE_CLOUD_SHELL';

export interface AddToPolicyParams {
  pkgkey: string;
  integration?: string;
  policyId?: string;
}

export type CreatePackagePolicyParams = React.FunctionComponent<{
  from: EditPackagePolicyFrom;
  queryParamsPolicyId?: string;
  prerelease: boolean;
  pkgName: string;
  pkgVersion?: string;
  integration?: string;
  pkgLabel?: string;
  defaultPolicyData?: Partial<NewPackagePolicy>;
  noBreadcrumb?: boolean;
  addIntegrationFlyoutProps?: {
    selectIntegrationStep: EuiStepProps;
    onSubmitCompleted: () => void;
    isSubmitted: boolean;
    agentPolicy: AgentPolicy;
    updateHasErrors: (hasErrors: boolean) => void;
  };
}>;
