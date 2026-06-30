/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityRoleDescriptor } from '@elastic/elasticsearch/lib/api/types';

import type { agentPolicyStatuses } from '../../constants';
import type { BaseSSLSecrets, MonitoringType, SecretReference, ValueOf } from '..';

import type { PackagePolicy } from './package_policy';
import type { Output } from './output';
import type { CloudProvider } from './cloud_connector';
export type AgentPolicyStatus = typeof agentPolicyStatuses;

// adding a property here? If it should be cloned when duplicating a policy, add it to `agentPolicyService.copy`
// x-pack/platform/plugins/shared/fleet/server/services/agent_policy.ts#L571
export interface NewAgentPolicy {
  id?: string;
  name: string;
  namespace: string;
  space_ids?: string[];
  description?: string;
  is_default?: boolean;
  is_default_fleet_server?: boolean; // Optional when creating a policy
  has_fleet_server?: boolean;
  is_managed?: boolean; // Optional when creating a policy
  monitoring_enabled?: MonitoringType;
  unenroll_timeout?: number;
  inactivity_timeout?: number;
  is_preconfigured?: boolean;
  // Nullable to allow user to reset to default outputs
  data_output_id?: string | null;
  monitoring_output_id?: string | null;
  download_source_id?: string | null;
  fleet_server_host_id?: string | null;
  schema_version?: string;
  agent_features?: Array<{ name: string; enabled: boolean }>;
  is_protected?: boolean;
  overrides?: { [key: string]: any } | null;
  advanced_settings?: { [key: string]: any } | null;
  keep_monitoring_alive?: boolean | null;
  supports_agentless?: boolean | null;
  global_data_tags?: GlobalDataTag[];
  agentless?: AgentlessAgentPolicyConfig;
  monitoring_pprof_enabled?: boolean;
  monitoring_http?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    buffer?: {
      enabled: boolean;
    };
  };
  monitoring_diagnostics?: {
    limit?: {
      interval?: string;
      burst?: number;
    };
    uploader?: {
      max_retries?: number;
      init_dur?: string;
      max_dur?: string;
    };
  };
  required_versions?: AgentTargetVersion[] | null;
  has_agent_version_conditions?: boolean;
  is_verifier?: boolean;
}

export interface AgentTargetVersion {
  version: string;
  percentage: number;
}

export interface CloudConnectors {
  target_csp?: CloudProvider;
  enabled?: boolean;
}
/** Agentless-specific configuration embedded in an AgentPolicy (cloud connectors, resources). */
export interface AgentlessAgentPolicyConfig {
  cloud_connectors?: CloudConnectors;
  resources?: {
    requests?: {
      memory?: string;
      cpu?: string;
    };
  };
  cluster_id?: string;
}

export interface GlobalDataTag {
  name: string;
  value: string | number;
}

export interface AgentPolicyAgentVersionCondition {
  name: string;
  title: string;
  version_condition: string;
}

export interface AgentPolicy extends Omit<NewAgentPolicy, 'id'> {
  id: string;
  space_ids?: string[] | undefined;
  status: ValueOf<AgentPolicyStatus>;
  package_policies?: PackagePolicy[];
  is_managed: boolean; // required for created policy
  created_at?: string;
  updated_at: string;
  updated_by: string;
  revision: number;
  agents?: number;
  unprivileged_agents?: number;
  fips_agents?: number;
  agents_per_version?: Array<{ version: string; count: number }>;
  is_protected: boolean;
  version?: string;
  min_agent_version?: string | null;
  package_agent_version_conditions?: AgentPolicyAgentVersionCondition[] | null;
}

export interface FullAgentPolicyInputStream {
  id: string;
  data_stream: {
    dataset: string;
    type?: string;
  };
  [key: string]: any;
}

export interface FullAgentPolicyInput {
  id: string;
  name: string;
  revision: number;
  type: string;
  data_stream: { namespace: string };
  use_output: string;
  package_policy_id: string;
  meta?: {
    package?: FullAgentPolicyMetaPackage;
    [key: string]: unknown;
  };
  streams?: FullAgentPolicyInputStream[];
  processors?: FullAgentPolicyAddFields[];
  ssl?: BaseSSLConfig;
  [key: string]: any;
}

export interface FullAgentPolicyMetaPackage {
  name: string;
  version: string;
  policy_template?: string;
  release?: string;
  agentVersion?: string;
}

export type TemplateAgentPolicyInput = Pick<FullAgentPolicyInput, 'id' | 'type' | 'streams'>;

export interface FullAgentPolicyAddFields {
  add_fields: {
    target: string;
    fields: {
      [key: string]: string | number;
    };
  };
}

export type FullAgentPolicyOutputPermissions = Record<string, SecurityRoleDescriptor>;

export type FullAgentPolicyOutput = Pick<Output, 'type' | 'hosts' | 'ca_sha256'> & {
  proxy_url?: string;
  proxy_headers?: any;
  ssl?: BaseSSLConfig;
  [key: string]: any;
};

