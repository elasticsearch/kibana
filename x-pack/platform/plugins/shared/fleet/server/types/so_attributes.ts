/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Definitions for SO attributes. They mirror the types defined under /common/types/models
import type { agentPolicyStatuses } from '../../common/constants';
import type {
  MonitoringType,
  ValueOf,
  AgentMetadata,
  OutputType,
  ShipperOutput,
  KafkaAcknowledgeReliabilityLevel,
  KafkaConnectionTypeType,
  AgentUpgradeDetails,
  OutputPreset,
  AgentlessAgentPolicyConfig,
} from '../../common/types';
import type {
  AgentStatus,
  AgentType,
  AgentUpgrade,
  FleetServerAgentComponent,
} from '../../common/types/models';
import type { AgentPolicyAgentVersionCondition } from '../../common/types/models/agent_policy';

import type {
  PackagePolicy,
  PackagePolicyInput,
  PackagePolicyPackage,
  PackagePolicyConfigRecord,
} from '../../common/types/models/package_policy';
import type { SecretReference } from '../../common/types/models/secret';
import type { KafkaAuthType, KafkaCompressionType } from '../../common/types';
import type {
  KafkaPartitionType,
  KafkaSaslMechanism,
  KafkaTopicWhenType,
  SimpleSOAssetType,
} from '../../common/types';
import type {
  CloudProvider,
  CloudConnectorVars,
  AccountType,
  VerificationStatus,
} from '../../common/types/models/cloud_connector';
import type {
  CloudOnboardingDeploymentMechanism,
  CloudOnboardingDeploymentStatus,
} from '../../common/types/models/cloud_onboarding_deployment';

export type AgentPolicyStatus = typeof agentPolicyStatuses;

export interface AgentPolicySOAttributes {
  name: string;
  namespace: string;
  is_managed: boolean; // required for created policy
  updated_at: string;
  updated_by: string;
  revision: number;
  is_protected: boolean;
  description?: string;
  is_default?: boolean;
  is_default_fleet_server?: boolean; // Optional when creating a policy
  has_fleet_server?: boolean;
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
  status: ValueOf<AgentPolicyStatus>;
  package_policies?: PackagePolicy[];
  agents?: number;
  overrides?: any | null;
  global_data_tags?: Array<{ name: string; value: string | number }>;
  agentless?: AgentlessAgentPolicyConfig;
  version?: string;
  has_agent_version_conditions?: boolean;
  is_verifier?: boolean;
  min_agent_version?: string | null;
  package_agent_version_conditions?: AgentPolicyAgentVersionCondition[] | null;
}

export interface AgentSOAttributes {
  type: AgentType;
  active: boolean;
  enrolled_at: string;
  user_provided_metadata: AgentMetadata;
  local_metadata: AgentMetadata;
  unenrolled_at?: string;
  unenrollment_started_at?: string;
  upgraded_at?: string | null;
  upgrade_started_at?: string | null;
  upgrade_details?: AgentUpgradeDetails;
  access_api_key_id?: string;
  default_api_key?: string;
  default_api_key_id?: string;
  policy_id?: string;
  policy_revision?: number | null;
  last_checkin?: string;
  last_checkin_status?: 'error' | 'online' | 'degraded' | 'updating' | 'disconnected';
  last_checkin_message?: string;
  tags?: string[];
  components?: FleetServerAgentComponent[];
  packages?: string[];
  namespaces?: string[];
  last_known_status?: AgentStatus;
  upgrade?: AgentUpgrade;
}

export interface FleetProxySOAttributes {
  name: string;
  url: string;
  is_preconfigured: boolean;
  certificate_authorities?: string | null;
  certificate?: string | null;
  certificate_key?: string | null;
  proxy_headers?: string | null;
}

export interface FleetServerHostSOAttributes {
  name: string;
  host_urls: string[];
  is_default: boolean;
  is_preconfigured: boolean;
  is_internal?: boolean;
  allow_edit?: string[];
  proxy_id?: string | null;
  secrets?: {
    ssl?: {
      key?: { id: string };
      es_key?: { id: string };
      agent_key?: { id: string };
    };
  };
  ssl?: string | null;
}

