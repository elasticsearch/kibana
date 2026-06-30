/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Base API paths

export const INTERNAL_ROOT = `/internal/fleet`;

export const API_ROOT = `/api/fleet`;
export const EPM_API_ROOT = `${API_ROOT}/epm`;
export const DATA_STREAM_API_ROOT = `${API_ROOT}/data_streams`;
export const PACKAGE_POLICY_API_ROOT = `${API_ROOT}/package_policies`;
export const AGENT_POLICY_API_ROOT = `${API_ROOT}/agent_policies`;
export const CLOUD_CONNECTOR_API_ROOT = `${API_ROOT}/cloud_connectors`;
export const K8S_API_ROOT = `${API_ROOT}/kubernetes`;
export const DOWNLOAD_SOURCE_API_ROOT = `${API_ROOT}/agent_download_sources`;

export const LIMITED_CONCURRENCY_ROUTE_TAG = 'ingest:limited-concurrency';

// EPM API routes
const EPM_PACKAGES_MANY = `${EPM_API_ROOT}/packages`;
const EPM_PACKAGES_INSTALLED = `${EPM_API_ROOT}/packages/installed`;
const EPM_PACKAGES_ONE_WITHOUT_VERSION = `${EPM_PACKAGES_MANY}/{pkgName}`;
const EPM_PACKAGES_ONE = `${EPM_PACKAGES_MANY}/{pkgName}/{pkgVersion}`;
export const EPM_API_ROUTES = {
  BULK_INSTALL_PATTERN: `${EPM_PACKAGES_MANY}/_bulk`,
  BULK_UPGRADE_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_upgrade`,
  BULK_UPGRADE_INFO_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_upgrade/{taskId}`,
  BULK_UNINSTALL_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_uninstall`,
  BULK_UNINSTALL_INFO_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_uninstall/{taskId}`,
  BULK_ROLLBACK_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_rollback`,
  BULK_ROLLBACK_INFO_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_rollback/{taskId}`,
  BULK_NAMESPACE_CUSTOMIZATION_PATTERN: `${EPM_PACKAGES_MANY}/_bulk_namespace_customization`,
  LIST_PATTERN: EPM_PACKAGES_MANY,
  INSTALLED_LIST_PATTERN: EPM_PACKAGES_INSTALLED,
  LIMITED_LIST_PATTERN: `${EPM_PACKAGES_MANY}/limited`,
  INFO_WITHOUT_VERSION_PATTERN: EPM_PACKAGES_ONE_WITHOUT_VERSION,
  INFO_PATTERN: EPM_PACKAGES_ONE,
  DATA_STREAMS_PATTERN: `${EPM_API_ROOT}/data_streams`,
  INSTALL_FROM_REGISTRY_WITHOUT_VERSION_PATTERN: EPM_PACKAGES_ONE_WITHOUT_VERSION,
  INSTALL_FROM_REGISTRY_PATTERN: EPM_PACKAGES_ONE,
  INSTALL_BY_UPLOAD_PATTERN: EPM_PACKAGES_MANY,
  CUSTOM_INTEGRATIONS_PATTERN: `${EPM_API_ROOT}/custom_integrations`,
  UPDATE_CUSTOM_INTEGRATIONS_PATTERN: `${EPM_API_ROOT}/custom_integrations/{pkgName}`,
  DELETE_WITHOUT_VERSION_PATTERN: EPM_PACKAGES_ONE_WITHOUT_VERSION,
  DELETE_PATTERN: EPM_PACKAGES_ONE,
  INSTALL_KIBANA_ASSETS_PATTERN: `${EPM_PACKAGES_ONE}/kibana_assets`,
  DELETE_KIBANA_ASSETS_PATTERN: `${EPM_PACKAGES_ONE}/kibana_assets`,
  INSTALL_RULE_ASSETS_PATTERN: `${EPM_PACKAGES_ONE}/rule_assets`,
  FILEPATH_PATTERN: `${EPM_PACKAGES_ONE}/{filePath*}`,
  KNOWLEDGE_BASE_PATTERN: `${INTERNAL_ROOT}/epm/packages/{pkgName}/knowledge_base`,
  CATEGORIES_PATTERN: `${EPM_API_ROOT}/categories`,
  VERIFICATION_KEY_ID: `${EPM_API_ROOT}/verification_key_id`,
  STATS_PATTERN: `${EPM_PACKAGES_MANY}/{pkgName}/stats`,
  DEPENDENCIES_PATTERN: `${EPM_PACKAGES_MANY}/{pkgName}/{pkgVersion}/dependencies`,
  BULK_ASSETS_PATTERN: `${EPM_API_ROOT}/bulk_assets`,
  INPUTS_PATTERN: `${EPM_API_ROOT}/templates/{pkgName}/{pkgVersion}/inputs`,
  PACKAGES_DATASTREAM_ASSETS: `${EPM_API_ROOT}/packages/{pkgName}/{pkgVersion}/datastream_assets`,
  ROLLBACK_PATTERN: `${EPM_PACKAGES_MANY}/{pkgName}/rollback`,
  ROLLBACK_AVAILABLE_CHECK_PATTERN: `${INTERNAL_ROOT}/epm/packages/{pkgName}/rollback/available_check`,
  BULK_ROLLBACK_AVAILABLE_CHECK_PATTERN: `${INTERNAL_ROOT}/epm/packages/_bulk_rollback/available_check`,
  REAUTHORIZE_TRANSFORMS: `${EPM_PACKAGES_ONE}/transforms/authorize`,
  REVIEW_UPGRADE_PATTERN: `${EPM_PACKAGES_MANY}/{pkgName}/review_upgrade`,
};

