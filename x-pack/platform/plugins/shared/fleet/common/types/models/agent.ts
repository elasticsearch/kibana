/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AGENT_TYPE_EPHEMERAL,
  AGENT_TYPE_PERMANENT,
  AGENT_TYPE_TEMPORARY,
  FleetServerAgentComponentStatuses,
  AgentStatuses,
  AGENT_TYPE_OPAMP,
} from '../../constants';

import type { SecretReference, SOSecret } from './secret';

export type AgentType =
  | typeof AGENT_TYPE_EPHEMERAL
  | typeof AGENT_TYPE_PERMANENT
  | typeof AGENT_TYPE_TEMPORARY
  | typeof AGENT_TYPE_OPAMP;

type AgentStatusTuple = typeof AgentStatuses;
export type AgentStatus = AgentStatusTuple[number];

export type SimplifiedAgentStatus =
  | 'healthy'
  | 'unhealthy'
  | 'orphaned'
  | 'updating'
  | 'offline'
  | 'inactive'
  | 'unenrolled'
  | 'uninstalled';

export type AgentActionType =
  | 'UNENROLL'
  | 'UPGRADE'
  | 'ROLLBACK'
  | 'SETTINGS'
  | 'POLICY_REASSIGN'
  | 'CANCEL'
  | 'FORCE_UNENROLL'
  | 'UPDATE_TAGS'
  | 'REQUEST_DIAGNOSTICS'
  | 'POLICY_CHANGE'
  | 'INPUT_ACTION'
  | 'MIGRATE'
  | 'PRIVILEGE_LEVEL_CHANGE'
  | 'REMOVE_COLLECTOR';

export type AgentUpgradeStateType =
  | 'UPG_REQUESTED'
  | 'UPG_SCHEDULED'
  | 'UPG_DOWNLOADING'
  | 'UPG_EXTRACTING'
  | 'UPG_REPLACING'
  | 'UPG_RESTARTING'
  | 'UPG_WATCHING'
  | 'UPG_ROLLBACK'
  | 'UPG_FAILED';

type FleetServerAgentComponentStatusTuple = typeof FleetServerAgentComponentStatuses;
export type FleetServerAgentComponentStatus = FleetServerAgentComponentStatusTuple[number];

export interface NewAgentAction {
  type: AgentActionType;
  data?: any;
  ack_data?: any;
  sent_at?: string;
  agents: string[];
  namespaces?: string[];
  created_at?: string;
  id?: string;
  expiration?: string;
  start_time?: string;
  minimum_execution_duration?: number;
  rollout_duration_seconds?: number;
  source_uri?: string;
  total?: number;
  is_automatic?: boolean;
  policyId?: string;
  secrets?: {
    user_info?: {
      password?: SOSecret;
    };
    enrollment_token?: SOSecret;
  };
}

export interface AgentAction extends NewAgentAction {
  type: AgentActionType;
  data?: any;
  sent_at?: string;
  id: string;
  created_at: string;
  ack_data?: any;
}

export interface AgentMetadata {
  [x: string]: any;
}

// SO definition for this type is declared in server/types/interfaces
interface AgentBase {
  type: AgentType;
  active: boolean;
  enrolled_at: string;
  unenrolled_at?: string;
  unenrollment_started_at?: string;
  audit_unenrolled_reason?: string;
  upgraded_at?: string | null;
  upgrade_started_at?: string | null;
  upgrade_details?: AgentUpgradeDetails;
  upgrade_attempts?: string[] | null;
  access_api_key_id?: string;
  default_api_key?: string;
  default_api_key_id?: string;
  policy_id?: string;
  policy_revision?: number | null;
  last_checkin?: string;
  last_checkin_status?: 'error' | 'online' | 'degraded' | 'updating' | 'starting' | 'disconnected';
  last_checkin_message?: string;
  user_provided_metadata?: AgentMetadata;
  local_metadata: AgentMetadata;
  tags?: string[];
  components?: FleetServerAgentComponent[];
  agent?: FleetServerAgentMetadata;
  unhealthy_reason?: UnhealthyReason[];
  namespaces?: string[];
  upgrade?: AgentUpgrade;
  identifying_attributes?: {
    [key: string]: string | number;
  };
  non_identifying_attributes?: {
    [key: string]: string | number;
  };
  sequence_num?: number;
  capabilities?: string[];
  health?: ComponentHealth;
  effective_config?: any;
  signals?: string[];
}

export enum UnhealthyReason {
  INPUT = 'input',
  OUTPUT = 'output',
  OTHER = 'other',
}

export interface AgentUpgrade {
  rollbacks?: AgentRollback[];
}

export interface AgentRollback {
  valid_until: string;
  version: string;
}