export interface PackagePolicySOAttributes {
  name: string;
  namespace?: string;
  enabled: boolean;
  revision: number;
  created_at: string;
  created_by: string;
  inputs?: PackagePolicyInput[];
  policy_id?: string | null;
  policy_ids: string[];
  // Nullable to allow user to reset to default outputs
  output_id?: string | null;
  updated_at: string;
  updated_by: string;
  description?: string;
  is_managed?: boolean;
  secret_references?: SecretReference[];
  package?: PackagePolicyPackage;
  vars?: PackagePolicyConfigRecord;
  var_group_selections?: Record<string, string>;
  elasticsearch?: {
    privileges?: {
      cluster?: string[];
    };
  };
  agents?: number;
  overrides?: any | null;
  bump_agent_policy_revision?: boolean;
  latest_revision?: boolean;
  inputs_for_versions?: Record<string, PackagePolicyInput[]>;
  package_agent_version_condition?: string;
  condition?: string | null;
}

export interface OutputSoBaseAttributes {
  is_default: boolean;
  is_default_monitoring: boolean;
  name: string;
  hosts?: string[];
  ca_sha256?: string | null;
  ca_trusted_fingerprint?: string | null;
  is_internal?: boolean;
  is_preconfigured?: boolean;
  config_yaml?: string | null;
  otel_exporter_config_yaml?: string | null;
  otel_disable_beatsauth?: boolean | null;
  proxy_id?: string | null;
  shipper?: ShipperOutput | null;
  allow_edit?: string[];
  output_id?: string;
  ssl?: string | null; // encrypted ssl field
  preset?: OutputPreset;
  write_to_logs_streams?: boolean | null;
  secrets?: {
    ssl?: {
      key?: { id: string };
    };
  };
}

interface OutputSoElasticsearchAttributes extends OutputSoBaseAttributes {
  type: OutputType['Elasticsearch'];
  secrets?: {};
}

export interface OutputSoRemoteElasticsearchAttributes extends OutputSoBaseAttributes {
  type: OutputType['RemoteElasticsearch'];
  service_token?: string | null;
  secrets?: {
    service_token?: { id: string };
    ssl?: {
      key?: { id: string };
    };
  };
  sync_integrations?: boolean;
  kibana_url?: string;
  kibana_api_key?: string | null;
  sync_uninstalled_integrations?: boolean;
}

interface OutputSoLogstashAttributes extends OutputSoBaseAttributes {
  type: OutputType['Logstash'];
}

export interface OutputSoKafkaAttributes extends OutputSoBaseAttributes {
  type: OutputType['Kafka'];
  client_id?: string;
  version?: string;
  key?: string;
  compression?: ValueOf<KafkaCompressionType>;
  compression_level?: number;
  auth_type?: ValueOf<KafkaAuthType>;
  connection_type?: ValueOf<KafkaConnectionTypeType>;
  username?: string;
  password?: string;
  sasl?: {
    mechanism?: ValueOf<KafkaSaslMechanism>;
  };
  partition?: ValueOf<KafkaPartitionType>;
  random?: {
    group_events?: number;
  };
  round_robin?: {
    group_events?: number;
  };
  hash?: {
    hash?: string;
    random?: boolean;
  };
  topic?: string;
  topics?: Array<{
    topic: string;
    when?: {
      type?: ValueOf<KafkaTopicWhenType>;
      condition?: string;
    };
  }>;
  headers?: Array<{
    key: string;
    value: string;
  }>;
  timeout?: number;
  broker_timeout?: number;
  required_acks?: ValueOf<KafkaAcknowledgeReliabilityLevel>;
  secrets?: {
    password?: { id: string };
    ssl?: {
      key?: { id: string };
    };
  };
}

export type OutputSOAttributes =
  | OutputSoElasticsearchAttributes
  | OutputSoRemoteElasticsearchAttributes
  | OutputSoLogstashAttributes
  | OutputSoKafkaAttributes;