// Data stream API routes
export const DATA_STREAM_API_ROUTES = {
  LIST_PATTERN: `${DATA_STREAM_API_ROOT}`,
  DEPRECATED_ILM_CHECK_PATTERN: `${INTERNAL_ROOT}/data_streams/deprecated_ilm_check`,
};

// Package policy API routes
export const PACKAGE_POLICY_API_ROUTES = {
  LIST_PATTERN: `${PACKAGE_POLICY_API_ROOT}`,
  BULK_GET_PATTERN: `${PACKAGE_POLICY_API_ROOT}/_bulk_get`,
  INFO_PATTERN: `${PACKAGE_POLICY_API_ROOT}/{packagePolicyId}`,
  CREATE_PATTERN: `${PACKAGE_POLICY_API_ROOT}`,
  UPDATE_PATTERN: `${PACKAGE_POLICY_API_ROOT}/{packagePolicyId}`,
  DELETE_PATTERN: `${PACKAGE_POLICY_API_ROOT}/delete`,
  UPGRADE_PATTERN: `${PACKAGE_POLICY_API_ROOT}/upgrade`,
  DRYRUN_PATTERN: `${PACKAGE_POLICY_API_ROOT}/upgrade/dryrun`,
  ORPHANED_INTEGRATION_POLICIES: `${INTERNAL_ROOT}/orphaned_integration_policies`,
};

// Agent policy API routes
export const AGENT_POLICY_API_ROUTES = {
  LIST_PATTERN: `${AGENT_POLICY_API_ROOT}`,
  BULK_GET_PATTERN: `${AGENT_POLICY_API_ROOT}/_bulk_get`,
  INFO_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}`,
  CREATE_PATTERN: `${AGENT_POLICY_API_ROOT}`,
  UPDATE_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}`,
  COPY_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}/copy`,
  DELETE_PATTERN: `${AGENT_POLICY_API_ROOT}/delete`,
  FULL_INFO_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}/full`,
  FULL_INFO_DOWNLOAD_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}/download`,
  LIST_OUTPUTS_PATTERN: `${AGENT_POLICY_API_ROOT}/outputs`,
  INFO_OUTPUTS_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}/outputs`,
  AUTO_UPGRADE_AGENTS_STATUS_PATTERN: `${AGENT_POLICY_API_ROOT}/{agentPolicyId}/auto_upgrade_agents_status`,
  CREATE_WITH_PACKAGE_POLICIES: `${INTERNAL_ROOT}/agent_and_package_policies`,
  CLEANUP_REVISIONS_PATTERN: `${INTERNAL_ROOT}/agent_policies/_cleanup_revisions`,
};