export interface AgentMetrics {
  cpu_avg?: number;
  memory_size_byte_avg?: number;
}

export interface OutputMap {
  [key: string]: {
    api_key_id: string;
    type: string;
    to_retire_api_key_ids?: FleetServerAgent['default_api_key_history'];
  };
}

export interface Agent extends AgentBase {
  id: string;
  access_api_key?: string;
  // @deprecated
  default_api_key_history?: FleetServerAgent['default_api_key_history'];
  outputs?: OutputMap;
  status?: AgentStatus;
  pipeline_config?: string;
  packages: string[];
  sort?: any[];
  metrics?: AgentMetrics;
  last_known_status?: AgentStatus;
}

export interface CurrentUpgrade {
  actionId: string;
  complete: boolean;
  nbAgents: number;
  nbAgentsAck: number;
  version: string;
  startTime?: string;
}

export interface ActionErrorResult {
  agentId: string;
  error: string;
  timestamp: string;
  hostname?: string;
}

export interface ActionStatus {
  actionId: string;
  // how many agents are successfully included in action documents
  nbAgentsActionCreated: number;
  // how many agents acknowledged the action sucessfully (completed)
  nbAgentsAck: number;
  // how many agents failed
  nbAgentsFailed: number;
  version?: string;
  startTime?: string;
  type: AgentActionType;
  // how many agents were actioned by the user
  nbAgentsActioned: number;
  status: 'COMPLETE' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | 'IN_PROGRESS' | 'ROLLOUT_PASSED';
  expiration?: string;
  completionTime?: string;
  cancellationTime?: string;
  newPolicyId?: string;
  creationTime: string;
  hasRolloutPeriod?: boolean;
  latestErrors?: ActionErrorResult[];
  revision?: number;
  policyId?: string;
  is_automatic?: boolean;
}

export interface AgentDiagnostics {
  id: string;
  name: string;
  createTime: string;
  filePath: string;
  status: 'READY' | 'AWAITING_UPLOAD' | 'DELETED' | 'EXPIRED' | 'IN_PROGRESS' | 'FAILED';
  actionId: string;
  error?: string;
}

// Generated from FleetServer schema.json
/**
 * Fleet Server agent component unit
 */
export interface FleetServerAgentComponentUnit {
  id: string;
  type: 'input' | 'output';
  status: FleetServerAgentComponentStatus;
  message: string;
  payload?: {
    [key: string]: any;
  };
}

/**
 * Fleet server agent component
 */
export interface FleetServerAgentComponent {
  id: string;
  type: string;
  status: FleetServerAgentComponentStatus;
  message: string;
  // In some case units could be missing
  units?: FleetServerAgentComponentUnit[];
}

/**
 * An Elastic Agent that has enrolled into Fleet
 */
export interface FleetServerAgent {
  /**
   * The version of the document in the index
   */
  _version?: number;
  /**
   * Shared ID
   */
  shared_id?: string;
  /**
   * Type
   */
  type: AgentType;
  /**
   * Active flag
   */
  active: boolean;
  /**
   * Date/time the Elastic Agent enrolled
   */
  enrolled_at: string;
  /**
   * Date/time the Elastic Agent unenrolled
   */
  unenrolled_at?: string;
  /**
   * Date/time the Elastic Agent unenrolled started
   */
  unenrollment_started_at?: string;
  /**
   * Date/time the Elastic Agent was last upgraded
   */
  audit_unenrolled_reason?: string;
  /**
   * Reason for agent unenrollment
   */
  upgraded_at?: string | null;
  /**
   * Date/time the Elastic Agent started the current upgrade
   */
  upgrade_started_at?: string | null;
  /**
   * ID of the API key the Elastic Agent must used to contact Fleet Server
   */
  /**
   * Upgrade state of the Elastic Agent
   */
  upgrade_details?: AgentUpgradeDetails;
  /**
   * List of timestamps of attempts of Elastic Agent automatic upgrades
   */
  upgrade_attempts?: string[] | null;
  access_api_key_id?: string;
  agent?: FleetServerAgentMetadata;
  /**
   * User provided metadata information for the Elastic Agent
   */
  user_provided_metadata?: AgentMetadata;
  /**
   * Local metadata information for the Elastic Agent
   */
  local_metadata: AgentMetadata;
  /**
   * The policy ID for the Elastic Agent
   */
  policy_id?: string;
  /**
   * The current policy revision_idx for the Elastic Agent
   */
  policy_revision_idx?: number | null;
  /**
   * The current policy coordinator for the Elastic Agent
   */
  policy_coordinator_idx?: number;
  /**
   * Date/time the Elastic Agent was last updated
   */
  last_updated?: string;
  /**
   * Date/time the Elastic Agent checked in last time
   */
  last_checkin?: string;
  /**
   * Last checkin status
   */
  last_checkin_status?: 'error' | 'online' | 'degraded' | 'updating' | 'disconnected';
  /**
   * Last checkin message
   */
  last_checkin_message?: string;
  /**
   * ID of the API key the Elastic Agent uses to authenticate with elasticsearch
   */
  default_api_key_id?: string;
  /**
   * API key the Elastic Agent uses to authenticate with elasticsearch
   */
  default_api_key?: string;
  /**
   * Date/time the Elastic Agent was last updated
   */
  updated_at?: string;
  /**
   * Packages array
   */
  packages?: string[];
  /**
   * The last acknowledged action sequence number for the Elastic Agent
   */
  action_seq_no?: number;
  /**
   * A list of tags used for organizing/filtering agents
   */
  tags?: string[];
  /**
   * Default API Key History
   */
  default_api_key_history?: Array<{
    id: string;
    retired_at: string;
  }>;
  /**
   * Components array
   */
  components?: FleetServerAgentComponent[];