export interface FullAgentPolicyMonitoring {
  namespace?: string;
  use_output?: string;
  enabled: boolean;
  metrics: boolean;
  logs: boolean;
  traces: boolean;
  pprof?: {
    enabled: boolean;
  };
  http?: {
    enabled: boolean;
    host?: string;
    port?: number;
  };
  diagnostics?: {
    limit?: {
      interval?: string;
      burst?: number;
    };
    uploader?: {
      max_retries?: number;
      init_dur?: string;
      max_dur?: string;
    };
  };
}
export interface FullAgentPolicyDownloadAuth {
  username?: string;
  password?: string;
  api_key?: string;
  headers?: Array<{
    key: string;
    value: string;
  }>;
}

export interface FullAgentPolicyDownloadAuthSecrets {
  password?: { id: string };
  api_key?: { id: string };
}

export interface FullAgentPolicyDownloadSecrets extends BaseSSLSecrets {
  auth?: FullAgentPolicyDownloadAuthSecrets;
}

export interface FullAgentPolicyDownload {
  sourceURI: string;
  ssl?: BaseSSLConfig;
  auth?: FullAgentPolicyDownloadAuth;
  secrets?: FullAgentPolicyDownloadSecrets;
  proxy_url?: string;
  proxy_headers?: any;
}

export interface FullAgentPolicy {
  id: string;
  namespaces?: string[];
  outputs: {
    [key: string]: FullAgentPolicyOutput;
  };
  output_permissions?: {
    [output: string]: FullAgentPolicyOutputPermissions;
  };
  fleet?:
    | FullAgentPolicyFleetConfig
    | {
        kibana: FullAgentPolicyKibanaConfig;
      };
  inputs: FullAgentPolicyInput[];
  revision?: number;
  agent?: {
    monitoring: FullAgentPolicyMonitoring;
    download: FullAgentPolicyDownload;
    features: Record<string, { enabled: boolean }>;
    protection?: {
      enabled: boolean;
      uninstall_token_hash: string;
      signing_key: string;
    };
    logging?: {
      level?: string;
      to_files?: boolean;
      files?: {
        rotateeverybytes?: number;
        keepfiles?: number;
        interval?: string;
      };
    };
    limits?: {
      go_max_procs?: number;
    };
  };
  secret_references?: SecretReference[];
  signed?: {
    data: string;
    signature: string;
  };
}

export interface BaseSSLConfig {
  verification_mode?: string;
  certificate_authorities?: string[];
  renegotiation?: string;
  certificate?: string;
  key?: string;
  client_authentication?: string;
}

export interface FullAgentPolicyFleetConfig {
  hosts: string[];
  proxy_url?: string;
  proxy_headers?: any;
  ssl?: BaseSSLConfig;
  secrets?: BaseSSLSecrets;
}

export interface FullAgentPolicyKibanaConfig {
  hosts: string[];
  protocol: string;
  path?: string;
}

// Generated from Fleet Server schema.json

/**
 * A policy that an Elastic Agent is attached to
 */
export interface FleetServerPolicy {
  /**
   * Date/time the policy revision was created
   */
  '@timestamp'?: string;
  /**
   * The ID of the policy
   */
  policy_id: string;
  /**
   * The revision index of the policy
   */
  revision_idx: number;
  /**
   * The coordinator index of the policy
   */
  coordinator_idx: number;
  /**
   * The namespaces of the policy
   */
  namespaces?: string[];
  /**
   * The opaque payload.
   */
  data: {
    [k: string]: unknown;
  };
  /**
   * True when this policy is the default policy to start Fleet Server
   */
  default_fleet_server: boolean;
  /**
   * Auto unenroll any Elastic Agents which have not checked in for this many seconds
   */
  unenroll_timeout?: number;
  /**
   * Mark agents as inactive if they have not checked in for this many seconds
   */
  inactivity_timeout?: number;
}

export enum AgentlessApiDeploymentResponseCode {
  Success = 'SUCCESS',
  BackendFailed = 'BACKEND_OPERATION_FAILED',
  BadRequest = 'BAD_REQUEST',
  InternalError = 'INTERNAL_SERVER_ERROR',
  NotAllowed = 'NOT_ALLOWED',
  NotFound = 'NOT_FOUND',
  Unauthorized = 'UNAUTHORIZED',
  WrongEndpoint = 'WRONG_ENDPOINT',
}

export interface AgentlessApiDeploymentResponse {
  code: AgentlessApiDeploymentResponseCode;
  error: string | null;
}

export interface AgentlessApiListDeploymentResponse {
  deployments: Array<{
    policy_id: string;
    revision_idx?: number;
    cluster_id?: string;
  }>;
  next_token?: string;
}

// Definitions for agent policy outputs endpoints
export interface MinimalOutput {
  name?: string;
  id?: string;
}
export interface IntegrationsOutput extends MinimalOutput {
  pkgName?: string;
  integrationPolicyName?: string;
}

export interface OutputsForAgentPolicy {
  agentPolicyId?: string;
  monitoring: {
    output: MinimalOutput;
  };
  data: {
    output: MinimalOutput;
    integrations?: IntegrationsOutput[];
  };
}