// Cloud Connector API routes
export const CLOUD_CONNECTOR_API_ROUTES = {
  LIST_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}`,
  INFO_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}/{cloudConnectorId}`,
  CREATE_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}`,
  UPDATE_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}/{cloudConnectorId}`,
  DELETE_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}/{cloudConnectorId}`,
  USAGE_PATTERN: `${CLOUD_CONNECTOR_API_ROOT}/{cloudConnectorId}/usage`,
};

export const CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT = `${API_ROOT}/cloud_onboarding_deployments`;

export const CLOUD_ONBOARDING_DEPLOYMENT_API_ROUTES = {
  CREATE_PATTERN: CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT,
  INFO_PATTERN: `${CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT}/{id}`,
  BY_CONNECTOR_PATTERN: `${CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT}/connector/{connectorId}`,
  UPDATE_PATTERN: `${CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT}/{id}`,
  DELETE_PATTERN: `${CLOUD_ONBOARDING_DEPLOYMENT_API_ROOT}/{id}`,
};

// Kubernetes Manifest API routes
export const K8S_API_ROUTES = {
  K8S_DOWNLOAD_PATTERN: `${K8S_API_ROOT}/download`,
  K8S_INFO_PATTERN: `${K8S_API_ROOT}`,
};

// Output API routes
export const OUTPUT_API_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/outputs`,
  INFO_PATTERN: `${API_ROOT}/outputs/{outputId}`,
  UPDATE_PATTERN: `${API_ROOT}/outputs/{outputId}`,
  DELETE_PATTERN: `${API_ROOT}/outputs/{outputId}`,
  CREATE_PATTERN: `${API_ROOT}/outputs`,
  GET_OUTPUT_HEALTH_PATTERN: `${API_ROOT}/outputs/{outputId}/health`,
  LOGSTASH_API_KEY_PATTERN: `${API_ROOT}/logstash_api_keys`,
};

// Fleet server API routes
export const FLEET_SERVER_HOST_API_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/fleet_server_hosts`,
  CREATE_PATTERN: `${API_ROOT}/fleet_server_hosts`,
  INFO_PATTERN: `${API_ROOT}/fleet_server_hosts/{itemId}`,
  UPDATE_PATTERN: `${API_ROOT}/fleet_server_hosts/{itemId}`,
  DELETE_PATTERN: `${API_ROOT}/fleet_server_hosts/{itemId}`,
  POLICY_STATUS_PATTERN: `${API_ROOT}/fleet_server_policy_status`,
};

export const FLEET_PROXY_API_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/proxies`,
  CREATE_PATTERN: `${API_ROOT}/proxies`,
  INFO_PATTERN: `${API_ROOT}/proxies/{itemId}`,
  UPDATE_PATTERN: `${API_ROOT}/proxies/{itemId}`,
  DELETE_PATTERN: `${API_ROOT}/proxies/{itemId}`,
};

// Settings API routes
export const SETTINGS_API_ROUTES = {
  INFO_PATTERN: `${API_ROOT}/settings`,
  UPDATE_PATTERN: `${API_ROOT}/settings`,
  ENROLLMENT_INFO_PATTERN: `${INTERNAL_ROOT}/settings/enrollment`,
  SPACE_INFO_PATTERN: `${API_ROOT}/space_settings`,
  SPACE_UPDATE_PATTERN: `${API_ROOT}/space_settings`,
};