export interface SettingsSOAttributes {
  prerelease_integrations_enabled?: boolean;
  has_seen_add_data_notice?: boolean;
  fleet_server_hosts?: string[];
  secret_storage_requirements_met?: boolean;
  output_secret_storage_requirements_met?: boolean;
  action_secret_storage_requirements_met?: boolean;
  ssl_secret_storage_requirements_met?: boolean;
  download_source_auth_secret_storage_requirements_met?: boolean;
  use_space_awareness_migration_status?: 'pending' | 'success' | 'error';
  use_space_awareness_migration_started_at?: string | null;
  delete_unenrolled_agents?: {
    enabled: boolean;
    is_preconfigured: boolean;
  };
  ilm_migration_status?: {
    logs?: 'success' | null;
    metrics?: 'success' | null;
    synthetics?: 'success' | null;
  };
  integration_knowledge_enabled?: boolean;
}

export interface SpaceSettingsSOAttributes {
  allowed_namespace_prefixes?: string[] | null;
  managed_by?: 'kibana_config' | null;
}

export interface DownloadSourceSOAttributes {
  name: string;
  host: string;
  is_default: boolean;
  source_id?: string;
  proxy_id?: string | null;
  ssl?: string | null; // encrypted ssl field
  auth?: string | null; // encrypted auth field
  secrets?: {
    ssl?: {
      key?: { id: string };
    };
    auth?: {
      password?: { id: string };
      api_key?: { id: string };
    };
  };
}
export type SimpleSOAssetAttributes = SimpleSOAssetType['attributes'];

export interface CloudConnectorSOAttributes {
  name: string;
  namespace?: string;
  cloudProvider: CloudProvider;
  accountType?: AccountType;
  vars: CloudConnectorVars;
  created_at: string;
  updated_at: string;
  verification_status?: VerificationStatus;
  verification_started_at?: string;
  verification_failed_at?: string;
}

export interface CloudOnboardingDeploymentSOAttributes {
  /** Cloud provider — determines how deploymentId/deploymentName are interpreted (e.g. for AWS, deploymentId is the CFN stack ARN). */
  provider: CloudProvider;
  /** FK to fleet-cloud-connector — the AWS account connection this deployment belongs to. */
  connectorId: string;
  /** Active delivery mechanisms included in this deployment's IaC stack (agentless, firehose, cloud_forwarder, agent_based). */
  mechanisms: CloudOnboardingDeploymentMechanism[];
  /** Provider-specific deployment identifier. For AWS: the CloudFormation stack ARN. Set after the user deploys the stack. */
  deploymentId?: string;
  /** Human-readable deployment name. For AWS: the CloudFormation stack name. */
  deploymentName?: string;
  /** All service IDs (e.g. 'cloudtrail', 'elb_logs') covered across all mechanisms in this deployment. */
  services: string[];
  /** Lifecycle status: pending → deploying → succeeded | failed. */
  status: CloudOnboardingDeploymentStatus;
  /** Error detail when status is 'failed'. */
  statusMessage?: string;
  /** Number of deploy attempts — incremented on each retry. */
  attemptCount: number;
  /** Per-service config arrays — serviceVars[serviceId] is an array where each entry represents one data source (region + S3 bucket + service-specific fields). Multiple entries support multiple buckets/sources for the same service. */
  serviceVars?: Record<string, Array<Record<string, unknown>>>;
  /** Fleet package policy IDs — one per distinct integration package (e.g. one for 'aws', one for 'aws_bedrock'). Present when agentless is in mechanisms. For agent_based, the package policies are attached to the user-managed agent policy tracked in agentPolicyId. */
  packagePolicyIds?: string[];
  /** Agent policy ID for agent_based mechanism — the user-managed agent policy the package policies are attached to. In agentless, agentPolicyId equals packagePolicyId and is not stored separately. */
  agentPolicyId?: string;
  /** Elasticsearch API key ID for push mechanisms (firehose, cloud_forwarder). Set by the backend after key creation; used to identify the key for rotation/revocation. No package policy exists for push services. */
  apiKeyId?: string;
}
