/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RegistryRelease, ExperimentalDataStreamFeature, DeprecationInfo } from './epm';
import type { SecretReference } from './secret';
import type { GlobalDataTag } from './agent_policy';

/** Boolean expression syntax evaluated by Elastic Agent. */
export type AgentConditionExpression = string;

export interface PackagePolicyPackage {
  name: string;
  title: string;
  version: string;
  experimental_data_stream_features?: ExperimentalDataStreamFeature[];
  requires_root?: boolean;
  type?: string;
  fips_compatible?: boolean;
}

export interface PackagePolicyConfigRecordEntry {
  type?: string;
  value?: any;
  frozen?: boolean;
}

export type PackagePolicyConfigRecord = Record<string, PackagePolicyConfigRecordEntry>;

export interface NewPackagePolicyInputStream {
  id?: string;
  enabled: boolean;
  keep_enabled?: boolean;
  data_stream: {
    dataset: string;
    type?: string;
    elasticsearch?: {
      // TODO: these don't really need to be defined in the package policy schema and could be pulled directly from
      // the package where needed.
      dynamic_dataset?: boolean;
      dynamic_namespace?: boolean;
      privileges?: {
        indices?: string[];
      };

      // Package policy specific values
      index_mode?: string;
      source_mode?: string;
    };
  };
  release?: RegistryRelease;
  vars?: PackagePolicyConfigRecord;
  var_group_selections?: Record<string, string>;
  config?: PackagePolicyConfigRecord;
  condition?: AgentConditionExpression | null;
  migrate_from?: string;
}

export interface PackagePolicyInputStream extends NewPackagePolicyInputStream {
  id: string;
  compiled_stream?: any;
}

export interface NewPackagePolicyInput {
  /** Auto-generated instance identifier for this input within a saved package policy (e.g. `otelcol-nginx-abc123`). Distinct from `name`, which comes from the registry manifest and is used to disambiguate inputs of the same type. */
  id?: string;
  /** The registry input's `name` field, when set. Used to disambiguate multiple inputs of the same `type` within a policy template. Falls back to `type` when absent. */
  name?: string;
  type: string;
  policy_template?: string;
  enabled: boolean;
  keep_enabled?: boolean;
  vars?: PackagePolicyConfigRecord;
  var_group_selections?: Record<string, string>;
  config?: PackagePolicyConfigRecord;
  streams: NewPackagePolicyInputStream[];
  condition?: AgentConditionExpression | null;
  deprecated?: DeprecationInfo;
  migrate_from?: string;
}

export interface PackagePolicyInput extends Omit<NewPackagePolicyInput, 'streams'> {
  streams: PackagePolicyInputStream[];
  compiled_input?: any;
}

export interface NewPackagePolicy {
  id?: string;
  name: string;
  description?: string;
  namespace?: string;
  enabled: boolean;
  is_managed?: boolean;
  /** @deprecated Nullable to allow user to clear existing policy id */
  policy_id?: string | null;
  policy_ids: string[];
  // Nullable to allow user to reset to default outputs
  output_id?: string | null;
  cloud_connector_id?: string | null;
  cloud_connector_name?: string | null;
  package?: PackagePolicyPackage;
  inputs: NewPackagePolicyInput[];
  vars?: PackagePolicyConfigRecord;
  var_group_selections?: Record<string, string>;
  elasticsearch?: {
    privileges?: {
      cluster?: string[];
    };
    [key: string]: any;
  };
  overrides?: { inputs?: { [key: string]: any } } | null;
  supports_agentless?: boolean | null;
  supports_cloud_connector?: boolean | null;
  additional_datastreams_permissions?: string[];
  global_data_tags?: GlobalDataTag[];
  condition?: AgentConditionExpression | null;
}

export interface UpdatePackagePolicy extends NewPackagePolicy {
  version?: string;
}

export interface UpdatePackagePolicyWithId extends UpdatePackagePolicy {
  id: string;
}

// SO definition for this type is declared in server/types/interfaces
export interface PackagePolicy extends Omit<NewPackagePolicy, 'inputs'> {
  id: string;
  spaceIds?: string[];
  inputs: PackagePolicyInput[];
  version?: string;
  agents?: number;
  revision: number;
  secret_references?: SecretReference[];
  updated_at: string;
  updated_by: string;
  created_at: string;
  created_by: string;
  package_agent_version_condition?: string;
}

export type DryRunPackagePolicy = NewPackagePolicy & {
  errors?: Array<{ key: string | undefined; message: string }>;
  missingVars?: string[];
};