// App API routes
export const APP_API_ROUTES = {
  HEALTH_CHECK_PATTERN: `${API_ROOT}/health_check`,
  CHECK_PERMISSIONS_PATTERN: `${API_ROOT}/check-permissions`,
  GENERATE_SERVICE_TOKEN_PATTERN: `${API_ROOT}/service_tokens`,
  AGENT_POLICIES_SPACES: `${INTERNAL_ROOT}/agent_policies_spaces`,
  SPACE_AWARENESS_MIGRATION: `${INTERNAL_ROOT}/enable_space_awareness`,
};

// Agent API routes
export const AGENT_API_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/agents`,
  INFO_PATTERN: `${API_ROOT}/agents/{agentId}`,
  UPDATE_PATTERN: `${API_ROOT}/agents/{agentId}`,
  EFFECTIVE_CONFIG_PATTERN: `${API_ROOT}/agents/{agentId}/effective_config`,
  BULK_UPDATE_AGENT_TAGS_PATTERN: `${API_ROOT}/agents/bulk_update_agent_tags`,
  DELETE_PATTERN: `${API_ROOT}/agents/{agentId}`,
  CHECKIN_PATTERN: `${API_ROOT}/agents/{agentId}/checkin`,
  ACKS_PATTERN: `${API_ROOT}/agents/{agentId}/acks`,
  ACTIONS_PATTERN: `${API_ROOT}/agents/{agentId}/actions`,
  MIGRATE_PATTERN: `${API_ROOT}/agents/{agentId}/migrate`,
  BULK_MIGRATE_PATTERN: `${API_ROOT}/agents/bulk_migrate`,
  CANCEL_ACTIONS_PATTERN: `${API_ROOT}/agents/actions/{actionId}/cancel`,
  UNENROLL_PATTERN: `${API_ROOT}/agents/{agentId}/unenroll`,
  BULK_UNENROLL_PATTERN: `${API_ROOT}/agents/bulk_unenroll`,
  REMOVE_COLLECTOR_PATTERN: `${API_ROOT}/agents/{agentId}/remove_collector`,
  BULK_REMOVE_COLLECTORS_PATTERN: `${API_ROOT}/agents/bulk_remove_collectors`,
  REASSIGN_PATTERN: `${API_ROOT}/agents/{agentId}/reassign`,
  BULK_REASSIGN_PATTERN: `${API_ROOT}/agents/bulk_reassign`,
  REQUEST_DIAGNOSTICS_PATTERN: `${API_ROOT}/agents/{agentId}/request_diagnostics`,
  BULK_REQUEST_DIAGNOSTICS_PATTERN: `${API_ROOT}/agents/bulk_request_diagnostics`,
  AVAILABLE_VERSIONS_PATTERN: `${API_ROOT}/agents/available_versions`,
  STATUS_PATTERN: `${API_ROOT}/agent_status`,
  DATA_PATTERN: `${API_ROOT}/agent_status/data`,
  UPGRADE_PATTERN: `${API_ROOT}/agents/{agentId}/upgrade`,
  BULK_UPGRADE_PATTERN: `${API_ROOT}/agents/bulk_upgrade`,
  ACTION_STATUS_PATTERN: `${API_ROOT}/agents/action_status`,
  LIST_TAGS_PATTERN: `${API_ROOT}/agents/tags`,
  LIST_UPLOADS_PATTERN: `${API_ROOT}/agents/{agentId}/uploads`,
  GET_UPLOAD_FILE_PATTERN: `${API_ROOT}/agents/files/{fileId}/{fileName}`,
  DELETE_UPLOAD_FILE_PATTERN: `${API_ROOT}/agents/files/{fileId}`,
  PRIVILEGE_LEVEL_CHANGE_PATTERN: `${API_ROOT}/agents/{agentId}/privilege_level_change`,
  BULK_PRIVILEGE_LEVEL_CHANGE_PATTERN: `${API_ROOT}/agents/bulk_privilege_level_change`,
  ROLLBACK_PATTERN: `${API_ROOT}/agents/{agentId}/rollback`,
  BULK_ROLLBACK_PATTERN: `${API_ROOT}/agents/bulk_rollback`,
  GENERATE_REPORT_PATTERN: `${INTERNAL_ROOT}/agents/reporting/generate`,
};

export const AGENTLESS_POLICIES_ROUTES = {
  CREATE_PATTERN: `${API_ROOT}/agentless_policies`,
  DELETE_PATTERN: `${API_ROOT}/agentless_policies/{policyId}`,
  SYNC_PATTERN: `${INTERNAL_ROOT}/agentless_policies/_sync`,
  BULK_THROUGHPUT_PATTERN: `${INTERNAL_ROOT}/agentless_policies/bulk_throughput`,
};

export const ENROLLMENT_API_KEY_ROUTES = {
  CREATE_PATTERN: `${API_ROOT}/enrollment_api_keys`,
  LIST_PATTERN: `${API_ROOT}/enrollment_api_keys`,
  INFO_PATTERN: `${API_ROOT}/enrollment_api_keys/{keyId}`,
  DELETE_PATTERN: `${API_ROOT}/enrollment_api_keys/{keyId}`,
  BULK_DELETE_PATTERN: `${API_ROOT}/enrollment_api_keys/_bulk_delete`,
};

export const UNINSTALL_TOKEN_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/uninstall_tokens`,
  INFO_PATTERN: `${API_ROOT}/uninstall_tokens/{uninstallTokenId}`,
};