  /**
   * Outputs map
   */
  outputs?: OutputMap;

  /**
   * Unhealthy reason: input, output, other
   */
  unhealthy_reason?: UnhealthyReason[];

  /**
   * Namespaces
   */
  namespaces?: string[];

  /**
   * The last known agent status
   */
  last_known_status?: AgentStatus;
  /**
   * Upgrade information including available upgrade rollbacks for the Elastic Agent
   */
  upgrade?: AgentUpgrade;
  identifying_attributes?: {
    [key: string]: string | number;
  };
  non_identifying_attributes?: {
    [key: string]: string | number;
  };
  sequence_num?: number;
  capabilities?: string[];
  health?: ComponentHealth;
  effective_config?: any;
}

export interface ComponentHealth {
  healthy: boolean;
  status: string;
  status_time_unix_nano?: number;
  start_time_unix_nano?: number;
  last_error?: string;
  component_health_map?: {
    [key: string]: ComponentHealth;
  };
}

/**
 * An Elastic Agent metadata
 */
export interface FleetServerAgentMetadata {
  /**
   * The unique identifier for the Elastic Agent
   */
  id: string;
  /**
   * The version of the Elastic Agent
   */
  version: string;
  [k: string]: any;
}

/**
 * An Elastic Agent action
 */
export interface FleetServerAgentAction {
  /**
   * The unique identifier for action document
   */
  _id?: string;
  /**
   * The action sequence number
   */
  _seq_no?: number;
  /**
   * The unique identifier for the Elastic Agent action. There could be multiple documents with the same action_id if the action is split into two separate documents.
   */
  action_id?: string;
  /**
   * Date/time the action was created
   */
  '@timestamp'?: string;
  /**
   * The action expiration date/time
   */
  expiration?: string;
  /**
   * The action type. APP_ACTION is the value for the actions that suppose to be routed to the endpoints/beats.
   */
  type?: string;
  /**
   * The input identifier the actions should be routed to.
   */
  input_id?: string;
  /**
   * The Agent IDs the action is intended for. No support for json.RawMessage with the current generator. Could be useful to lazy parse the agent ids
   */
  agents?: string[];

  namespaces?: string[];

  /**
   * Date when the agent should execute that agent. This field could be altered by Fleet server for progressive rollout of the action.
   */
  start_time?: string;

  /**
   * @deprecated
   * Minimun execution duration in seconds, used for progressive rollout of the action.
   */
  minimum_execution_duration?: number;

  /**
   * Rollout duration in seconds, used for progressive rollout of the action.
   */
  rollout_duration_seconds?: number;

  /**
   * The opaque payload.
   * Secret properties contain a secret reference instead of a value.
   */
  data?: {
    [k: string]: unknown;
  };
  total?: number;

  /** Trace id */
  traceparent?: string | null;

  // signed data + signature
  signed?: {
    data: string;
    signature: string;
  };

  /**
   * True if action was generated by an automated task.
   */
  is_automatic?: boolean;

  // the id of the policy associated with the action
  policyId?: string;

  /**
   * List of secret references associated with the action.
   */
  secret_references?: SecretReference[];

  [k: string]: unknown;
}

export interface ActionStatusOptions {
  errorSize: number;
  page?: number;
  perPage?: number;
  date?: string;
  latest?: number;
}

export interface AgentUpgradeDetails {
  target_version: string;
  action_id: string;
  state: AgentUpgradeStateType;
  metadata?: {
    scheduled_at?: string;
    download_percent?: number;
    download_rate?: number; // bytes per second
    failed_state?: AgentUpgradeStateType;
    error_msg?: string;
    retry_error_msg?: string;
    retry_until?: string;
  };
}