// Agents setup API routes
export const AGENTS_SETUP_API_ROUTES = {
  INFO_PATTERN: `${API_ROOT}/agents/setup`,
  CREATE_PATTERN: `${API_ROOT}/agents/setup`,
};

// Message signing service
export const MESSAGE_SIGNING_SERVICE_API_ROUTES = {
  ROTATE_KEY_PAIR: `${API_ROOT}/message_signing_service/rotate_key_pair`,
};

export const SETUP_API_ROUTE = `${API_ROOT}/setup`;

export const INSTALL_SCRIPT_API_ROUTES = `${API_ROOT}/install/{osType}`;

// Policy preconfig API routes
export const PRECONFIGURATION_API_ROUTES = {
  RESET_PATTERN: `${INTERNAL_ROOT}/reset_preconfigured_agent_policies`,
  RESET_ONE_PATTERN: `${INTERNAL_ROOT}/reset_preconfigured_agent_policies/{agentPolicyId}`,
};

// Agent download source routes
export const DOWNLOAD_SOURCE_API_ROUTES = {
  LIST_PATTERN: `${API_ROOT}/agent_download_sources`,
  INFO_PATTERN: `${API_ROOT}/agent_download_sources/{sourceId}`,
  CREATE_PATTERN: `${API_ROOT}/agent_download_sources`,
  UPDATE_PATTERN: `${API_ROOT}/agent_download_sources/{sourceId}`,
  DELETE_PATTERN: `${API_ROOT}/agent_download_sources/{sourceId}`,
};

export const REMOTE_SYNCED_INTEGRATIONS_API_ROUTES = {
  STATUS_PATTERN: `${API_ROOT}/remote_synced_integrations/status`,
  INFO_PATTERN: `${API_ROOT}/remote_synced_integrations/{outputId}/remote_status`,
};

export const CREATE_STANDALONE_AGENT_API_KEY_ROUTE = `${INTERNAL_ROOT}/create_standalone_agent_api_key`;
export const CREATE_MANAGED_OTLP_API_KEY_ROUTE = `${INTERNAL_ROOT}/create_managed_otlp_api_key`;

// Fleet debug routes
export const FLEET_DEBUG_ROUTES = {
  INDEX_PATTERN: `${INTERNAL_ROOT}/debug/index`,
  SAVED_OBJECTS_PATTERN: `${INTERNAL_ROOT}/debug/saved_objects`,
  SAVED_OBJECT_NAMES_PATTERN: `${INTERNAL_ROOT}/debug/saved_object_names`,
};

// API versioning constants
export const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v1: '1',
  },
};

export const PUBLIC_API_ACCESS = 'public';
export const INTERNAL_API_ACCESS = 'internal';
